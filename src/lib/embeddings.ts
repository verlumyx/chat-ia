import { GoogleGenerativeAI } from "@google/generative-ai";
import { Embeddings } from "@langchain/core/embeddings";

export interface GeminiEmbeddingsParams {
  apiKey?: string;
  model?: string;
  dimensions?: number;
}

/**
 * Generador de embeddings para Gemini con soporte explícito para dimensiones
 * fijas (MRL / Matryoshka Representation Learning), por defecto 768 para Supabase pgvector,
 * y manejo inteligente de reintentos ante límites de cuota (HTTP 429).
 */
export class GeminiEmbeddings extends Embeddings {
  private genAI: GoogleGenerativeAI;
  private modelName: string;
  private dimensions: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private model: any;

  constructor(fields?: GeminiEmbeddingsParams) {
    super({});
    const apiKey = fields?.apiKey || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("Se requiere GOOGLE_API_KEY para inicializar GeminiEmbeddings.");
    }
    this.modelName = fields?.model || "gemini-embedding-001";
    this.dimensions = fields?.dimensions || 768;

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: this.modelName });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    const results: number[][] = [];
    const BATCH_SIZE = 50;

    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      const batch = documents.slice(i, i + BATCH_SIZE);
      let intentos = 0;
      const maxIntentos = 6;
      let exito = false;

      while (!exito && intentos < maxIntentos) {
        try {
          const res = await this.model.batchEmbedContents({
            requests: batch.map((text) => ({
              content: { role: "user", parts: [{ text }] },
              outputDimensionality: this.dimensions,
            })),
          });

          if (!res.embeddings || res.embeddings.length === 0) {
            throw new Error("La API de Gemini no devolvió embeddings para el lote solicitado.");
          }

          for (const e of res.embeddings) {
            if (!e.values || e.values.length === 0) {
              throw new Error("Se recibió un vector vacío de la API de Gemini.");
            }
            results.push(e.values);
          }
          exito = true;
        } catch (err: unknown) {
          intentos++;
          const errorObj = err as {
            status?: number;
            message?: string;
            errorDetails?: Array<{ retryDelay?: string }>;
          };
          const isRateLimit =
            errorObj?.status === 429 ||
            String(errorObj?.message || "").includes("429") ||
            String(errorObj?.message || "").includes("quota");

          if (isRateLimit && intentos < maxIntentos) {
            let esperaSegundos = 42;
            const retryInfo = errorObj?.errorDetails?.find?.((d) => d?.retryDelay);
            if (retryInfo?.retryDelay) {
              const parsed = parseInt(retryInfo.retryDelay, 10);
              if (!isNaN(parsed) && parsed > 0) {
                esperaSegundos = parsed + 2;
              }
            }
            console.log(
              `\n⏳ Límite de cuota gratuita Gemini alcanzado (100 req/min). Pausando ${esperaSegundos}s antes de reintentar...`
            );
            await this.sleep(esperaSegundos * 1000);
          } else {
            throw err;
          }
        }
      }
    }

    return results;
  }

  async embedQuery(document: string): Promise<number[]> {
    let intentos = 0;
    const maxIntentos = 4;

    while (intentos < maxIntentos) {
      try {
        const res = await this.model.embedContent({
          content: { role: "user", parts: [{ text: document }] },
          outputDimensionality: this.dimensions,
        });

        if (!res.embedding?.values || res.embedding.values.length === 0) {
          throw new Error("No se pudo generar el embedding de la consulta.");
        }

        return res.embedding.values;
      } catch (err: unknown) {
        intentos++;
        const errorObj = err as { status?: number; message?: string };
        const isRateLimit =
          errorObj?.status === 429 ||
          String(errorObj?.message || "").includes("429") ||
          String(errorObj?.message || "").includes("quota");

        if (isRateLimit && intentos < maxIntentos) {
          await this.sleep(10000);
        } else {
          throw err;
        }
      }
    }

    throw new Error("Excedido número de reintentos para embedQuery.");
  }
}
