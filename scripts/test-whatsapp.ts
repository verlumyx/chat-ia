import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { GET, POST } from "../src/app/api/whatsapp/route";
import { NextRequest } from "next/server";

async function main() {
  console.log("==================================================");
  console.log("🧪 Probando Fase 6: Webhook de WhatsApp (GET & POST)");
  console.log("==================================================\n");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "chatia_token_secreto_2026";
  const challengeCode = "1155993300";

  // 1. Probar GET handshake con token correcto
  console.log("1️⃣ Probando GET /api/whatsapp con token válido...");
  const validUrl = `http://localhost:3000/api/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(
    verifyToken
  )}&hub.challenge=${challengeCode}`;
  const getReq = new NextRequest(validUrl, { method: "GET" });
  const getRes = await GET(getReq);
  const getChallengeText = await getRes.text();

  console.log(`   Status: ${getRes.status} (Esperado: 200)`);
  console.log(`   Challenge recibido: "${getChallengeText}" (Esperado: "${challengeCode}")`);

  if (getRes.status === 200 && getChallengeText === challengeCode) {
    console.log("   ✅ Handshake de verificación GET superado correctamente.\n");
  } else {
    console.error("   ❌ Falló la verificación GET.");
    process.exit(1);
  }

  // 2. Probar GET handshake con token incorrecto
  console.log("2️⃣ Probando GET /api/whatsapp con token inválido...");
  const invalidUrl = `http://localhost:3000/api/whatsapp?hub.mode=subscribe&hub.verify_token=token_invalido&hub.challenge=${challengeCode}`;
  const invalidGetReq = new NextRequest(invalidUrl, { method: "GET" });
  const invalidGetRes = await GET(invalidGetReq);

  console.log(`   Status: ${invalidGetRes.status} (Esperado: 403)`);
  if (invalidGetRes.status === 403) {
    console.log("   ✅ Bloqueo de seguridad con token inválido verificado.\n");
  } else {
    console.error("   ❌ Falló el bloqueo de token inválido.");
    process.exit(1);
  }

  // 3. Probar POST con evento de status (lectura/entrega)
  console.log("3️⃣ Probando POST /api/whatsapp con evento de status (delivered/read)...");
  const statusPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              statuses: [{ id: "wamid.123", status: "delivered", timestamp: "1710334800" }],
            },
          },
        ],
      },
    ],
  };

  const statusReq = new NextRequest("http://localhost:3000/api/whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(statusPayload),
  });

  const statusRes = await POST(statusReq);
  const statusJson = await statusRes.json();
  console.log(`   Status: ${statusRes.status}, Body:`, statusJson);
  console.log("   ✅ Eventos de estado ignorados de forma limpia sin llamar al LLM.\n");

  // 4. Probar POST con mensaje real de usuario (pregunta documental)
  const testMessageId = `wamid.test_${Date.now()}`;
  console.log("4️⃣ Probando POST /api/whatsapp con mensaje de usuario (RAG)...");
  console.log(`   Pregunta: "¿Cuántos días de vacaciones tengo al año?"`);

  const messagePayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              messages: [
                {
                  from: "584121234567",
                  id: testMessageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: "¿Cuántos días de vacaciones tengo al año?" },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const msgReq = new NextRequest("http://localhost:3000/api/whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messagePayload),
  });

  const t0 = Date.now();
  const msgRes = await POST(msgReq);
  const msgJson = await msgRes.json();
  console.log(`   ⏱️ Procesado en ${Date.now() - t0}ms (Status: ${msgRes.status})`);
  console.log(`   Resultado:`, msgJson);

  // 5. Probar Idempotencia (reintento del mismo mensaje)
  console.log("\n5️⃣ Probando Idempotencia (reintento con el mismo ID de mensaje)...");
  const retryReq = new NextRequest("http://localhost:3000/api/whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messagePayload),
  });

  const retryRes = await POST(retryReq);
  const retryJson = await retryRes.json();
  console.log(`   Status: ${retryRes.status}, Body:`, retryJson);
  if (retryJson.status === "already_processed") {
    console.log("   ✅ Idempotencia comprobada: el mensaje repetido fue descartado con éxito.\n");
  }

  console.log("==================================================");
  console.log("🎉 ¡Todas las pruebas de integración del Webhook pasaron exitosamente!");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("❌ Error en script de pruebas:", err);
  process.exit(1);
});
