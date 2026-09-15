# Integración de Evolution API con Aplicaciones de Inteligencia Artificial (Webhooks)

Para que **Evolution API** se comunique con tu aplicación de Inteligencia Artificial (IA), utiliza un sistema de eventos mediante **Webhooks**. En esta arquitectura, Evolution API actúa como el cliente que envía peticiones HTTP (`POST`) a tu servidor (donde está tu IA) cada vez que ocurre un evento en WhatsApp, como la llegada de un nuevo mensaje.

A continuación, se detalla paso a paso cómo se configura la conexión, cómo se ejecuta internamente y cuál es el flujo de trabajo completo.

---

## 1. ¿Cómo se configura la conexión?

Para iniciar la comunicación, debes registrar la URL de tu aplicación en la instancia de WhatsApp de Evolution API. Esto se realiza enviando una petición `POST` al endpoint:

```
POST /webhook/set/nombre_de_tu_instancia
```

El cuerpo (`body`) de la petición debe tener el siguiente formato JSON:

```json
{
  "webhook": {
    "enabled": true,
    "url": "https://tu-app-de-ia.com/webhook",
    "byEvents": false,
    "base64": false,
    "events": [
      "MESSAGES_UPSERT",
      "SEND_MESSAGE"
    ],
    "headers": {
      "Authorization": "Bearer tu_token_secreto",
      "jwt_key": "opcional_si_usas_jwt_aqui_se_genera_un_token_dinamico"
    }
  }
}
```

### Explicación de los parámetros:
* **`url`**: Es la ruta exacta de tu servidor donde Evolution API enviará los datos.
* **`events`**: Es la lista de eventos a los que te quieres suscribir. El más importante para conectar una IA suele ser `MESSAGES_UPSERT` (que se dispara cuando recibes un mensaje nuevo de un usuario en WhatsApp).
* **`byEvents`**: Si se establece en `true`, la API añadirá automáticamente el nombre del evento al final de tu URL base (por ejemplo: enviará un `POST` a `https://tu-app-de-ia.com/webhook/messages-upsert`).
* **`headers`**: Te permite añadir cabeceras personalizadas. Esto es ideal para que tu aplicación valide que la petición es segura (como enviar tokens de autorización). Si configuras `jwt_key`, Evolution API genera dinámicamente un token JWT válido por un corto periodo de tiempo y lo envía en el encabezado `Authorization`.

---

## 2. ¿Cómo se ejecuta el Webhook internamente?

Cuando Evolution API recibe un mensaje en WhatsApp, se ejecuta el siguiente flujo interno en el controlador de Webhooks (`src/api/integrations/event/webhook/webhook.controller.ts`):

1. **Captura del Evento**: El componente `EventManager` detecta el evento entrante (por ejemplo, llegó un mensaje) y lo transfiere al controlador del Webhook.
2. **Formateo de los Datos**: Se construye un objeto (payload) con toda la información relevante. El `body` de la petición HTTP que recibirá tu app de IA tendrá una estructura similar a esta:
   
   ```json
   {
     "event": "MESSAGES_UPSERT",
     "instance": "nombre_de_tu_instancia",
     "data": { 
       /* Detalles del mensaje: texto, tipo, contacto, ID del mensaje, etc. */ 
     },
     "destination": "https://tu-app-de-ia.com/webhook",
     "date_time": "2024-01-01T12:00:00.000Z",
     "sender": "numero_de_telefono",
     "server_url": "url_de_evolution_api",
     "apikey": "tu_api_key"
   }
   ```

3. **Petición HTTP y Mecanismo de Reintentos (Retry Mechanism)**: 
   * La API utiliza internamente `axios` para hacer un `POST` a la URL de tu aplicación.
   * **Resiliencia (Retry system)**: Si tu aplicación de IA se encuentra momentáneamente inactiva o responde con un "Timeout", Evolution API cuenta con un mecanismo automático de reintentos (`retryWebhookRequest`). Emplea un retraso exponencial (backoff) para intentar reenviar la petición (por ejemplo, después de 5s, luego 10s, 20s...). Los reintentos se cancelan de inmediato si tu servidor responde con un error definitivo y no recuperable (como los códigos de estado `400`, `401`, `403`, `404` o `422`).

---

## 3. El Flujo de Trabajo Completo con tu IA

Para establecer el ciclo completo de conversación autónoma mediante IA, el flujo lógico es el siguiente:

1. **Recepción:** El usuario envía un mensaje de WhatsApp a tu número conectado en Evolution API.
2. **Notificación (Webhook):** Evolution API recibe el mensaje en su proveedor de WhatsApp, dispara el evento `MESSAGES_UPSERT` y realiza un `POST` a tu aplicación con el texto del mensaje.
3. **Procesamiento de IA:** Tu aplicación recibe el `POST`, extrae el contenido del mensaje de la propiedad `data`, y se lo envía a tu modelo de Inteligencia Artificial (OpenAI, Claude, Dify, un agente personalizado, etc.).
4. **Generación:** La IA genera una respuesta textual acorde al contexto.
5. **Envío:** Tu aplicación toma la respuesta generada por la IA y realiza una nueva petición `POST` de vuelta hacia Evolution API usando el endpoint:
   ```
   POST /message/sendText/nombre_de_tu_instancia
   ```
6. **Entrega final:** Evolution API se encarga de entregar ese mensaje de respuesta al WhatsApp del usuario, completando así el ciclo de conversación automatizada.
