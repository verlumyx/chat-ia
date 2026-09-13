import { getSupabaseClient } from "./rag";
import { preguntar } from "./rag";
import { sendWhatsAppMessage } from "./whatsapp";

export type QueueItemStatus = "pending" | "processing" | "completed" | "failed" | "dlq";

export interface QueueItem {
  id: number;
  event_id: string;
  provider: string;
  from_number: string;
  payload: Record<string, unknown>;
  status: QueueItemStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_retry_at: string;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

export interface EnqueueResult {
  success: boolean;
  isDuplicate: boolean;
  item?: QueueItem;
  error?: string;
}

// Almacén en memoria de respaldo si la tabla 'webhook_queue' aún no ha sido creada en Supabase
const memoryQueue: QueueItem[] = [];
let memoryIdCounter = 1;

/**
 * Encola un evento de webhook en la tabla persistente de Supabase.
 * Principios de docs/cola.md:
 * - Desacople: El webhook guarda aquí y responde 200 inmediatamente.
 * - Durabilidad: Persistente en base de datos.
 * - Idempotencia: Deduplicación por event_id único.
 */
export async function enqueueEvent({
  eventId,
  fromNumber,
  payload,
  provider = "whatsapp",
}: {
  eventId: string;
  fromNumber: string;
  payload: Record<string, unknown>;
  provider?: string;
}): Promise<EnqueueResult> {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from("webhook_queue")
      .insert({
        event_id: eventId,
        provider,
        from_number: fromNumber,
        payload,
        status: "pending",
        attempts: 0,
        max_attempts: 3,
        next_retry_at: now,
      })
      .select()
      .single();

    if (error) {
      // 1. Idempotencia en Postgres (código 23505: clave única duplicada)
      if (error.code === "23505" || error.message.includes("duplicate key")) {
        console.log(`ℹ️ [Queue] Evento ${eventId} ya registrado previamente (Idempotencia DB).`);
        return { success: true, isDuplicate: true };
      }

      // 2. Si la tabla aún no existe en Supabase (PGRST205), activar fallback en memoria
      if (error.code === "PGRST205") {
        console.warn(
          `⚠️ [Queue] La tabla 'webhook_queue' no existe en Supabase aún. Usando cola en memoria temporal. (Ejecuta scripts/crear-tabla-cola.sql en Supabase para durabilidad total).`
        );

        const existing = memoryQueue.find((i) => i.event_id === eventId);
        if (existing) {
          return { success: true, isDuplicate: true };
        }

        const newItem: QueueItem = {
          id: memoryIdCounter++,
          event_id: eventId,
          provider,
          from_number: fromNumber,
          payload,
          status: "pending",
          attempts: 0,
          max_attempts: 3,
          last_error: null,
          next_retry_at: now,
          created_at: now,
          updated_at: now,
          processed_at: null,
        };
        memoryQueue.push(newItem);
        return { success: true, isDuplicate: false, item: newItem };
      }

      console.error(`❌ [Queue] Error al insertar en webhook_queue:`, error);
      return { success: false, isDuplicate: false, error: error.message };
    }

    console.log(`📥 [Queue] Evento ${eventId} encolado exitosamente con ID ${data.id}.`);
    return { success: true, isDuplicate: false, item: data as QueueItem };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error(`❌ [Queue] Excepción inesperada encolando evento:`, err);
    return { success: false, isDuplicate: false, error: message };
  }
}

/**
 * Obtiene el siguiente trabajo pendiente de la cola.
 * Utiliza la función PostgreSQL dequeue_webhook_event (FOR UPDATE SKIP LOCKED)
 * con fallback a consulta estándar o cola en memoria.
 */
export async function dequeueNextEvent(): Promise<QueueItem | null> {
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();

  try {
    // 1. Intentar desencolar con función RPC SKIP LOCKED
    const { data: rpcData, error: rpcError } = await supabase.rpc("dequeue_webhook_event");

    if (!rpcError && rpcData && rpcData.length > 0) {
      return rpcData[0] as QueueItem;
    }

    // 2. Fallback si el RPC no está creado
    if (rpcError && (rpcError.code === "PGRST202" || rpcError.code === "PGRST205")) {
      if (rpcError.code === "PGRST205") {
        // Fallback en memoria
        const item = memoryQueue.find(
          (i) =>
            (i.status === "pending" || (i.status === "failed" && i.attempts < i.max_attempts)) &&
            i.next_retry_at <= nowIso
        );
        if (item) {
          item.status = "processing";
          item.updated_at = nowIso;
          return { ...item };
        }
        return null;
      }

      // Consulta directa con actualización
      const { data: candidates, error: selectError } = await supabase
        .from("webhook_queue")
        .select("*")
        .or(`status.eq.pending,and(status.eq.failed,attempts.lt.max_attempts)`)
        .lte("next_retry_at", nowIso)
        .order("created_at", { ascending: true })
        .limit(1);

      if (selectError || !candidates || candidates.length === 0) {
        return null;
      }

      const candidate = candidates[0] as QueueItem;

      const { data: updated, error: updateError } = await supabase
        .from("webhook_queue")
        .update({
          status: "processing",
          updated_at: nowIso,
        })
        .eq("id", candidate.id)
        .eq("status", candidate.status) // Bloqueo optimista
        .select()
        .single();

      if (!updateError && updated) {
        return updated as QueueItem;
      }

      return null;
    }

    return null;
  } catch (err) {
    console.error(`❌ [Queue] Error obteniendo siguiente evento:`, err);
    return null;
  }
}

/**
 * Marca un evento como completado con éxito
 */
export async function completeEvent(id: number): Promise<void> {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  // Actualizar en memoria si existe
  const memItem = memoryQueue.find((i) => i.id === id);
  if (memItem) {
    memItem.status = "completed";
    memItem.processed_at = now;
    memItem.updated_at = now;
    memItem.last_error = null;
  }

  try {
    await supabase
      .from("webhook_queue")
      .update({
        status: "completed",
        processed_at: now,
        updated_at: now,
        last_error: null,
      })
      .eq("id", id);
  } catch {
    // Ignorar si la tabla no existe
  }
}

/**
 * Gestiona el fallo de un evento aplicando Backoff Exponencial o enviándolo a DLQ
 */
export async function failEvent(item: QueueItem, errorMessage: string): Promise<void> {
  const supabase = getSupabaseClient();
  const newAttempts = item.attempts + 1;
  const now = new Date();

  // Actualizar en memoria si existe
  const memItem = memoryQueue.find((i) => i.id === item.id);

  if (newAttempts >= item.max_attempts) {
    // Excedió reintentos máximos -> Enviar a Dead Letter Queue (DLQ)
    console.error(
      `☠️ [DLQ] Evento ID ${item.id} (Evento: ${item.event_id}) excedió ${item.max_attempts} intentos. Enviado a DLQ. Causa: ${errorMessage}`
    );

    if (memItem) {
      memItem.status = "dlq";
      memItem.attempts = newAttempts;
      memItem.last_error = errorMessage;
      memItem.updated_at = now.toISOString();
    }

    try {
      await supabase
        .from("webhook_queue")
        .update({
          status: "dlq",
          attempts: newAttempts,
          last_error: errorMessage,
          updated_at: now.toISOString(),
        })
        .eq("id", item.id);
    } catch {
      // Ignorar si la tabla no existe
    }
  } else {
    // Backoff exponencial: 2^attempts * 15 segundos (ej. 30s, 60s...)
    const delaySeconds = Math.pow(2, newAttempts) * 15;
    const nextRetryAt = new Date(now.getTime() + delaySeconds * 1000).toISOString();

    console.warn(
      `🔄 [Retry] Evento ID ${item.id} falló (intento ${newAttempts}/${item.max_attempts}). Reintento programado para ${nextRetryAt}. Error: ${errorMessage}`
    );

    if (memItem) {
      memItem.status = "failed";
      memItem.attempts = newAttempts;
      memItem.last_error = errorMessage;
      memItem.next_retry_at = nextRetryAt;
      memItem.updated_at = now.toISOString();
    }

    try {
      await supabase
        .from("webhook_queue")
        .update({
          status: "failed",
          attempts: newAttempts,
          last_error: errorMessage,
          next_retry_at: nextRetryAt,
          updated_at: now.toISOString(),
        })
        .eq("id", item.id);
    } catch {
      // Ignorar si la tabla no existe
    }
  }
}

/**
 * Procesa un ítem de la cola ejecutando el pipeline RAG y la respuesta de WhatsApp
 */
export async function processQueueItem(item: QueueItem): Promise<{ success: boolean; error?: string }> {
  console.log(`⚙️ [Worker] Procesando evento ID ${item.id} (${item.event_id}) de ${item.from_number}...`);

  try {
    const message = item.payload as {
      type?: string;
      text?: { body?: string };
    };

    // Mensaje de tipo no-texto
    if (message.type !== "text") {
      console.log(`ℹ️ [Worker] Mensaje no es texto (${message.type}). Enviando mensaje aclaratorio.`);
      await sendWhatsAppMessage(
        item.from_number,
        "Por los momentos solo puedo responder a preguntas en texto escrito. ¿En qué te puedo ayudar hoy?"
      );
      await completeEvent(item.id);
      return { success: true };
    }

    const userQuestion = message.text?.body?.trim();
    if (!userQuestion) {
      console.log(`ℹ️ [Worker] Mensaje de texto vacío para ID ${item.id}. Marcando completado.`);
      await completeEvent(item.id);
      return { success: true };
    }

    // 1. Invocar el cerebro RAG (LangChain + Gemini + Tools)
    const assistantReply = await preguntar(userQuestion);
    console.log(`🤖 [Worker] Respuesta generada para ${item.from_number}: "${assistantReply.slice(0, 80)}..."`);

    // 2. Enviar respuesta por WhatsApp (Meta Cloud API)
    const sendResult = await sendWhatsAppMessage(item.from_number, assistantReply);
    if (!sendResult.success) {
      throw new Error(`Fallo al enviar por WhatsApp Cloud API: ${sendResult.error}`);
    }

    // 3. Persistir en tabla 'conversaciones'
    try {
      const supabase = getSupabaseClient();
      await supabase.from("conversaciones").insert([
        { user_id: item.from_number, role: "user", content: userQuestion },
        { user_id: item.from_number, role: "assistant", content: assistantReply },
      ]);
    } catch (dbErr) {
      console.warn(`⚠️ [Worker] No se pudo registrar en tabla conversaciones:`, dbErr);
    }

    // 4. Marcar como completado
    await completeEvent(item.id);
    console.log(`✅ [Worker] Evento ID ${item.id} finalizado exitosamente.`);
    return { success: true };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Error desconocido al procesar evento";
    console.error(`❌ [Worker] Error procesando evento ID ${item.id}:`, errorMsg);
    await failEvent(item, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Reconciliación periódica (Health Check & Reconciler):
 * 1. Resetea eventos 'processing' huérfanos cuyo worker murió (ej. > 10 min de inactividad).
 * 2. Reporta métricas de la cola (pendientes, en proceso, fallidos, en DLQ).
 */
export async function reconcileQueue(stuckThresholdMinutes: number = 10) {
  const supabase = getSupabaseClient();
  const thresholdDate = new Date(Date.now() - stuckThresholdMinutes * 60 * 1000).toISOString();

  let resetCount = 0;
  const metrics: Record<QueueItemStatus, number> = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    dlq: 0,
  };

  try {
    // 1. Buscar y resetear eventos atascados (zombies)
    const { data: stuckItems, error: stuckError } = await supabase
      .from("webhook_queue")
      .select("id, attempts, max_attempts")
      .eq("status", "processing")
      .lte("updated_at", thresholdDate);

    if (!stuckError && stuckItems && stuckItems.length > 0) {
      for (const item of stuckItems) {
        await failEvent(
          item as QueueItem,
          `Reconciliación: evento detectado atascado en 'processing' por >${stuckThresholdMinutes}m.`
        );
        resetCount++;
      }
    }

    // 2. Obtener métricas por estado
    const { data: allStatuses, error: metricError } = await supabase
      .from("webhook_queue")
      .select("status");

    if (!metricError && allStatuses) {
      for (const row of allStatuses) {
        const s = row.status as QueueItemStatus;
        if (metrics[s] !== undefined) {
          metrics[s]++;
        }
      }
      return { resetCount, metrics };
    }
  } catch {
    // Fallback a memoria si la tabla no está en Supabase
  }

  // Si usamos memoria de respaldo
  for (const item of memoryQueue) {
    if (item.status === "processing" && item.updated_at <= thresholdDate) {
      await failEvent(
        item,
        `Reconciliación: evento detectado atascado en 'processing' por >${stuckThresholdMinutes}m.`
      );
      resetCount++;
    }
    metrics[item.status]++;
  }

  return {
    resetCount,
    metrics,
  };
}
