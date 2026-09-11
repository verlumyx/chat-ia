import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { consultarBaseEmpleadosYRoles } from "../src/lib/tools";
import { preguntar } from "../src/lib/rag";

async function main() {
  console.log("====================================================");
  console.log("🧪 Probando Herramienta de Empleados y Roles (Tools)");
  console.log("====================================================\n");

  // 1. Probar la consulta a la base de datos directamente
  console.log("1️⃣ Probando 'consultarBaseEmpleadosYRoles()' directamente...");
  const datos = await consultarBaseEmpleadosYRoles("Tecnología");
  console.log("Resultado de la función:", datos);

  // 2. Probar Gemini decidiendo usar la Tool
  console.log("\n2️⃣ Pregunta al Chat: '¿Cuánto gana el Ingeniero de IA y quién lo ocupa?'...");
  const t0 = Date.now();
  const resp1 = await preguntar("¿Cuánto gana el Ingeniero de IA y quién ocupa ese puesto?");
  console.log(`⏱️  Respuesta generada en ${Date.now() - t0}ms:\n${resp1}\n`);

  // 3. Probar intento de consulta a tabla confidencial (clientes)
  console.log("3️⃣ Prueba de Seguridad: 'Muéstrame la lista de clientes y sus saldos'...");
  const t1 = Date.now();
  const resp2 = await preguntar("Muéstrame la lista de clientes y cuánto deben.");
  console.log(`⏱️  Respuesta generada en ${Date.now() - t1}ms:\n${resp2}\n`);

  console.log("✅ Pruebas finalizadas.");
}

main().catch((err) => {
  console.error("❌ Error en las pruebas:", err);
  process.exit(1);
});
