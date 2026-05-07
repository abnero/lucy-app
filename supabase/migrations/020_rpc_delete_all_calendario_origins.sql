-- Bug #74. Flujo 3 ("Cambiar mis alimentos") debe borrar TODO el calendario.
-- La RPC se llama solo desde /api/generar-plan cuando necesitaGenerarDesdeCero=true
-- (Flujo 1 onboarding o Flujo 3 rehacer wizard). Flujo 2 (re-escalado) no usa la RPC.
-- Borrar todos los orígenes (no solo 'generado') es seguro porque:
--   - Flujo 1: calendario vacío, el DELETE es no-op.
--   - Flujo 3: la usuaria rehizo el wizard = quiere plan nuevo completo.
-- Aplicado a prod via MCP el 7 may 2026.

CREATE OR REPLACE FUNCTION replace_calendario_generado(p_user_id UUID, p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  row_count INTEGER;
BEGIN
  -- Delete ALL calendar rows for this user (any origen)
  DELETE FROM calendario
  WHERE user_id = p_user_id;

  -- Delete old shopping list
  DELETE FROM lista_compras
  WHERE user_id = p_user_id;

  -- Insert new rows
  INSERT INTO calendario (user_id, dia, comida, alimento_id, cantidad, unidad, origen)
  SELECT
    p_user_id,
    (r->>'dia')::INTEGER,
    r->>'comida',
    (r->>'alimento_id')::UUID,
    (r->>'cantidad')::NUMERIC,
    r->>'unidad',
    'generado'
  FROM jsonb_array_elements(p_rows) AS r;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  RETURN row_count;
END;
$$;
