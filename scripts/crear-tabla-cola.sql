-- ========================================================
-- TABLA: webhook_queue (Cola Durable para Webhooks)
-- Implementación de los principios de docs/cola.md:
-- 1. Desacople: El webhook inserta aquí y responde 200 inmediatamente.
-- 2. Durabilidad: Persiste en PostgreSQL, sobrevive a caídas de la API.
-- 3. Idempotencia: event_id único previene duplicados en reintentos del proveedor.
-- 4. Reintentos y DLQ: attempts y max_attempts gestionan el backoff y pase a DLQ.
-- ========================================================

create table if not exists webhook_queue (
  id bigint primary key generated always as identity,
  event_id text not null unique,
  provider text not null default 'whatsapp',
  from_number text not null,
  payload jsonb not null,
  status text not null default 'pending', -- pending, processing, completed, failed, dlq
  attempts int not null default 0,
  max_attempts int not null default 3,
  last_error text,
  next_retry_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  processed_at timestamptz
);

-- Índice optimizado para el sondeo del worker (pendientes y reintentos programados)
create index if not exists idx_webhook_queue_status_retry 
on webhook_queue (status, next_retry_at) 
where status in ('pending', 'failed');

-- Índice de idempotencia
create unique index if not exists idx_webhook_queue_event_id 
on webhook_queue (event_id);

-- ========================================================
-- FUNCIÓN: dequeue_webhook_event
-- Utiliza FOR UPDATE SKIP LOCKED para consumo concurrente y seguro por múltiples workers
-- ========================================================
create or replace function dequeue_webhook_event()
returns setof webhook_queue
language plpgsql
as $$
declare
  item_id bigint;
begin
  select id into item_id
  from webhook_queue
  where (status = 'pending' or (status = 'failed' and attempts < max_attempts))
    and next_retry_at <= now()
  order by created_at asc
  limit 1
  for update skip locked;

  if item_id is not null then
    update webhook_queue
    set status = 'processing',
        updated_at = now()
    where id = item_id;

    return query select * from webhook_queue where id = item_id;
  end if;
end;
$$;
