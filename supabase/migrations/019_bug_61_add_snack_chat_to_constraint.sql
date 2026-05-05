-- Bug #61. Añade 'snack_chat' a la check constraint origen_valido de calendario.
-- Necesario para que executeAgregarSnack pueda insertar con el nuevo origen.
-- Aplicado a prod via MCP el 5 may 2026 antes de migration 018.

ALTER TABLE calendario DROP CONSTRAINT IF EXISTS origen_valido;
ALTER TABLE calendario ADD CONSTRAINT origen_valido
  CHECK (origen = ANY (ARRAY['generado', 'chat', 'coach', 'sugerencia', 'snack_sugerido', 'snack_chat']));
