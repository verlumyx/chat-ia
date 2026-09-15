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

import { getSupabaseClient } from "./rag";

export async function sendWhatsAppMessage(
  to: string,
  text: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const token = process.env.AUTHENTICATION_API_KEY;
  const apiUrl = process.env.EVOLUTION_API_URL || "http://localhost:8080";

  if (!token) {
    const errorMsg = "Falta credencial de Evolution: AUTHENTICATION_API_KEY no configurada.";
    console.error(`❌ [WhatsApp API] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  // Obtener la instancia de la base de datos
  const supabase = getSupabaseClient();
  const { data: instances, error: dbError } = await supabase
    .from('evolution_instances')
    .select('instance_name')
    .order('created_at', { ascending: false })
    .limit(1);

  if (dbError || !instances || instances.length === 0) {
    const errorMsg = "No se encontró ninguna instancia de Evolution API configurada en la base de datos.";
    console.error(`❌ [WhatsApp API] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  const instanceName = instances[0].instance_name;
  const url = `${apiUrl}/message/sendText/${instanceName}`;
  const textChunks = chunkMessage(text);
  let lastResponseData: any;

  for (const chunk of textChunks) {
    const payload = {
      number: to,
      text: chunk
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "apikey": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("❌ [WhatsApp API] Error al enviar mensaje por Evolution:", JSON.stringify(data, null, 2));
        return {
          success: false,
          error: data.message?.message || data.error || `Error HTTP ${response.status}`,
        };
      }

      lastResponseData = data;
    } catch (err: unknown) {
      console.error("❌ [WhatsApp API] Excepción al llamar a Evolution API:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return { success: true, data: lastResponseData };
}
