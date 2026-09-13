import { NextResponse } from "next/server";
import { preguntar, getSupabaseClient } from "@/lib/rag";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export const runtime = "nodejs";

// Cache de IDs de mensajes para garantizar idempotencia y evitar respuestas duplicadas
const processedMessageIds = new Set<string>();

/**
 * Handshake de Verificación con Meta (GET)
 * Meta envía hub.mode, hub.verify_token y hub.challenge para verificar la URL del webhook.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && expectedToken && token === expectedToken) {
    console.log("✅ [Webhook WhatsApp] Verificación exitosa de Meta.");
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  console.warn("⚠️ [Webhook WhatsApp] Intento de verificación fallido o token inválido.");
  return new Response("Forbidden", { status: 403 });
}

/**
 * Recepción y procesamiento de eventos entrantes de WhatsApp (POST)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validar estructura básica del webhook de WhatsApp Cloud API
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) {
      return NextResponse.json({ status: "ignored_empty_payload" }, { status: 200 });
    }

    // Ignorar eventos de estado de entrega o lectura (sent, delivered, read)
    if (value.statuses && (!value.messages || value.messages.length === 0)) {
      return NextResponse.json({ status: "ignored_status_update" }, { status: 200 });
    }

    const message = value.messages?.[0];
    if (!message) {
      return NextResponse.json({ status: "no_messages" }, { status: 200 });
    }

    const messageId = message.id;
    const fromNumber = message.from; // Número de teléfono del usuario

    // Control de Idempotencia: si Meta reintenta el mismo mensaje, ignoramos
    if (processedMessageIds.has(messageId)) {
      console.log(`ℹ️ [Webhook WhatsApp] Mensaje ya procesado previamente (${messageId}), ignorando.`);
      return NextResponse.json({ status: "already_processed" }, { status: 200 });
    }

    // Registrar ID procesado (con límite máximo de memoria de 500 registros)
    processedMessageIds.add(messageId);
    if (processedMessageIds.size > 500) {
      const oldestId = processedMessageIds.values().next().value;
      if (oldestId) processedMessageIds.delete(oldestId);
    }

    // Manejar mensajes que no sean texto (audio, imagen, documento, ubicación, etc.)
    if (message.type !== "text") {
      console.log(`ℹ️ [Webhook WhatsApp] Mensaje recibido de tipo '${message.type}' desde ${fromNumber}.`);
      await sendWhatsAppMessage(
        fromNumber,
        "Por los momentos solo puedo responder a preguntas en texto escrito. ¿En qué te puedo ayudar hoy?"
      );
      return NextResponse.json({ status: "non_text_message_handled" }, { status: 200 });
    }

    const userQuestion = message.text?.body?.trim();
    if (!userQuestion) {
      return NextResponse.json({ status: "empty_text" }, { status: 200 });
    }

    console.log(`📩 [WhatsApp] Mensaje de ${fromNumber}: "${userQuestion}"`);

    // 1. Invocar el cerebro RAG existente (LangChain + Gemini + Tools)
    const assistantReply = await preguntar(userQuestion);
    console.log(`🤖 [WhatsApp] Respuesta para ${fromNumber}: "${assistantReply.slice(0, 100)}..."`);

    // 2. Enviar respuesta por WhatsApp a través de la Graph API
    const sendResult = await sendWhatsAppMessage(fromNumber, assistantReply);

    if (!sendResult.success) {
      console.error(`❌ [WhatsApp] Error despachando respuesta a ${fromNumber}:`, sendResult.error);
    }

    // 3. Persistir en la tabla 'conversaciones' de Supabase (opcional / tolerante a fallos)
    try {
      const supabase = getSupabaseClient();
      await supabase.from("conversaciones").insert([
        { user_id: fromNumber, role: "user", content: userQuestion },
        { user_id: fromNumber, role: "assistant", content: assistantReply },
      ]);
    } catch (dbError) {
      console.warn("⚠️ [WhatsApp] No se pudo registrar en la tabla 'conversaciones':", dbError);
    }

    return NextResponse.json({ status: "success" }, { status: 200 });
  } catch (error: unknown) {
    console.error("❌ [Webhook WhatsApp] Error interno procesando evento:", error);
    // Responder siempre 200 a Meta para evitar bucles continuos de reintento si el error fue de parseo
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : "Error interno" },
      { status: 200 }
    );
  }
}
