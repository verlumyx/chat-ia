import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { retriever } from "../src/lib/rag";

async function main() {
  const queryArg = process.argv.slice(2).join(" ").trim();
  const query = queryArg || "¿Cuántos días de vacaciones y días de bienestar hay?";

  console.log("🔍 Probando el Retriever RAG (Fase 2)...");
  console.log(`❓ Pregunta: "${query}"\n`);

  try {
    const startTime = Date.now();
    // Probamos la invocación directa usando el export `retriever`
    const docs = await retriever.invoke(query);
    const duration = Date.now() - startTime;

    console.log(`⏱️  Búsqueda completada en ${duration}ms.`);
    console.log(`📄 Documentos recuperados: ${docs.length}\n`);

    if (docs.length === 0) {
      console.warn("⚠️ No se encontraron documentos similares en Supabase.");
      return;
    }

    docs.forEach((doc, idx) => {
      console.log(`--- [Fragmento #${idx + 1}] ---`);
      console.log(`📌 Fuente: ${doc.metadata?.source || "desconocida"}`);
      console.log(`📁 Ruta: ${doc.metadata?.path || "N/A"}`);
      console.log(`📝 Contenido:`);
      console.log(doc.pageContent.trim());
      console.log("\n" + "=".repeat(60) + "\n");
    });

    console.log("✅ Fase 2 verificada con éxito: el retriever consulta Supabase correctamente sin re-indexar.");
  } catch (error) {
    console.error("❌ Error al probar el retriever:", error);
    process.exit(1);
  }
}

main();
