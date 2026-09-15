-- Crea la tabla para almacenar la información de las instancias de Evolution API
CREATE TABLE IF NOT EXISTS evolution_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instance_name TEXT NOT NULL UNIQUE,
    instance_id UUID NOT NULL,
    integration TEXT,
    status TEXT,
    hash TEXT,
    qr_scanned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Asegurar políticas de seguridad básica (RLS)
ALTER TABLE evolution_instances ENABLE ROW LEVEL SECURITY;

-- Crear política para permitir que el backend con service role pueda leer/escribir libremente
CREATE POLICY "Permitir todo al service_role en evolution_instances"
ON evolution_instances
FOR ALL
USING (auth.role() = 'service_role' OR auth.role() = 'postgres');

-- También si deseas permitir anon temporalmente desde la app:
-- CREATE POLICY "Permitir todo al anon (solo pruebas)" ON evolution_instances FOR ALL USING (true);
