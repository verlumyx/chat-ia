import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { dequeueNextEvent, processQueueItem } from "../src/lib/queue";

const POLL_INTERVAL_MS = 1500;
let isRunning = true;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startWorker() {
  console.log("==================================================");
  console.log("🚀 [Worker de Cola WhatsApp] Iniciado");
  console.log("📦 Desacople y procesamiento en segundo plano activo");
  console.log(`⏱️ Intervalo de sondeo: ${POLL_INTERVAL_MS}ms`);
  console.log("Presiona Ctrl+C para detener el worker de forma segura");
  console.log("==================================================\n");

  // Captura de señales para apagado limpio (Graceful Shutdown)
  process.on("SIGINT", () => {
    console.log("\n🛑 [Worker] Recibida señal SIGINT. Finalizando tareas...");
    isRunning = false;
  });

  process.on("SIGTERM", () => {
    console.log("\n🛑 [Worker] Recibida señal SIGTERM. Finalizando tareas...");
    isRunning = false;
  });

  let consecutiveEmpty = 0;

  while (isRunning) {
    try {
      const item = await dequeueNextEvent();

      if (item) {
        consecutiveEmpty = 0;
        console.log(`\n📬 [Worker] Nuevo evento recibido de la cola (ID: ${item.id}, Evento: ${item.event_id})`);
        const result = await processQueueItem(item);
        if (result.success) {
          console.log(`✨ [Worker] Evento ID ${item.id} terminado.`);
        } else {
          console.warn(`⚠️ [Worker] Evento ID ${item.id} tuvo un fallo: ${result.error}`);
        }
        // Procesar inmediatamente el siguiente sin dormir si hay trabajo acumulado
        continue;
      } else {
        consecutiveEmpty++;
        if (consecutiveEmpty % 20 === 0) {
          // Log heartbeat cada ~30s para saber que sigue vivo
          console.log(`💓 [Worker] Esperando eventos en cola... (${new Date().toLocaleTimeString()})`);
        }
      }
    } catch (err) {
      console.error("❌ [Worker] Error en el ciclo de consumo:", err);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.log("👋 [Worker] Apagado completado de forma segura.");
  process.exit(0);
}

startWorker().catch((err) => {
  console.error("❌ [Worker] Error fatal al iniciar worker:", err);
  process.exit(1);
});
