import { NextRequest } from "next/server";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
}

/**
 * Respuesta mock con streaming.
 *
 * Por ahora genera una respuesta de ejemplo y la envía token a token para
 * imitar la experiencia de Claude/ChatGPT. Para conectar un modelo real,
 * reemplaza `buildMockReply` por una llamada al SDK del proveedor y reenvía
 * su stream a este `ReadableStream`.
 */
export async function POST(req: NextRequest) {
  let body: ChatRequestBody;

  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response("Cuerpo de la petición inválido", { status: 400 });
  }

  const lastUserMessage = [...(body.messages ?? [])]
    .reverse()
    .find((m) => m.role === "user");

  const reply = buildMockReply(lastUserMessage?.content ?? "");
  const tokens = reply.match(/\S+\s*/g) ?? [reply];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const token of tokens) {
        controller.enqueue(encoder.encode(token));
        await delay(25);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

function buildMockReply(userText: string): string {
  const trimmed = userText.trim();

  if (!trimmed) {
    return "¡Hola! Escríbeme algo y te responderé.";
  }

  return [
    `Recibí tu mensaje: “${trimmed}”.`,
    "",
    "Esta es una respuesta de ejemplo generada localmente con streaming. ",
    "Todavía no estoy conectado a un modelo de IA real, pero la interfaz ya ",
    "funciona de extremo a extremo: puedes enviar mensajes, ver el historial ",
    "y recibir respuestas token a token.",
    "",
    "Cuando quieras, conectamos un modelo en `src/app/api/chat/route.ts`.",
  ].join("\n");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
