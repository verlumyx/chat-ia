import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { GeminiEmbeddings } from "../src/lib/embeddings";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";

// Cargar variables de entorno igual que Next.js (.env.local, .env)
loadEnvConfig(process.cwd());

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function checkEnv() {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY === "tu_key_de_gemini") {
    missing.push("GOOGLE_API_KEY (debe ser una clave válida de Google AI Studio)");
  }

  if (missing.length > 0) {
    console.error("\n❌ Error: Faltan variables de entorno requeridas en .env / .env.local:");
    missing.forEach((v) => console.error(`   - ${v}`));
    console.error(
      "\n💡 Para conseguir tu GOOGLE_API_KEY gratuita, ingresa a: https://aistudio.google.com/app/apikey\n"
    );
    process.exit(1);
  }
}

/**
 * Lee recursivamente todos los archivos .md en un directorio y sus subdirectorios
 */
async function obtenerArchivosMarkdown(dir: string): Promise<string[]> {
  const entradas = await fs.readdir(dir, { withFileTypes: true });
  const archivos: string[] = [];

  for (const entrada of entradas) {
    const rutaCompleta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      const subArchivos = await obtenerArchivosMarkdown(rutaCompleta);
      archivos.push(...subArchivos);
    } else if (entrada.isFile() && entrada.name.endsWith(".md")) {
      archivos.push(rutaCompleta);
    }
  }

  return archivos;
}

async function cargarArchivosMarkdown(directorio: string): Promise<Document[]> {
  const archivosMd = await obtenerArchivosMarkdown(directorio);

  if (archivosMd.length === 0) {
    throw new Error(`No se encontraron archivos .md en el directorio ${directorio}`);
  }

  const documentos: Document[] = [];

  for (const rutaCompleta of archivosMd) {
    const contenido = await fs.readFile(rutaCompleta, "utf8");
    const nombreArchivo = path.basename(rutaCompleta);

    documentos.push(
      new Document({
        pageContent: contenido,
        metadata: {
          source: nombreArchivo,
          path: path.relative(process.cwd(), rutaCompleta),
        },
      })
    );
  }

  return documentos;
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const shouldClear = process.argv.includes("--clear");

  console.log("🚀 Iniciando proceso de ingesta RAG (Fase 1)...");
  if (isDryRun) {
    console.log("ℹ️  Modo --dry-run activado: Se probará lectura y troceado sin conectar a APIs.\n");
  } else {
    checkEnv();
  }

  const dataDir = path.join(process.cwd(), "data");
  console.log(`📁 Leyendo documentos Markdown desde: ${dataDir}`);
  const docsOriginales = await cargarArchivosMarkdown(dataDir);
  console.log(`📄 Se encontraron y cargaron ${docsOriginales.length} archivo(s) Markdown.`);

  // 1. Trocear documentos
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 150,
  });

  const chunks = await splitter.splitDocuments(docsOriginales);
  console.log(`✂️  Documentos divididos en ${chunks.length} fragmentos (chunks).`);

  if (isDryRun) {
    console.log("\n✅ [DRY RUN] Simulación finalizada exitosamente.");
    console.log(`   - Archivos procesados: ${docsOriginales.length}`);
    console.log(`   - Chunks generados: ${chunks.length}`);
    console.log(`   - Tamaño promedio de chunk: ~${Math.round(chunks.reduce((acc, c) => acc + c.pageContent.length, 0) / chunks.length)} caracteres`);
    return;
  }

  // 2. Conectar a Supabase
  const client = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  // Si se pasa --clear, limpiar la tabla previa
  if (shouldClear) {
    console.log("\n🧹 Bandera --clear detectada: Vaciando tabla 'documents'...");
    const { error: clearError } = await client.from("documents").delete().not("id", "is", null);
    if (clearError) {
      console.warn("⚠️  Aviso al vaciar tabla:", clearError.message);
    } else {
      console.log("✅ Tabla 'documents' vaciada correctamente.");
    }
  }

  // 3. Generar embeddings y subir a Supabase en lotes
  console.log("\n🧠 Inicializando embeddings con Gemini (gemini-embedding-001 - 768 dims)...");
  const embeddings = new GeminiEmbeddings({
    apiKey: GOOGLE_API_KEY,
    dimensions: 768,
  });

  const vectorStore = new SupabaseVectorStore(embeddings, {
    client,
    tableName: "documents",
    queryName: "match_documents",
  });

  const BATCH_SIZE = 50;
  const totalLotes = Math.ceil(chunks.length / BATCH_SIZE);
  console.log(`📦 Subiendo ${chunks.length} fragmentos en ${totalLotes} lotes de máximo ${BATCH_SIZE} elementos...\n`);

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const lote = chunks.slice(i, i + BATCH_SIZE);
    const nroLote = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`⏳ Subiendo lote ${nroLote}/${totalLotes} (${lote.length} fragmentos)...`);
    await vectorStore.addDocuments(lote);
  }

  console.log(`\n🎉 Ingesta completada con éxito: ${chunks.length} fragmentos almacenados en Supabase.`);
}

main().catch((err) => {
  console.error("\n❌ Error inesperado durante la ingesta:", err);
  process.exit(1);
});
