# 🤖 chatIA — Asistente Corporativo con RAG Híbrido, Tools y WhatsApp Desacoplado

**chatIA** es un asistente de inteligencia artificial fullstack construido con **Next.js (App Router)**, **LangChain.js**, **Google Gemini**, **Supabase** (PostgreSQL + `pgvector`) y la **WhatsApp Cloud API** de Meta.

Combina **búsqueda semántica no estructurada (RAG)** sobre repositorios de documentos Markdown (`.md`) con **consultas estructuradas a bases de datos relacionales** mediante *Function Calling (Tools)*, integrando tanto una interfaz web interactiva con streaming de tokens como un canal oficial de **WhatsApp con arquitectura de cola durable desacoplada y workers en segundo plano**.

---

## 🎯 Propósito y Características Principales

1. **RAG sin Alucinaciones:** Respuestas a preguntas sobre políticas laborales, onboarding y guías técnicas basadas exclusivamente en fragmentos reales recuperados por similitud vectorial (`temperature: 0`).
2. **Arquitectura Híbrida (RAG + SQL Tools):** Consultas en tiempo real a tablas de negocio (directorio de empleados, roles y salarios) mediante herramientas (*Tools*) tipadas con Zod.
3. **Seguridad y Menor Privilegio:** Aislamiento total de tablas confidenciales (como `clientes`), impidiendo cualquier fuga de información frente a *prompt injections*.
4. **Resiliencia de Cuotas (Multi-Model Fallback):** Conmutación automática entre modelos Gemini (`gemini-flash-latest`, `gemini-3.5-flash`, `gemini-3.7-flash`) para evitar bloqueos por límites de cuota (HTTP 429).
5. **Experiencia Web en Tiempo Real:** Chat web con *streaming* palabra por palabra y panel lateral de conversaciones persistidas.
6. **Integración WhatsApp de Alta Resiliencia:** Webhook desacoplado con respuesta `200 OK` inmediata (<50ms), persistencia en cola durable (`webhook_queue`), control de idempotencia contra reintentos de Meta y procesamiento asíncrono con **Worker** y *Dead Letter Queue (DLQ)*.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Propósito |
|---|---|---|
| **Framework Web** | [Next.js](https://nextjs.org/) (App Router, React 19) | Frontend, UI de chat y API Routes en runtime Node.js |
| **Estilos** | [Tailwind CSS v4](https://tailwindcss.com/) | Interfaz responsive, moderna y con modo oscuro |
| **Orquestación IA** | [LangChain.js](https://js.langchain.com/) | Cadenas RAG, vector stores, prompt templates y tools |
| **Modelos LLM & Embeddings** | [Google Gemini](https://ai.google.dev/) (`gemini-flash-latest`, `gemini-embedding-001`) | Respuestas fácticas y cálculo de vectores (768 dimensiones fijas) |
| **Base de Datos & VectorStore** | [Supabase](https://supabase.com/) (PostgreSQL + `pgvector`) | Almacenamiento vectorial (`documents`), tablas relacionales y cola durable (`webhook_queue`) |
| **Canal Móvil** | [WhatsApp Cloud API](https://developers.facebook.com/) (Graph API v21.0) | Recepción de eventos por webhook y envío de mensajes salientes |
| **Concurrencia en Cola** | PostgreSQL `FOR UPDATE SKIP LOCKED` | Desencolado seguro entre múltiples workers concurrentes |
| **Validación de Esquemas** | [Zod](https://zod.dev/) | Tipado de parámetros y validación de Function Calling |

---

## 🏗️ Arquitectura General del Sistema

```
  ┌─ INGESTA OFFLINE (scripts/ingesta.ts) ──────────────────────────────────┐
  │   data/*.md  ──▶  TextSplitter  ──▶  Embeddings (768 dims)  ──▶  Upsert │
  └────────────────────────────────────────────────────────────────── │ ────┘
                                                                      ▼
                                                       ┌────────────────────────┐
                                                       │   Supabase Postgres    │
                                                       │   - documents (vector) │
                                                       │   - roles (SQL)        │
                                                       │   - empleados (SQL)    │
                                                       │   - clientes (BLOCKED) │
                                                       │   - webhook_queue      │
                                                       └────────────────────────┘
                                                               ▲          ▲
   CANAL 1: CHAT WEB (Streaming en Vivo)                      │          │
  ┌───────────────────────────────────────────────────────────│──────────│──────┐
  │ Usuario ──▶ Next.js (/api/chat) ──▶ Gemini ──▶ Retriever ─┘          │      │
  │                     │                 └───▶ Tool SQL ────────────────┘      │
  │                     ▼                                                       │
  │             Streaming de tokens en tiempo real al navegador                 │
  └─────────────────────────────────────────────────────────────────────────────┘

   CANAL 2: WHATSAPP EMPRESARIAL (Cola Asíncrona & Worker)
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │ 1. Usuario WhatsApp ──▶ Meta Cloud API ──▶ Webhook (/api/whatsapp)          │
  │ 2. Webhook: Guarda en webhook_queue ──▶ Retorna HTTP 200 a Meta (<50ms)    │
  │ 3. Worker (scripts/worker.ts): Desencola con FOR UPDATE SKIP LOCKED         │
  │    └──▶ Pregunta al Cerebro RAG + Tools                                     │
  │    └──▶ Despacha respuesta vía Meta Graph API (POST /messages)              │
  └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Requisitos Previos

- **Node.js** v20+ o v22+
- **NPM** o gestor de paquetes de tu preferencia
- Cuenta en [Google AI Studio](https://aistudio.google.com/app/apikey) para tu `GOOGLE_API_KEY`.
- Proyecto en [Supabase](https://supabase.com/) con PostgreSQL y extensión `pgvector`.
- Cuenta en [Meta for Developers](https://developers.facebook.com/) con una app de WhatsApp configurada.

---

## 🚀 Instalación y Puesta en Marcha

### 1. Clonar el repositorio e instalar dependencias

```bash
git clone https://github.com/verlumyx/chat-ia.git
cd chatIA
npm install
```

### 2. Configurar variables de entorno

Copia `.env.example` a `.env`:

```bash
cp .env.example .env
```

Configura tus credenciales:

```env
# Gemini AI
GOOGLE_API_KEY=tu_clave_de_google_ai_studio

# Supabase
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_secreta

# WhatsApp Cloud API
WHATSAPP_VERIFY_TOKEN=tu_token_de_verificacion_webhook
WHATSAPP_ACCESS_TOKEN=tu_token_de_meta_graph_api
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id
```

### 3. Configurar la Base de Datos en Supabase

Abre el **SQL Editor** en tu panel de Supabase y ejecuta en orden los siguientes scripts:

1. **Extensión vectorial y tabla RAG:** Ejecuta las sentencias de [`docs/tablas-supabase.md`](docs/tablas-supabase.md) (creación de `documents` y función `match_documents`).
2. **Tablas de negocio y datos de prueba:** Ejecuta [`scripts/crear-tablas-negocio.sql`](scripts/crear-tablas-negocio.sql) (tablas `roles`, `empleados` y `clientes`).
3. **Cola durable de Webhooks:** Ejecuta [`scripts/crear-tabla-cola.sql`](scripts/crear-tabla-cola.sql) (crea `webhook_queue` y la función RPC `dequeue_webhook_event`).

### 4. Ingesta de Documentos Markdown

Procesa y genera los embeddings de la carpeta `data/` en Supabase:

```bash
npm run ingest
```

### 5. Iniciar la Aplicación

#### Modo Desarrollo Web
```bash
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000) para acceder a la interfaz de chat interactiva.

#### Worker de WhatsApp en Segundo Plano
En una terminal secundaria, arranca el consumidor de la cola para procesar los mensajes de WhatsApp:
```bash
npm run worker
```

---

## 🧪 Scripts de Prueba y Verificación

El proyecto incluye comandos dedicados para validar cada capa del sistema:

| Comando | Descripción |
|---|---|
| `npm run worker` | Inicia el worker continuo en segundo plano para procesar la cola de WhatsApp. |
| `npm run queue:reconcile` | Busca y reintenta eventos pendientes o fallidos antiguos (reconciliación durable). |
| `npm run test:queue` | Ejecuta la suite de pruebas de cola: idempotencia, inserción concurrente y reintentos. |
| `npm run test:whatsapp` | Prueba el envío directo de mensajes a WhatsApp a través de la Graph API de Meta. |
| `npm run test:retriever` | Valida la búsqueda semántica recuperando fragmentos relevantes de `documents`. |
| `npm run test:chat` | Valida la cadena RAG y el endpoint `/api/chat` en modo JSON y streaming. |
| `npm run test:tools` | Verifica el Function Calling a `roles`/`empleados` y comprueba el bloqueo de `clientes`. |
| `npm run lint` | Ejecuta ESLint sobre el proyecto. |
| `npm run build` | Compila la aplicación para producción. |

---

## 📂 Estructura del Proyecto

```text
chatIA/
├── data/                                # Documentos Markdown fuente (.md)
│   ├── onboarding.md
│   ├── politicas-empresa.md
│   └── soporte-tecnico.md
├── docs/                                # Documentación arquitectónica completa
│   ├── arquitectura-chatbot-whatsapp.md # Guía integral de configuración de WhatsApp
│   ├── arquitectura-rag-y-tools.md      # Diseño de la arquitectura RAG + Tools SQL
│   ├── cola.md                          # Principios de fiabilidad y diseño de colas
│   ├── despliegue-vercel.md             # Guía de despliegue en Vercel y background workers
│   ├── ejercicio-chat-md-nextjs-whatsapp.md # Enunciado original del proyecto
│   ├── flujo-completo-chat.md           # Flujo paso a paso Web y WhatsApp
│   ├── seguridad-control-acceso.md      # Defensa en profundidad y bloqueo de clientes
│   └── tablas-supabase.md               # Esquemas DDL de base de datos y funciones RPC
├── scripts/                             # Scripts ejecutables con tsx
│   ├── crear-tabla-cola.sql             # DDL de la cola webhook_queue y RPC
│   ├── crear-tablas-negocio.sql         # DDL de roles, empleados y clientes
│   ├── ingesta.ts                       # Ingesta offline de Markdown a pgvector
│   ├── reconciliar-cola.ts              # Script de reconciliación de eventos pendientes
│   ├── test-chat.ts                     # Pruebas del chat RAG
│   ├── test-queue.ts                    # Pruebas de cola e idempotencia
│   ├── test-retriever.ts                # Pruebas del retriever vectorial
│   ├── test-tools.ts                    # Pruebas de Function Calling y seguridad
│   ├── test-whatsapp.ts                 # Pruebas de envío por WhatsApp Cloud API
│   └── worker.ts                        # Worker continuo en segundo plano
├── src/
│   ├── app/
│   │   ├── api/chat/route.ts            # Endpoint web síncrono con streaming
│   │   ├── api/whatsapp/route.ts        # Webhook asíncrono con respuesta inmediata 200
│   │   ├── api/worker/process/route.ts  # Endpoint serverless de procesamiento por lotes
│   │   ├── layout.tsx                   # Layout global
│   │   └── page.tsx                     # Página principal con interfaz de chat
│   ├── components/
│   │   ├── Chat.tsx                     # Interfaz de usuario interactiva
│   │   ├── ChatMessage.tsx              # Componente de burbuja de mensaje
│   │   └── Sidebar.tsx                  # Barra lateral de conversaciones
│   └── lib/
│       ├── embeddings.ts                # Wrapper GeminiEmbeddings (768 dims)
│       ├── queue.ts                     # Funciones de encolado, desencolado y reintentos
│       ├── rag.ts                       # Orquestador LangChain, RAG y fallback de modelos
│       ├── tools.ts                     # Tools Zod para consultas SQL a empleados/roles
│       └── whatsapp.ts                  # Cliente HTTP para Meta Graph API
├── vercel.json                          # Configuración de timeout y cron en Vercel
├── package.json
└── tsconfig.json
```

---

## 📚 Índice de Documentación Técnica

Para profundizar en el diseño del sistema, consulta los documentos de la carpeta [`docs/`](docs/):

1. **[Flujo Completo del Chat](docs/flujo-completo-chat.md):** Traza detallada paso a paso del mensaje por el canal Web y el canal WhatsApp.
2. **[Arquitectura de WhatsApp](docs/arquitectura-chatbot-whatsapp.md):** Configuración de Meta App, WABA, permisos y túnel HTTPS con ngrok.
3. **[Diseño de Colas y Fiabilidad](docs/cola.md):** Principios de desacople, persistencia durable, idempotencia, backoff exponencial y DLQ.
4. **[Arquitectura RAG y Tools](docs/arquitectura-rag-y-tools.md):** Diferenciación entre datos no estructurados y estructurados con Function Calling.
5. **[Seguridad y Control de Acceso](docs/seguridad-control-acceso.md):** Estrategias para impedir accesos o filtración de la tabla confidencial `clientes`.
6. **[Esquema de Tablas Supabase](docs/tablas-supabase.md):** Scripts SQL completos de `documents`, `roles`, `empleados`, `clientes` y `webhook_queue`.
7. **[Guía de Despliegue en Vercel](docs/despliegue-vercel.md):** Opciones para ejecutar la cola en arquitecturas Serverless.

---

## 📄 Licencia

Este proyecto está licenciado bajo los términos de la licencia MIT.
