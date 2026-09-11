# Configuración de Base de Datos en Supabase

Este documento detalla los scripts SQL y la estructura de las tablas necesarias en **Supabase** para el proyecto de Chat IA con RAG (Next.js + LangChain + Gemini + WhatsApp).

---

## 1. Habilitar la extensión `vector` (pgvector)

Antes de crear las tablas vectoriales, es necesario habilitar la extensión `vector`:

* **Desde SQL Editor:** Ejecutar `create extension if not exists vector;`
* **Desde el panel UI:** Ir a **Database** -> **Extensions** -> Buscar `vector` y activarlo.

---

## 2. Tabla 1: `documents` (Base Vectorial para RAG)

Utilizada por **LangChain** (`SupabaseVectorStore`) durante:
- **Fase 1 (Ingesta):** Guardar los chunks de los archivos `.md` y sus embeddings.
- **Fase 2 y 3 (Consulta/RAG):** Buscar fragmentos relevantes por similitud coseno.

### Estructura de campos

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `bigint primary key generated always as identity` | Identificador autoincremental de la fila |
| `content` | `text` | Texto del fragmento (chunk) del documento `.md` |
| `metadata` | `jsonb` | Metadatos asociados (ej. nombre de archivo, ruta, título) |
| `embedding` | `vector(768)` | Vector de embeddings de **768 dimensiones** (generado por `text-embedding-004` de Gemini) |

> [!IMPORTANT]
> Google Gemini (`text-embedding-004`) genera vectores de dimensión **768**. Si se utiliza otro proveedor en el futuro (como OpenAI con 1536), este parámetro debe ajustarse según el modelo.

### Función `match_documents`

LangChain invoca mediante RPC esta función PostgreSQL para calcular la distancia coseno (`<=>`) y filtrar por similitud semántica.

```sql
-- 1. Habilitar pgvector
create extension if not exists vector;

-- 2. Crear tabla documents
create table if not exists documents (
  id bigint primary key generated always as identity,
  content text,
  metadata jsonb,
  embedding vector(768)
);

-- 3. Crear función de búsqueda por similitud
create or replace function match_documents (
  query_embedding vector(768),
  match_count int default null,
  filter jsonb default '{}'
) returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
```

---

## 3. Tabla 2: `conversaciones` (Historial de Mensajes)

Utilizada para mantener memoria y contexto conversacional multi-turno tanto en la interfaz Web como en WhatsApp.

### Estructura de campos

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `bigint primary key generated always as identity` | Identificador único del mensaje |
| `user_id` | `text not null` | Identificador del usuario: número de teléfono en WhatsApp (ej. `+58412...`) o identificador de sesión en Web |
| `role` | `text not null` | Rol del emisor: `'user'` o `'assistant'` |
| `content` | `text not null` | Contenido del mensaje |
| `created_at` | `timestamptz default now()` | Fecha y hora de creación del mensaje |

```sql
create table if not exists conversaciones (
  id bigint primary key generated always as identity,
  user_id text not null,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

-- Índice para optimizar consultas de historial ordenadas por fecha
create index if not exists idx_conversaciones_user_id on conversaciones(user_id, created_at desc);
```

---

## 4. Script SQL Consolidado (Copiar y Pegar en Supabase)

Para inicializar todo de una sola vez en el **SQL Editor** de Supabase:

```sql
-- ========================================================
-- 1. EXTENSIÓN VECTORIAL
-- ========================================================
create extension if not exists vector;

-- ========================================================
-- 2. TABLA Y FUNCIÓN PARA RAG (LangChain + Gemini)
-- ========================================================
create table if not exists documents (
  id bigint primary key generated always as identity,
  content text,
  metadata jsonb,
  embedding vector(768)
);

create or replace function match_documents (
  query_embedding vector(768),
  match_count int default null,
  filter jsonb default '{}'
) returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ========================================================
-- 3. TABLA PARA HISTORIAL DE CONVERSACIONES
-- ========================================================
create table if not exists conversaciones (
  id bigint primary key generated always as identity,
  user_id text not null,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

create index if not exists idx_conversaciones_user_id on conversaciones(user_id, created_at desc);
```
