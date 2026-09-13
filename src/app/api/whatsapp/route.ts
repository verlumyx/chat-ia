import { NextResponse } from "next/server";
// import { after } from "next/server"; // Descomentar si se desea procesamiento serverless en Vercel
import { enqueueEvent } from "@/lib/queue";
// import { dequeueNextEvent, processQueueItem } from "@/lib/queue"; // Descomentar para Vercel after()

export const runtime = "nodejs";

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
 * Recepción y persistencia en cola durable de eventos de WhatsApp (POST)
 * Principio de docs/cola.md: "Persistir primero, confirmar (200) después. Procesar aparte."
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Soportar tanto webhooks de producción como el simulador de pruebas de Meta
    const value = body.value || body.entry?.[0]?.changes?.[0]?.value;

    if (!value) {
      console.log("ℹ️ [Webhook WhatsApp] Payload sin 'value' detectable:", JSON.stringify(body));
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

    // 1. Guardar en almacén durable (Idempotencia + Desacople)
    const enqueueResult = await enqueueEvent({
      eventId: messageId,
      fromNumber,
      payload: message,
      provider: "whatsapp",
    });

    // Si ya existía (Idempotencia a nivel de base de datos)
    if (enqueueResult.isDuplicate) {
      console.log(`ℹ️ [Webhook WhatsApp] Mensaje duplicado detectado en DB (${messageId}), ignorando.`);
      return NextResponse.json({ status: "already_processed", event_id: messageId }, { status: 200 });
    }

    // Si falló la persistencia en DB, devolver 500 para que Meta reintente con backoff
    if (!enqueueResult.success) {
      console.error(`❌ [Webhook WhatsApp] Falló la persistencia del evento ${messageId} en cola.`);
      return NextResponse.json(
        { status: "error", message: "Error persistiendo en cola durable" },
        { status: 500 }
      );
    }

    // -------------------------------------------------------------------------
    // NOTA: Procesamiento automático de Vercel (after) comentado temporalmente.
    // El webhook únicamente encola y confirma 200 OK inmediatamente a Meta.
    // El procesamiento se realiza de forma manual y controlada en local con:
    //   npm run worker
    // Para reactivar en Vercel Serverless, descomenta el bloque siguiente:
    // -------------------------------------------------------------------------
    /*
    try {
      after(async () => {
        try {
          const item = await dequeueNextEvent();
          if (item) {
            console.log(`⚡ [Vercel after()] Procesando evento ${item.event_id} en background...`);
            await processQueueItem(item);
          }
        } catch (bgErr) {
          console.error("❌ [Vercel after()] Error en procesamiento desacoplado:", bgErr);
        }
      });
    } catch {
      console.log("ℹ️ [Webhook WhatsApp] after() omitido.");
    }
    */

    // 2. Responder 200 inmediatamente a Meta en <50ms
    return NextResponse.json(
      {
        status: "queued",
        event_id: messageId,
        queue_id: enqueueResult.item?.id,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("❌ [Webhook WhatsApp] Error interno procesando webhook:", error);
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : "Error interno" },
      { status: 400 }
    );
  }
}

