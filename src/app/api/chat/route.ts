import { NextRequest, NextResponse } from "next/server";
import { preguntar, streamPreguntar } from "@/lib/rag";

export const runtime = "nodejs"; // Requerido para LangChain y Supabase

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  mensaje?: string;
  messages?: ChatMessage[];
  stream?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestBody;

    // Extraer la pregunta tanto del formato `{ mensaje }` (Fase 4)
    // como de `{ messages }` (UI React de la Fase 5)
    let pregunta = (body.mensaje || "").trim();

    if (!pregunta && Array.isArray(body.messages)) {
      const lastUser = [...body.messages]
        .reverse()
        .find((m) => m.role === "user");
      pregunta = (lastUser?.content || "").trim();
    }

    if (!pregunta) {
      return NextResponse.json(
        { error: "Se requiere un mensaje o pregunta válida." },
        { status: 400 }
      );
    }

    // Si se solicita streaming explícito (o viene del chat web con array messages y sin stream=false)
    const wantsStream = body.stream === true || (Array.isArray(body.messages) && body.stream !== false);

    if (wantsStream) {
      const stream = await streamPreguntar(pregunta);
      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }

    // Respuesta JSON directa (Fase 4 estándar)
    const respuesta = await preguntar(pregunta);
    return NextResponse.json({ respuesta });
  } catch (error) {
    console.error("Error en /api/chat:", error);
    const mensajeError =
      error instanceof Error ? error.message : "Error interno del servidor";
    return NextResponse.json(
      { error: "Error al procesar la consulta", details: mensajeError },
      { status: 500 }
    );
  }
}
