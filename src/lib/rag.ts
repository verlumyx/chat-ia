import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { VectorStoreRetriever } from "@langchain/core/vectorstores";
import { Document } from "@langchain/core/documents";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { GeminiEmbeddings } from "./embeddings";
import { consultarEmpleadosTool } from "./tools";

let supabaseClient: SupabaseClient | null = null;
let cachedVectorStore: SupabaseVectorStore | null = null;
let cachedRetriever: VectorStoreRetriever<SupabaseVectorStore> | null = null;

/**
 * Modelos disponibles en orden de prioridad para fallback automático.
 * Si un modelo agota su cuota diaria gratuita (20 req/día), el sistema
 * conmuta instantáneamente al siguiente modelo disponible sin interrumpir al usuario.
 */
export const GEMINI_MODELS = [
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
];

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
 * Retorna una instancia del modelo de chat Gemini con el modelo especificado
 */
export function getLlm(modelName: string = GEMINI_MODELS[0]): ChatGoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la variable de entorno requerida: GOOGLE_API_KEY.");
  }
  return new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey,
    temperature: 0,
  });
}

/**
 * Traduce errores crudos de Google/Gemini a mensajes claros y amigables
 */
export function formatearErrorGemini(error: unknown): string {
  const errObj = error as {
    status?: number;
    message?: string;
    errorDetails?: Array<{ retryDelay?: string }>;
  };

  const rawMsg = String(errObj?.message || "");
  const is429 =
    errObj?.status === 429 ||
    rawMsg.includes("429") ||
    rawMsg.toLowerCase().includes("quota") ||
    rawMsg.toLowerCase().includes("too many requests");

  if (is429) {
    return "⏳ Se alcanzó el límite de peticiones diarias de la cuenta gratuita en los modelos de prueba. Por favor espera un momento o asocia facturación en Google AI Studio para consultas ilimitadas.";
  }

  if (rawMsg.includes("API_KEY") || rawMsg.includes("403")) {
    return "🔑 Error con la clave de API de Gemini (GOOGLE_API_KEY). Verifica que esté configurada correctamente.";
  }

  return "⚠️ Ocurrió una pausa temporal en el servicio de IA. Por favor, intenta de nuevo en unos instantes.";
}

/**
 * Construye el mensaje de sistema combinando el contexto RAG y las instrucciones de seguridad
 */
function buildSystemMessage(documentContext: string): SystemMessage {
  return new SystemMessage(`
Eres un asistente corporativo inteligente de Novatech.
Tu función es responder preguntas de los colaboradores de manera clara, fáctica y profesional en español.

Fuentes de información a tu disposición:
1. Contexto documental oficial provisto más abajo (políticas de trabajo híbrido, vacaciones, días de bienestar, equipamiento y onboarding).
2. Herramienta 'consultar_empleados_y_roles' para buscar en la base de datos colaboradores, cargos, departamentos y salarios oficiales.

Reglas de seguridad y comportamiento:
- Si la pregunta refiere a salarios, colaboradores o puestos de trabajo, DEBES invocar la herramienta 'consultar_empleados_y_roles'.
- Si la pregunta refiere a políticas, vacaciones, onboarding o equipamiento, responde usando el contexto documental.
- REGLA ESTRICTA DE PRIVACIDAD: Si el usuario pregunta por CLIENTES, cuentas por cobrar, balances o deudas de clientes, NO TIENES ACCESO ni herramientas para consultar clientes. Responde claramente que no tienes acceso a información de clientes.
- No inventes datos que no provengan del contexto documental o del resultado de las herramientas.

Contexto Documental:
${documentContext || "No hay documentos relevantes disponibles."}
`);
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: string }).text);
        }
        return JSON.stringify(part);
      })
      .join("");
  }
  return String(content || "");
}

/**
 * Función central de RAG + Tools con conmutación por error (Fallback) entre modelos
 */
export async function preguntar(question: string): Promise<string> {
  const docs = await retriever.invoke(question).catch(() => []);
  const context = docs.map((d) => d.pageContent).join("\n\n");
  let lastError: unknown = null;

  for (const modelName of GEMINI_MODELS) {
    try {
      const llm = getLlm(modelName);
      const modelWithTools = llm.bindTools([consultarEmpleadosTool]);

      const messages: BaseMessage[] = [
        buildSystemMessage(context),
        new HumanMessage(question),
      ];

      const firstResponse = await modelWithTools.invoke(messages);

      // Si Gemini decidió llamar a la tool
      if (firstResponse.tool_calls && firstResponse.tool_calls.length > 0) {
        messages.push(firstResponse);

        for (const toolCall of firstResponse.tool_calls) {
          if (toolCall.name === "consultar_empleados_y_roles") {
            const toolResult = await consultarEmpleadosTool.invoke(toolCall.args);
            messages.push(
              new ToolMessage({
                tool_call_id: toolCall.id!,
                content:
                  typeof toolResult === "string"
                    ? toolResult
                    : JSON.stringify(toolResult),
              })
            );
          }
        }

        const finalResponse = await modelWithTools.invoke(messages);
        return extractText(finalResponse.content);
      }

      return extractText(firstResponse.content);
    } catch (err: unknown) {
      console.warn(`⚠️ Modelo ${modelName} no disponible. Intentando con siguiente modelo de respaldo...`);
      lastError = err;
      continue;
    }
  }

  console.error("Todos los modelos de respaldo de Gemini fallaron:", lastError);
  return formatearErrorGemini(lastError);
}

/**
 * Versión con streaming de la función preguntar con conmutación por error (Fallback)
 */
export async function streamPreguntar(
  question: string
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  const docs = await retriever.invoke(question).catch(() => []);
  const context = docs.map((d) => d.pageContent).join("\n\n");
  let lastError: unknown = null;

  for (const modelName of GEMINI_MODELS) {
    try {
      const llm = getLlm(modelName);
      const modelWithTools = llm.bindTools([consultarEmpleadosTool]);

      const messages: BaseMessage[] = [
        buildSystemMessage(context),
        new HumanMessage(question),
      ];

      const firstResponse = await modelWithTools.invoke(messages);

      // Si requiere tool call, ejecutamos la tool y luego transmitimos la respuesta final
      if (firstResponse.tool_calls && firstResponse.tool_calls.length > 0) {
        messages.push(firstResponse);

        for (const toolCall of firstResponse.tool_calls) {
          if (toolCall.name === "consultar_empleados_y_roles") {
            const toolResult = await consultarEmpleadosTool.invoke(toolCall.args);
            messages.push(
              new ToolMessage({
                tool_call_id: toolCall.id!,
                content:
                  typeof toolResult === "string"
                    ? toolResult
                    : JSON.stringify(toolResult),
              })
            );
          }
        }

        const stream = await modelWithTools.stream(messages);

        return new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              for await (const chunk of stream) {
                const text =
                  typeof chunk.content === "string"
                    ? chunk.content
                    : Array.isArray(chunk.content)
                    ? chunk.content
                        .map((c) => (typeof c === "string" ? c : JSON.stringify(c)))
                        .join("")
                    : "";
                if (text) {
                  controller.enqueue(encoder.encode(text));
                }
              }
              controller.close();
            } catch (err) {
              console.error("Error en stream:", err);
              controller.enqueue(encoder.encode("\n\n" + formatearErrorGemini(err)));
              controller.close();
            }
          },
        });
      }

      // Si no necesitó tool, transmitimos directamente la respuesta
      const directText =
        typeof firstResponse.content === "string"
          ? firstResponse.content
          : JSON.stringify(firstResponse.content);

      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(directText));
          controller.close();
        },
      });
    } catch (err: unknown) {
      console.warn(`⚠️ Modelo ${modelName} falló en streaming. Pasando al siguiente modelo de respaldo...`);
      lastError = err;
      continue;
    }
  }

  // Si todos los modelos fallaron
  const errorLimpio = formatearErrorGemini(lastError);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(errorLimpio));
      controller.close();
    },
  });
}
