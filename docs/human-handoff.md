# Human Handoff (Transferencia a Agente Humano)

Este documento detalla la arquitectura necesaria para permitir que una conversación liderada por el bot de Inteligencia Artificial sea transferida a un agente humano, pausando la IA hasta que el agente humano finalice la atención.

## Concepto Core: Gestión de Estado

La clave para el Human Handoff no reside en la IA, sino en un **gestor de estado de las conversaciones** en la base de datos (por ejemplo, Supabase). Cada usuario/número de teléfono debe tener un estado asociado.

Los estados principales son:
- `bot`: Los mensajes entrantes se envían al LLM (Langchain/Gemini).
- `humano`: Los mensajes entrantes se guardan en BD pero NO se envían al LLM.

## Arquitectura del Flujo

### 1. La Herramienta de Transferencia (Tool)
Se le provee a la IA una herramienta (usando Function Calling) que le permite decidir transferir la conversación a un humano.

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";
// Asumiendo un cliente de supabase configurado
// import { supabase } from "@/lib/supabaseClient";

const transferirAHumanoTool = tool(
  async ({ motivo, numeroUsuario }) => {
    // 1. Actualizar el estado en la base de datos
    /*
    await supabase
      .from('usuarios_whatsapp')
      .update({ estado_chat: 'humano' })
      .eq('telefono', numeroUsuario);
    */

    // 2. (Opcional) Enviar notificación a los asesores
    console.log(`[ALERTA] Cliente ${numeroUsuario} requiere atención humana. Motivo: ${motivo}`);

    return "Transferencia iniciada. El bot debe despedirse y pedir al usuario que espere.";
  },
  {
    name: "transferir_a_humano",
    description: "Usa esta herramienta CUANDO el usuario pida explícitamente hablar con una persona, asesor humano, o cuando no puedas resolver su problema.",
    schema: z.object({
      motivo: z.string().describe("El motivo por el cual se requiere atención humana"),
      numeroUsuario: z.string().describe("El número de teléfono del usuario"),
    }),
  }
);
```

### 2. El "Portero" en el Webhook (Middleware)

En el endpoint que recibe los mensajes de WhatsApp (`POST`), se debe consultar la base de datos ANTES de invocar a Langchain.

```typescript
// Pseudocódigo para el Webhook de WhatsApp
export async function POST(req: Request) {
  const { mensaje, telefono } = await extraerDatosWebhook(req);

  // 1. Verificar estado en Base de Datos
  // const estado = await consultarEstado(telefono); // Retorna 'bot' o 'humano'
  const estado = 'bot'; // Simulación

  if (estado === 'humano') {
    // EL USUARIO ESTÁ HABLANDO CON UN HUMANO
    
    // Guardamos el mensaje en la BD para que el asesor lo vea en su panel
    // await guardarMensaje(telefono, mensaje, 'user');
    
    // Retornamos 200 OK a WhatsApp para que no reintente
    // NO invocamos a la IA.
    return new Response('OK', { status: 200 }); 
  }

  // Si el estado es 'bot', continuamos el flujo normal hacia la IA
  // const respuestaIA = await llamarALangchain(mensaje, telefono);
  // await enviarMensajeWhatsApp(telefono, respuestaIA);
  
  return new Response('OK', { status: 200 });
}
```

### 3. Devolviendo el control al Bot (Cerrar Ticket)

El sistema debe proveer una interfaz (Dashboard) para los asesores humanos. Cuando el asesor termina de ayudar al cliente, debe hacer clic en un botón (ej. "Cerrar Ticket" o "Terminar Chat").

Esta acción hace una petición a la API que:
1. Actualiza el estado en la base de datos de nuevo a `bot`.
   ```sql
   UPDATE usuarios_whatsapp SET estado_chat = 'bot' WHERE telefono = '+1234567890';
   ```
2. (Opcional) Envía un mensaje automático de cierre: *"El asesor ha finalizado la sesión. He vuelto para ayudarte, ¿necesitas algo más?"*

El próximo mensaje que envíe el cliente pasará por el Webhook, el estado será `bot`, y la IA retomará el control.
