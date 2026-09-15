# Function Calling (Uso de Herramientas) en IA

Este documento explica cómo hacer que el chatbot de IA no solo responda con texto, sino que sea capaz de ejecutar acciones en el sistema (como registrar reclamos, hacer consultas a una base de datos, crear pedidos, etc.). Esto se logra mediante un concepto llamado **Function Calling** (o "Tool Use").

## ¿Qué es Function Calling?

Es la capacidad de proporcionar a un modelo de Lenguaje (como Gemini, OpenAI, Claude) una lista de "Herramientas" (funciones) que puede utilizar. Cuando el modelo detecta que la intención del usuario requiere una de estas herramientas, en lugar de generar una respuesta de texto estándar, devuelve una solicitud estructurada pidiendo que tu sistema ejecute dicha función.

## El Flujo de Ejecución

1. **Definición de Herramientas:** Se le explica a la IA qué funciones existen, para qué sirven y qué parámetros (argumentos) necesitan.
2. **Recepción del Mensaje:** El usuario envía un mensaje por WhatsApp (ej. *"Quiero registrar un reclamo, mi cliente ID es 1234"*).
3. **Invocación del Modelo:** El backend envía el mensaje a la IA junto con la lista de herramientas disponibles.
4. **Decisión de la IA:** La IA decide que necesita usar la herramienta `registrar_reclamo`. Responde con una instrucción en formato JSON: `{ "nombre_funcion": "registrar_reclamo", "argumentos": { "numeroCliente": "1234" } }`.
5. **Ejecución Local:** El backend (Next.js/Node.js) intercepta esta respuesta y ejecuta la función real (llamada a la API, inserción en BD, etc.).
6. **Retorno de Resultados:** El backend le devuelve a la IA el resultado de la ejecución (ej. `{ "exito": true, "ticket_id": "TKT-001" }`).
7. **Respuesta Final:** Con ese resultado, la IA genera un mensaje natural para el usuario: *"He registrado tu reclamo. Tu ticket es el TKT-001"*.

## Ejemplo de Implementación con Langchain

Para proyectos que utilizan `@langchain/core`, `@langchain/google-genai` y `zod`:

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

// 1. Definir la herramienta
const registrarReclamoTool = tool(
  async ({ numeroCliente, descripcion }) => {
    // Lógica de negocio: Llamada a la API o Base de Datos
    console.log(`Guardando reclamo de ${numeroCliente}: ${descripcion}`);
    
    // Simular creación en el sistema
    const ticketGenerado = `TKT-${Math.floor(Math.random() * 1000)}`;
    
    // Devolver el resultado a la IA
    return JSON.stringify({ 
      exito: true, 
      mensaje: "Reclamo guardado correctamente", 
      ticket_id: ticketGenerado 
    });
  },
  {
    name: "registrar_reclamo",
    description: "Útil para registrar un reclamo, queja o problema de un cliente en el sistema. Requiere el ID del cliente y la descripción.",
    schema: z.object({
      numeroCliente: z.string().describe("El ID o número de teléfono del cliente"),
      descripcion: z.string().describe("La descripción detallada del problema o reclamo"),
    }),
  }
);

// 2. Configurar el modelo y vincular (bind) la herramienta
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash", // o el modelo utilizado en el proyecto
});

// El modelo ahora tiene conocimiento de esta herramienta y la usará si lo cree necesario
const llmConHerramientas = llm.bindTools([registrarReclamoTool]);
```

## Manejo de Datos Faltantes

Si el usuario hace una petición incompleta (ej. *"Tengo un problema"*, pero no da su número de cliente), la IA validará el `schema` de Zod, notará que falta el `numeroCliente` y, en lugar de fallar, responderá al usuario pidiéndole el dato faltante: *"Claro, para ayudarte con tu problema necesito que me indiques tu número de cliente."* Una vez obtenido, ejecutará la herramienta.
