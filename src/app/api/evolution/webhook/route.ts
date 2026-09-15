import { NextResponse } from "next/server";
import { enqueueEvent } from "@/lib/queue";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log("📥 [Webhook Evolution] Payload recibido:", JSON.stringify(body, null, 2));

    const { event, instance, data, sender } = body;

    // Solo procesamos mensajes nuevos
    if (event !== "MESSAGES_UPSERT" && event !== "messages.upsert") {
      return NextResponse.json({ status: "ignored_event", event }, { status: 200 });
    }

    if (!data) {
      return NextResponse.json({ status: "ignored_empty_data" }, { status: 200 });
    }

    // Ignorar mensajes enviados por nosotros mismos (para evitar bucles)
    if (data.key?.fromMe) {
      console.log("ℹ️ [Webhook Evolution] Mensaje ignorado (fromMe: true)");
      return NextResponse.json({ status: "ignored_from_me" }, { status: 200 });
    }

    // Identificador único del mensaje
    const messageId = data.key?.id || data.messageId || crypto.randomUUID();
    
    // Extraer texto del mensaje
    let messageText = "";
    if (data.message?.conversation) {
      messageText = data.message.conversation;
    } else if (data.message?.extendedTextMessage?.text) {
      messageText = data.message.extendedTextMessage.text;
    }

    // Normalizar el objeto de payload para que sea compatible con lo que espera processQueueItem
    // processQueueItem asume el formato de Meta (message.type y message.text.body)
    const normalizedPayload = {
      type: messageText ? "text" : "other",
      text: {
        body: messageText
      },
      originalData: data
    };

    // Extraer el número del cliente de remoteJid (ignorando el de la instancia que viene en 'sender')
    let clientNumber = "unknown";
    if (data.key?.remoteJid) {
      clientNumber = data.key.remoteJid.split('@')[0];
    } else if (data.pushName) {
      // a veces el remoteJid puede no estar y estar solo en otro formato, pero remoteJid es el estándar
      clientNumber = sender || "unknown";
    }

    // 1. Guardar en almacén durable
    const enqueueResult = await enqueueEvent({
      eventId: messageId,
      fromNumber: clientNumber,
      payload: normalizedPayload,
      provider: "evolution",
    });

    // Si ya existía
    if (enqueueResult.isDuplicate) {
      console.log(`ℹ️ [Webhook Evolution] Mensaje duplicado detectado en DB (${messageId}), ignorando.`);
      return NextResponse.json({ status: "already_processed", event_id: messageId }, { status: 200 });
    }

    if (!enqueueResult.success) {
      console.error(`❌ [Webhook Evolution] Falló la persistencia del evento ${messageId} en cola.`);
      return NextResponse.json(
        { status: "error", message: "Error persistiendo en cola durable" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        status: "queued",
        event_id: messageId,
        queue_id: enqueueResult.item?.id,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("❌ [Webhook Evolution] Error interno procesando webhook:", error);
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : "Error interno" },
      { status: 400 }
    );
  }
}
