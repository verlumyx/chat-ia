import { NextResponse } from "next/server";
import { dequeueNextEvent, processQueueItem, reconcileQueue } from "@/lib/queue";

export const runtime = "nodejs";
export const maxDuration = 60; // Hasta 60 segundos permitidos en Vercel para procesar lotes

/**
 * Función común de procesamiento por lote para Vercel Cron (GET) o llamadas API (POST)
 */
async function handleProcess(req: Request) {
  const { searchParams } = new URL(req.url);
  const secretParam = searchParams.get("secret");
  const authHeader = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  // Verificación de seguridad: compatible con Vercel Cron (header Bearer) y pings externos (?secret=...)
  if (expectedSecret) {
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    const isAuthorized = bearerToken === expectedSecret || secretParam === expectedSecret;

    if (!isAuthorized) {
      console.warn("⚠️ [Worker API] Intento de acceso no autorizado al worker.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const batchSize = Math.min(Math.max(parseInt(searchParams.get("batch") || "5", 10), 1), 20);
  const shouldReconcile = searchParams.get("reconcile") !== "false";

  let processedCount = 0;
  const results: Array<{ id: number; event_id: string; success: boolean; error?: string }> = [];

  // 1. Procesar lote de eventos pendientes o reintentos con backoff cumplido
  for (let i = 0; i < batchSize; i++) {
    const item = await dequeueNextEvent();
    if (!item) break;

    const res = await processQueueItem(item);
    results.push({
      id: item.id,
      event_id: item.event_id,
      success: res.success,
      error: res.error,
    });
    processedCount++;
  }

  // 2. Ejecutar reconciliación de seguridad (rescate de zombies y reporte de métricas)
  let reconciliation = null;
  if (shouldReconcile) {
    try {
      reconciliation = await reconcileQueue(10);
    } catch (recErr) {
      console.warn("⚠️ [Worker API] Error en reconciliación:", recErr);
    }
  }

  return NextResponse.json({
    status: "success",
    timestamp: new Date().toISOString(),
    processedCount,
    results,
    reconciliation,
  });
}

/**
 * Vercel Cron invoca endpoints usando el método GET
 */
export async function GET(req: Request) {
  return handleProcess(req);
}

/**
 * Soportar POST para invocaciones manuales, curl o webhooks
 */
export async function POST(req: Request) {
  return handleProcess(req);
}
