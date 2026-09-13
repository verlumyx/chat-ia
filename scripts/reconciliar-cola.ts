import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { reconcileQueue } from "../src/lib/queue";
import { getSupabaseClient } from "../src/lib/rag";

async function main() {
  console.log("==================================================");
  console.log("🔍 [Reconciliador & Health Check de Cola]");
  console.log("Principio: Reconciliación (Pull) como red de seguridad");
  console.log("==================================================\n");

  const stuckThresholdMinutes = 10;
  console.log(`1️⃣ Buscando eventos huérfanos/atascados en 'processing' (> ${stuckThresholdMinutes}m)...`);

  const { resetCount, metrics } = await reconcileQueue(stuckThresholdMinutes);

  if (resetCount > 0) {
    console.log(`   ⚠️ Se detectaron y reiniciaron ${resetCount} eventos zombi en 'processing'.`);
  } else {
    console.log("   ✅ No hay eventos huérfanos atascados en procesamiento.\n");
  }

  console.log("2️⃣ Métricas actuales de la cola de webhooks:");
  console.log(`   - ⏳ Pendientes (pending):     ${metrics.pending}`);
  console.log(`   - ⚙️ En proceso (processing):   ${metrics.processing}`);
  console.log(`   - ✅ Completados (completed):   ${metrics.completed}`);
  console.log(`   - 🔄 Con reintento (failed):    ${metrics.failed}`);
  console.log(`   - ☠️ Dead Letter Queue (dlq):   ${metrics.dlq}\n`);

  // Inspección detallada de la DLQ
  if (metrics.dlq > 0) {
    console.log("3️⃣ Inspección de eventos en Dead Letter Queue (DLQ):");
    const supabase = getSupabaseClient();
    const { data: dlqItems, error } = await supabase
      .from("webhook_queue")
      .select("id, event_id, from_number, attempts, last_error, created_at, updated_at")
      .eq("status", "dlq")
      .order("updated_at", { ascending: false })
      .limit(5);

    if (!error && dlqItems) {
      for (const item of dlqItems) {
        console.log(`   - ID: ${item.id} | Evento: ${item.event_id} | De: ${item.from_number} | Intentos: ${item.attempts}`);
        console.log(`     Error: "${item.last_error}"`);
        console.log(`     Fecha fallo: ${item.updated_at}\n`);
      }
    }
  } else {
    console.log("3️⃣ Estado de DLQ: Limpio (0 fallos definitivos). ✅\n");
  }

  console.log("==================================================");
  console.log("🎉 Reconciliación completada con éxito.");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("❌ Error en script de reconciliación:", err);
  process.exit(1);
});
