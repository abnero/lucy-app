-- Bug #45-E + Path E. Aplicado a prod via MCP el 4 may 2026 sin migration file.
-- Este archivo lo documenta retroactivamente para que cualquier recreación de
-- schema desde cero (staging, backup restore) preserve el comportamiento.
--
-- Cambio: la RPC replace_calendario_generado ahora borra origen IN ('generado',
-- 'snack_sugerido', 'sugerencia') en vez de solo 'generado'. Solo preserva
-- origen='chat' (decisiones activas de la usuaria via Lucy chat).

CREATE OR REPLACE FUNCTION replace_calendario_generado(p_user_id UUID, p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  row_count INTEGER;
BEGIN
  -- Delete old auto-generated and system-suggested rows (preserve only 'chat')
  DELETE FROM calendario
  WHERE user_id = p_user_id AND origen IN ('generado', 'snack_sugerido', 'sugerencia');

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
