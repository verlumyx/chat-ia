# Ejercicio: Chat sobre un repositorio de archivos `.md` (Next.js + LangChain)

> **Este es el PRIMER ejercicio a atacar.** Después de terminarlo (o en paralelo,
> según lo necesites), refuerza fundamentos con las lecciones de Python en
> [`../py_learning/`](../py_learning/README.md).

## Objetivo

Construir un asistente que responda preguntas sobre un **repositorio de
documentos `.md`** (por ejemplo, la documentación de un proyecto, tus apuntes, o
las políticas de una empresa). El asistente debe ser accesible por **dos
canales**:

1. 💬 Un **chat en la web** (interfaz React dentro de Next.js).
2. 📱 **WhatsApp** (mediante un webhook).

Ambos canales usan **el mismo cerebro**: un flujo **RAG con LangChain.js + Gemini**.

## ¿Qué vas a aprender?

- RAG en JavaScript con **LangChain.js** (equivalente a la Práctica 1 de Python).
- Cargar y trocear archivos `.md` como fuente de datos.
- Separar la **ingesta** (offline) de la **consulta** (en vivo) — el patrón clave.
- Exponer la lógica con **API Routes de Next.js** (el backend).
- Construir una UI de chat en **React**.
- Conectar un **webhook de WhatsApp** al mismo backend.

> 📌 Este ejercicio pone en práctica los dos documentos de arquitectura:
> [Chat en React](arquitectura-chat-react.md) y
> [Chatbot de WhatsApp](arquitectura-chatbot-whatsapp.md). Léelos antes de empezar.

## Stack tecnológico (esquema elegido: **Opción B — Vercel + base vectorial gestionada**)

| Pieza | Herramienta |
|---|---|
| Framework (frontend + backend) | **Next.js** (App Router) |
| Despliegue | **Vercel** (serverless) |
| Orquestación LLM | **LangChain.js** |
| Modelo (LLM + embeddings) | **Google Gemini** (`@langchain/google-genai`) |
| **Base vectorial gestionada** | **Supabase (pgvector)** — recomendada* |
| Canal 1 | Chat web (componente React) |
| Canal 2 | WhatsApp (Cloud API de Meta o Twilio) |

\* **¿Por qué Supabase?** Es Postgres + `pgvector` + API, con capa gratuita. Sirve
como base vectorial **y** como base de datos para el **historial de conversación**
(que necesitarás para WhatsApp, identificando a cada usuario por su teléfono). Así
usas un solo servicio. Alternativas válidas: **Pinecone**, **Upstash Vector**,
**Astra DB**. Si eliges otra, cambia solo el conector; el resto del esquema es igual.

---

## Arquitectura: separar INGESTA de CONSULTA (clave de la Opción B)

El concepto más importante de este esquema: **son dos momentos distintos.**

```
  ┌─ INGESTA (offline, cuando cambian los .md) ──────────────────────────┐
  │                                                                        │
  │   data/*.md  →  trocear  →  embeddings (Gemini)  →  UPSERT ──┐         │
  │   (script que corres en tu máquina o en CI)                  │         │
  └──────────────────────────────────────────────────────────── │ ───────┘
                                                                  ▼
                                                      ┌───────────────────────┐
                                                      │  Base vectorial        │
                                                      │  gestionada (Supabase) │
                                                      └───────────────────────┘
                                                                  ▲
  ┌─ CONSULTA (en vivo, en cada pregunta) ───────────────────────│────────┐
  │                                                               │        │
  │   Chat web  ─┐                                                │        │
  │              ├─▶ Next.js /api en Vercel  ─▶  buscar ──────────┘        │
  │   WhatsApp  ─┘                            └─▶ Gemini responde           │
  └────────────────────────────────────────────────────────────────────── ┘
```

**Insight clave:** en la consulta **ya NO se leen los `.md`**. La función
serverless solo **consulta la base vectorial** y llama a Gemini. Los `.md` solo se
tocan durante la ingesta. Por eso esto funciona perfecto en Vercel (serverless no
tiene filesystem persistente, pero **no lo necesita** para responder).

---

# Desarrollo paso a paso (por fases)

Cada fase es un objetivo pequeño y verificable. **No pases a la siguiente hasta
que la actual funcione.**

## Fase 0 — Preparar el proyecto y los servicios

**Objetivo:** tener Next.js, las dependencias y la base vectorial listos.

1. Crea el proyecto:
   ```bash
   npx create-next-app@latest chat-md --typescript --app
   cd chat-md
   ```
2. Instala LangChain, Gemini, el conector de Supabase y `tsx` (para correr el
   script de ingesta):
   ```bash
   npm install langchain @langchain/google-genai @langchain/core @langchain/community @supabase/supabase-js
   npm install -D tsx
   ```
3. Consigue tu API key de Gemini gratis en <https://aistudio.google.com/app/apikey>.
4. Crea un proyecto en **Supabase** (<https://supabase.com>) y prepáralo como base
   vectorial:
   - Habilita la extensión `vector` (pgvector).
   - Crea la tabla `documents` y la función `match_documents` siguiendo la guía
     oficial de LangChain para `SupabaseVectorStore` (trae el SQL listo para pegar
     en el editor SQL de Supabase).
5. Crea `.env.local` (Next.js lo carga solo; nunca lo subas al repo):
   ```
   GOOGLE_API_KEY=tu_key_de_gemini
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
   ```
   > ⚠️ La `service_role_key` es **secreta** y solo debe usarse en el **servidor**
   > (scripts e API Routes), nunca en el código del cliente.
6. Crea una carpeta `data/` en la raíz y mete **2 o 3 archivos `.md`** de prueba.

✅ **Hecho cuando:** `npm run dev` levanta la app en `http://localhost:3000` y el
proyecto de Supabase tiene la tabla `documents` creada.

## Fase 1 — Script de INGESTA (offline): poblar la base vectorial

**Objetivo:** leer los `.md`, trocearlos, generar embeddings y **guardarlos en
Supabase**. Esto se corre **aparte** de la app, cuando cambian los documentos.

Conceptos (RAG): **cargar → trocear → embeddings → upsert a la base vectorial**.

1. Crea `scripts/ingesta.ts`.
2. Lee todos los `.md` de `data/` (con el `fs` de Node, o un `DirectoryLoader`).
3. Trocea con `RecursiveCharacterTextSplitter` (`chunkSize: 1000`, `overlap: 150`).
4. Genera embeddings con Gemini y **sube** los trozos a Supabase.

Fragmento **ilustrativo** (adáptalo, no lo copies tal cual):

```typescript
// scripts/ingesta.ts  — se corre con: npx tsx scripts/ingesta.ts
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const embeddings = new GoogleGenerativeAIEmbeddings({ model: "text-embedding-004" });

const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 150 });
const chunks = await splitter.createDocuments([/* textos de tus .md */]);

await SupabaseVectorStore.fromDocuments(chunks, embeddings, {
  client,
  tableName: "documents",
  queryName: "match_documents",
});
console.log(`Subidos ${chunks.length} trozos a Supabase`);
```

✅ **Hecho cuando:** corres el script y ves las filas (los trozos + sus vectores)
en la tabla `documents` del panel de Supabase.

## Fase 2 — Retriever que CONSULTA la base vectorial (en la app)

**Objetivo:** desde la app, conectarte al índice **ya poblado** y recuperar los
trozos relevantes. Aquí **no** se indexa nada: solo se consulta.

1. Crea `lib/rag.ts`.
2. Conéctate al índice existente con `SupabaseVectorStore.fromExistingIndex`.
3. Obtén un `retriever` (`asRetriever(4)`).

```typescript
// lib/rag.ts
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const embeddings = new GoogleGenerativeAIEmbeddings({ model: "text-embedding-004" });

const vectorStore = await SupabaseVectorStore.fromExistingIndex(embeddings, {
  client,
  tableName: "documents",
  queryName: "match_documents",
});
const retriever = vectorStore.asRetriever(4);
```

✅ **Hecho cuando:** dada una pregunta de prueba, el retriever devuelve trozos que
tienen sentido (sin haber re-indexado).

## Fase 3 — La chain RAG

**Objetivo:** que la pregunta + los trozos recuperados generen una respuesta.

1. Define un **prompt** que le diga a Gemini: *"responde SOLO con este contexto"*.
2. Crea el modelo `ChatGoogleGenerativeAI`.
3. Únelo todo con LCEL (recuperar → prompt → LLM → texto).

```typescript
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";

const prompt = ChatPromptTemplate.fromTemplate(`
Responde en español usando ÚNICAMENTE el contexto.
Si no está en el contexto, di: "No encuentro esa información".

Contexto:
{context}

Pregunta: {question}
`);

const llm = new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash", temperature: 0 });

export async function preguntar(question: string) {
  const docs = await retriever.invoke(question);
  const context = docs.map((d) => d.pageContent).join("\n\n");
  const chain = RunnableSequence.from([prompt, llm, new StringOutputParser()]);
  return chain.invoke({ context, question });
}
```

✅ **Hecho cuando:** llamas a `preguntar("...")` y obtienes una respuesta basada en
tus `.md`.

## Fase 4 — Endpoint `/api/chat`

**Objetivo:** exponer la chain como una API que el frontend pueda llamar.

1. Crea `app/api/chat/route.ts`.
2. Fuerza el **runtime de Node** (LangChain + Supabase lo necesitan).
3. Recibe `POST` con `{ mensaje }`, llama a `preguntar()`, devuelve `{ respuesta }`.

```typescript
// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { preguntar } from "@/lib/rag";

export const runtime = "nodejs";   // ⚠️ no uses el Edge runtime

export async function POST(req: Request) {
  const { mensaje } = await req.json();
  const respuesta = await preguntar(mensaje);
  return NextResponse.json({ respuesta });
}
```

✅ **Hecho cuando:** un `curl -X POST localhost:3000/api/chat -d '{"mensaje":"..."}'`
devuelve una respuesta JSON.

## Fase 5 — UI del chat en la web

**Objetivo:** una interfaz donde escribir y ver la conversación.

1. Crea un componente cliente (`"use client"`) con:
   - Un estado con la lista de mensajes (`useState`).
   - Un `input` y un botón "Enviar".
   - Al enviar: `fetch("/api/chat", { method: "POST", body: JSON.stringify({ mensaje }) })`.
   - Pinta la respuesta como una burbuja.

✅ **Hecho cuando:** escribes en la web y ves la respuesta del asistente.

**Mejora opcional:** *streaming* palabra por palabra.

## Fase 6 — Canal WhatsApp (webhook)

**Objetivo:** que los mensajes de WhatsApp lleguen al **mismo** cerebro.

Repasa primero [Chatbot de WhatsApp](arquitectura-chatbot-whatsapp.md). Pasos:

1. **Credenciales:** crea una app en Meta for Developers (WhatsApp Cloud API) o usa
   Twilio. Consigue el token y el número de prueba.
2. **Verificación del webhook (GET):** WhatsApp valida tu URL con un `GET` que trae
   `hub.mode`, `hub.verify_token` y `hub.challenge`. Responde el `challenge` si el
   token coincide.
3. **Recepción (POST):** extraes el texto y el teléfono, llamas a `preguntar()`.
4. **Respondes** llamando a la API de WhatsApp (un `POST` con tu token) hacia el
   teléfono del usuario.

```typescript
// app/api/whatsapp/route.ts  (esquema)
export const runtime = "nodejs";

export async function GET(req: Request) {
  // 1. Verificación: comparar hub.verify_token y devolver hub.challenge
}

export async function POST(req: Request) {
  const body = await req.json();
  // 2. Extraer { texto, telefono } del payload de WhatsApp
  // 3. const respuesta = await preguntar(texto);
  // 4. Enviar 'respuesta' al 'telefono' vía la API de WhatsApp (fetch con token)
  return NextResponse.json({ ok: true });
}
```

> ⚠️ WhatsApp necesita una **URL pública**. En desarrollo usa **ngrok**
> (`ngrok http 3000`); en producción, tu despliegue en Vercel ya te da la URL.

✅ **Hecho cuando:** le escribes al número de WhatsApp y te responde con datos de
tus `.md`.

---

## Despliegue y actualización de contenido

- **Desplegar la app:** conecta el repo a **Vercel** y define las mismas variables
  de entorno (`GOOGLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) en el
  panel de Vercel. El deploy te da la URL pública para el webhook de WhatsApp.
- **Actualizar los `.md`:** editas/agregas archivos en `data/` y **vuelves a correr
  el script de ingesta** (`npx tsx scripts/ingesta.ts`). No necesitas redesplegar
  la web: el frontend solo consulta la base vectorial, que ya quedó actualizada.
  > 💡 Más adelante puedes automatizar la ingesta en CI (GitHub Actions) cada vez
  > que cambien los `.md`.

## Consideraciones y mejoras (cuando lo básico funcione)

- **Historial / memoria:** guarda la conversación por usuario. En web, por sesión;
  en WhatsApp, **por número de teléfono**. Aprovecha que Supabase ya es una base de
  datos: crea una tabla `conversaciones` para esto.
- **Idempotencia del webhook:** WhatsApp reintenta si no recibe tu `200`. Usa el ID
  del mensaje para no procesar (ni responder) dos veces lo mismo.
- **Fiabilidad ante fallos:** para no perder mensajes, conviene "aceptar rápido y
  procesar después" (cola + reintentos). Avanzado; no bloqueante para practicar.
- **Seguridad:** la `GOOGLE_API_KEY`, la `service_role_key` y el token de WhatsApp
  viven **solo** en el servidor (variables de entorno), nunca en el cliente.

## Checklist final

- [ ] Fase 0 — Next.js corriendo + Supabase con tabla `documents` + `.env.local`
- [ ] Fase 1 — Script de ingesta sube los trozos de los `.md` a Supabase
- [ ] Fase 2 — El retriever consulta la base vectorial (sin re-indexar)
- [ ] Fase 3 — La chain RAG responde desde un script
- [ ] Fase 4 — `/api/chat` responde por HTTP (runtime Node)
- [ ] Fase 5 — Chat web funcional
- [ ] Fase 6 — WhatsApp conectado al mismo cerebro
- [ ] Despliegue — app en Vercel + ingesta re-ejecutable
- [ ] Mejoras — historial en Supabase, idempotencia, streaming

## Relacionado

- [Arquitectura: Chat en React](arquitectura-chat-react.md)
- [Arquitectura: Chatbot de WhatsApp](arquitectura-chatbot-whatsapp.md)
- [Ideas de prácticas originales](examples.md)
- [Aprender Python desde 0](../py_learning/README.md)
