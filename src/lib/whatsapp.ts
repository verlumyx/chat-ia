/**
 * Cliente para interactuar con la WhatsApp Cloud API de Meta
 */

export interface WhatsAppTextMessagePayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text";
  text: {
    preview_url?: boolean;
    body: string;
  };
}

export interface WhatsAppSendResponse {
  messaging_product: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string }>;
  error?: {
    message: string;
    type: string;
    code: number;
    fbtrace_id?: string;
  };
}

/**
 * Divide un texto largo en trozos que respeten el límite de 4096 caracteres de WhatsApp
 */
export function chunkMessage(text: string, maxLength = 4000): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let currentChunk = "";

  const paragraphs = text.split("\n\n");
  for (const paragraph of paragraphs) {
    if ((currentChunk + "\n\n" + paragraph).length <= maxLength) {
      currentChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      if (paragraph.length > maxLength) {
        for (let i = 0; i < paragraph.length; i += maxLength) {
          chunks.push(paragraph.slice(i, i + maxLength).trim());
        }
      } else {
        currentChunk = paragraph;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Envía un mensaje de texto al usuario a través de la WhatsApp Cloud API de Meta
 */
export async function sendWhatsAppMessage(
  to: string,
  text: string
): Promise<{ success: boolean; data?: WhatsAppSendResponse; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    const errorMsg =
      "Faltan credenciales de WhatsApp: WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configuradas en el entorno.";
    console.error(`❌ [WhatsApp API] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const textChunks = chunkMessage(text);
  let lastResponseData: WhatsAppSendResponse | undefined;

  for (const chunk of textChunks) {
    const payload: WhatsAppTextMessagePayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: chunk,
      },
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as WhatsAppSendResponse;

      if (!response.ok || data.error) {
        console.error("❌ [WhatsApp API] Error al enviar mensaje:", JSON.stringify(data, null, 2));
        return {
          success: false,
          error: data.error?.message || `Error HTTP ${response.status}`,
        };
      }

      lastResponseData = data;
    } catch (err: unknown) {
      console.error("❌ [WhatsApp API] Excepción al llamar a la Graph API:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return { success: true, data: lastResponseData };
}
