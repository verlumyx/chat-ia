import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { VectorStoreRetriever } from "@langchain/core/vectorstores";
import { Document } from "@langchain/core/documents";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { GeminiEmbeddings } from "./embeddings";

let supabaseClient: SupabaseClient | null = null;
let cachedVectorStore: SupabaseVectorStore | null = null;
let cachedRetriever: VectorStoreRetriever<SupabaseVectorStore> | null = null;
let cachedLlm: ChatGoogleGenerativeAI | null = null;

/**
 * Retorna el cliente de Supabase configurado con la clave de servicio
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Faltan variables de entorno requeridas: SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY."
      );
    }

    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

/**
 * Retorna la instancia de SupabaseVectorStore conectada al índice existente (Fase 2)
 */
export function getVectorStore(): SupabaseVectorStore {
  if (!cachedVectorStore) {
    const client = getSupabaseClient();
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      throw new Error("Falta la variable de entorno requerida: GOOGLE_API_KEY.");
    }

    const embeddings = new GeminiEmbeddings({
      apiKey,
      dimensions: 768,
    });

    cachedVectorStore = new SupabaseVectorStore(embeddings, {
      client,
      tableName: "documents",
      queryName: "match_documents",
    });
  }
  return cachedVectorStore;
}

/**
 * Crea o retorna un Retriever con el número de fragmentos especificado (por defecto 4)
 */
export function getRetriever(k = 4): VectorStoreRetriever<SupabaseVectorStore> {
  if (k === 4 && cachedRetriever) {
    return cachedRetriever;
  }

  const store = getVectorStore();
  const newRetriever = store.asRetriever(k);

  if (k === 4) {
    cachedRetriever = newRetriever;
  }

  return newRetriever;
}

/**
 * Instancia de retriever lista para invocar (.invoke) según la especificación de la Fase 2
 */
export const retriever: VectorStoreRetriever<SupabaseVectorStore> = new Proxy(
  {} as VectorStoreRetriever<SupabaseVectorStore>,
  {
    get(target, prop, receiver) {
      const instance = getRetriever(4);
      const value = Reflect.get(instance, prop, receiver);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  }
);

/**
 * Helper para consultar documentos relevantes de forma directa
 */
export async function buscarDocumentos(
  query: string,
  k = 4
): Promise<Document[]> {
  const customRetriever = getRetriever(k);
  return customRetriever.invoke(query);
}

/**
 * Instancia del modelo de chat Gemini (Fase 3)
 */
export function getLlm(): ChatGoogleGenerativeAI {
  if (!cachedLlm) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("Falta la variable de entorno requerida: GOOGLE_API_KEY.");
    }
    cachedLlm = new ChatGoogleGenerativeAI({
      model: "gemini-3.6-flash",
      apiKey,
      temperature: 0,
    });
  }
  return cachedLlm;
}

/**
 * Prompt RAG estricto para responder únicamente con el contexto de los documentos
 */
export const ragPrompt = ChatPromptTemplate.fromTemplate(`
Eres un asistente corporativo de soporte y políticas internas.
Responde a la pregunta en español usando ÚNICAMENTE el contexto provisto abajo.
Si la información no se encuentra en el contexto, di claramente: "No encuentro esa información en los documentos."
No inventes datos ni asumas políticas que no estén explícitas.

Contexto:
{context}

Pregunta: {question}
`);

/**
 * Función central de RAG (Fase 3): recupera contexto de Supabase y responde con Gemini
 */
export async function preguntar(question: string): Promise<string> {
  const docs = await retriever.invoke(question);
  const context = docs.map((d) => d.pageContent).join("\n\n");
  const chain = RunnableSequence.from([ragPrompt, getLlm(), new StringOutputParser()]);
  return chain.invoke({ context, question });
}

/**
 * Versión con streaming de la función preguntar para Next.js (Fase 5)
 */
export async function streamPreguntar(
  question: string
): Promise<ReadableStream<Uint8Array>> {
  const docs = await retriever.invoke(question);
  const context = docs.map((d) => d.pageContent).join("\n\n");
  const chain = RunnableSequence.from([ragPrompt, getLlm(), new StringOutputParser()]);
  const stream = await chain.stream({ context, question });

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
