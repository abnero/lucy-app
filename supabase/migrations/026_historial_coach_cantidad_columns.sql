-- Support for per-item quantity adjustments by coach (feat/coach-editar-cantidad)
-- Adds columns to distinguish macro-level adjustments (tipo='macros') from
-- individual food quantity edits (tipo='cantidad').

ALTER TABLE historial_coach ADD COLUMN tipo TEXT NOT NULL DEFAULT 'macros';
ALTER TABLE historial_coach ADD COLUMN calendario_row_id UUID;
ALTER TABLE historial_coach ADD COLUMN alimento_nombre TEXT;
ALTER TABLE historial_coach ADD COLUMN cantidad_antes NUMERIC;
ALTER TABLE historial_coach ADD COLUMN cantidad_despues NUMERIC;
