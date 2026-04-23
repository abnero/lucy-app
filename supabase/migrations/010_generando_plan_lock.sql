-- Bug #29 Fix #2: Lock de concurrencia para generar-plan
-- Columna timestamp que actúa como lock con TTL de 5 minutos.
-- Si generando_plan_at es reciente (< 5 min), el endpoint retorna 409.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS generando_plan_at TIMESTAMPTZ DEFAULT NULL;
