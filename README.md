# 🤖 chatIA — Asistente Corporativo con RAG Híbrido y Tools

**chatIA** es un asistente de inteligencia artificial fullstack construido con **Next.js (App Router)**, **LangChain.js**, **Google Gemini** y **Supabase** (PostgreSQL + `pgvector`). 

Combina **búsqueda semántica no estructurada (RAG)** sobre repositorios de documentos Markdown (`.md`) con **consultas estructuradas a bases de datos relacionales** mediante *Function Calling (Tools)*, manteniendo un estricto control de acceso y seguridad.

---

## 🎯 Propósito del Proyecto

El objetivo de este proyecto es implementar una arquitectura moderna, escalable y segura para asistentes conversacionales corporativos:

1. **RAG sin Alucinaciones:** Responder preguntas sobre documentación interna (políticas laborales, manuales de onboarding, guías técnicas) basándose exclusivamente en fragmentos reales recuperados por similitud vectorial (`temperature: 0`).
2. **Arquitectura Híbrida (RAG + SQL Tools):** Permitir al modelo consultar información relacional en tiempo real (directorio de empleados, cargos, departamentos y salarios) mediante herramientas (*Tools*) tipadas con Zod.
3. **Seguridad y Menor Privilegio:** Aislar tablas confidenciales (como `clientes` y estados de cuenta), impidiendo cualquier acceso o fuga de información sensible tanto por prompts maliciosos como por alucinaciones.
4. **Resiliencia de Cuotas (Multi-Model Fallback):** Conmutación automática entre modelos Gemini (`gemini-flash-latest`, `gemini-3.5-flash`, `gemini-3.7-flash`, etc.) para evitar bloqueos por límites de cuota (HTTP 429) de la capa gratuita.
5. **Experiencia de Usuario en Tiempo Real:** Chat web con streaming de tokens palabra por palabra y panel lateral para gestionar múltiples conversaciones persistidas en `localStorage`.
6. **Canal Multicanal (Listo para WhatsApp):** Diseñado con separación desacoplada entre ingesta y consulta para conectar tanto la web como webhooks de WhatsApp al mismo motor.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Propósito |
|---|---|---|
| **Framework Web** | [Next.js](https://nextjs.org/) (App Router, React 19) | Frontend, UI de chat y API Routes en runtime Node.js |
| **Estilos** | [Tailwind CSS v4](https://tailwindcss.com/) | Interfaz responsive, moderna y con modo oscuro |
| **Orquestación IA** | [LangChain.js](https://js.langchain.com/) | Cadenas RAG, vector stores, prompt templates y tools |
| **Modelos LLM & Embeddings** | [Google Gemini](https://ai.google.dev/) (`gemini-flash-latest`, `gemini-embedding-001`) | Generación de respuestas fácticas y cálculo de vectores (768 dimensiones) |
| **Base Vectorial y Relacional** | [Supabase](https://supabase.com/) (PostgreSQL + `pgvector`) | Almacenamiento vectorial (`documents`) y tablas de negocio (`roles`, `empleados`, `clientes`) |
| **Validación de Esquemas** | [Zod](https://zod.dev/) | Tipado y esquemas de parámetros para Function Calling |

---

## 🏗️ Arquitectura del Sistema

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
                                                       └────────────────────────┘
                                                              ▲          ▲
  ┌─ CONSULTA EN VIVO (/api/chat) ────────────────────────────│──────────│──────┐
  │                                                           │          │      │
  │   Usuario ──▶  Gemini (Cerebro) ──▶ ¿Documentos? ──▶ Retriever       │      │
  │                     │           ──▶ ¿Sueldos/Roles? ──▶ Tool SQL ────┘      │
  │                     ▼                                                       │
  │             Streaming de respuesta al Chat Web                              │
  └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Requisitos Previos

- **Node.js** v20+ o v22+
- **NPM** o gestor de paquetes preferido
- Una cuenta gratuita en [Google AI Studio](https://aistudio.google.com/app/apikey) para obtener tu `GOOGLE_API_KEY`.
- Un proyecto en [Supabase](https://supabase.com/) para la base de datos Postgres y extensión vectorial.

---

## 🚀 Instalación y Puesta en Marcha

### 1. Clonar el repositorio e instalar dependencias

```bash
git clone <url-del-repositorio>
cd chatIA
npm install
```

### 2. Configurar variables de entorno

Crea un archivo `.env` o `.env.local` en la raíz del proyecto tomando como referencia `.env.example`:

```env
GOOGLE_API_KEY=tu_clave_de_google_ai_studio
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_secreta
```

> ⚠️ **Nota de seguridad:** La clave `SUPABASE_SERVICE_ROLE_KEY` solo se ejecuta en el servidor y nunca se expone al cliente.

### 3. Configurar la Base de Datos en Supabase

Abre el **SQL Editor** en el panel de tu proyecto de Supabase y ejecuta los siguientes scripts:

1. **Extensión vectorial y tablas RAG:** Ejecuta el script de [`docs/tablas-supabase.md`](docs/tablas-supabase.md) para habilitar `vector`, crear la tabla `documents` y la función `match_documents`.
2. **Tablas de negocio y datos de prueba:** Ejecuta el contenido de [`scripts/crear-tablas-negocio.sql`](scripts/crear-tablas-negocio.sql) para crear `roles`, `empleados` y `clientes`.

### 4. Ejecutar la Ingesta de Documentos Markdown (Fase 1)

Para trocear los archivos de la carpeta `data/` y generar sus embeddings en Supabase:

```bash
npm run ingest
```

### 5. Iniciar la aplicación en modo desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador para interactuar con la interfaz de chat.

---

## 🧪 Scripts de Prueba y Verificación

El proyecto incluye suites de prueba automatizadas para cada una de las fases:

| Comando | Descripción |
|---|---|
| `npm run test:retriever` | Prueba la búsqueda vectorial (Fase 2) recuperando chunks relevantes sin tocar los `.md`. |
| `npm run test:chat` | Valida la chain RAG, el endpoint `/api/chat` en modo JSON y con streaming. |
| `npm run test:tools` | Verifica la ejecución de la Tool `consultar_empleados_y_roles` y comprueba que se rechacen consultas a `clientes`. |
| `npm run lint` | Ejecuta ESLint para validar la calidad del código. |
| `npm run build` | Compila la aplicación para producción con Turbopack. |

---

## 📂 Estructura del Proyecto

```text
chatIA/
├── data/                          # Documentos Markdown fuente (.md)
│   ├── onboarding.md
│   ├── politicas-empresa.md
│   └── soporte-tecnico.md
├── docs/                          # Documentación arquitectónica y guías
│   ├── arquitectura-rag-y-tools.md
│   ├── ejercicio-chat-md-nextjs-whatsapp.md
│   ├── seguridad-control-acceso.md
│   └── tablas-supabase.md
├── scripts/                       # Scripts ejecutables con tsx
│   ├── crear-tablas-negocio.sql   # DDL SQL de negocio
│   ├── ingesta.ts                 # Script de ingesta offline RAG
│   ├── test-chat.ts               # Test de endpoint y streaming
│   ├── test-retriever.ts          # Test del retriever de Supabase
│   └── test-tools.ts              # Test de tools y seguridad
├── src/
│   ├── app/
│   │   ├── api/chat/route.ts      # Endpoint serverless /api/chat (Node runtime)
│   │   ├── layout.tsx             # Layout raíz
│   │   └── page.tsx               # Página principal del chat
│   ├── components/
│   │   ├── Chat.tsx               # Interfaz de chat, estado y streaming
│   │   ├── ChatMessage.tsx        # Renderizado de burbujas de mensaje
│   │   └── Sidebar.tsx            # Barra lateral de historial de conversaciones
│   └── lib/
│       ├── embeddings.ts          # Clase GeminiEmbeddings (768 dims fija)
│       ├── rag.ts                 # Retriever, chain RAG y conmutación de modelos
│       └── tools.ts               # Herramientas LangChain para tablas SQL
├── package.json
└── tsconfig.json
```

---

## 🔒 Control de Acceso y Privacidad

- **Búsqueda Vectorial Aislada:** El retriever solo tiene visibilidad sobre la tabla `documents`.
- **Acceso Restringido por Tools:** La herramienta `consultar_empleados_y_roles` solo ejecuta consultas `SELECT` sobre `empleados` y `roles`.
- **Protección de Datos Confidenciales:** La tabla `clientes` no posee conectores, APIs ni herramientas en la aplicación, garantizando que ninguna técnica de *prompt injection* pueda extraer sus registros.

---

## 📄 Licencia

Este proyecto es de código abierto bajo la licencia MIT.
