-- 015_add_meta_to_conversaciones.sql
-- Adds nullable JSONB column for telemetry (loop_exhausted, suspected_lie, etc.)

ALTER TABLE conversaciones ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT NULL;
