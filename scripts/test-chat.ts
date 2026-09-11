import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { preguntar } from "../src/lib/rag";
import { POST } from "../src/app/api/chat/route";
import { NextRequest } from "next/server";

async function main() {
  console.log("==================================================");
  console.log("🧪 Probando Fase 3, 4 y 5 (RAG Chain + API Route)");
  console.log("==================================================\n");

  // 1. Probar preguntar() directamente (Fase 3)
  const pregunta = "¿Cuál es el horario laboral y política de trabajo remoto?";
  console.log(`1️⃣ Probando 'preguntar()' con: "${pregunta}"...`);
  const t0 = Date.now();
  const respuesta = await preguntar(pregunta);
  console.log(`⏱️  Completado en ${Date.now() - t0}ms.`);
  console.log(`💬 Respuesta:\n${respuesta}\n`);

  // 2. Probar Endpoint /api/chat con JSON (Fase 4)
  console.log("2️⃣ Probando Endpoint POST /api/chat con payload { mensaje }...");
  const jsonReq = new NextRequest("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mensaje: "¿Qué estipendio de oficina remota se otorga?" }),
  });
  const t1 = Date.now();
  const jsonRes = await POST(jsonReq);
  const jsonBody = await jsonRes.json();
  console.log(`⏱️  Completado en ${Date.now() - t1}ms (Status: ${jsonRes.status}).`);
  console.log(`📦 JSON Response:`, jsonBody);

  // 3. Probar Endpoint /api/chat con Streaming (Fase 5)
  console.log("\n3️⃣ Probando Endpoint POST /api/chat con Streaming...");
  const streamReq = new NextRequest("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "¿Cuántos días de vacaciones remuneradas se tienen?" }],
      stream: true,
    }),
  });
  const t2 = Date.now();
  const streamRes = await POST(streamReq);
  console.log(`⏱️  Respuesta iniciada en ${Date.now() - t2}ms (Status: ${streamRes.status}, Content-Type: ${streamRes.headers.get("content-type")}).`);

  const reader = streamRes.body?.getReader();
  const decoder = new TextDecoder();
  let streamedText = "";
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      streamedText += decoder.decode(value);
    }
  }
  console.log(`🌊 Texto transmitido (streaming):\n${streamedText.trim()}`);

  console.log("\n✅ Todas las pruebas de las Fases 3, 4 y 5 finalizaron exitosamente.");
}

main().catch((err) => {
  console.error("❌ Error en las pruebas:", err);
  process.exit(1);
});
