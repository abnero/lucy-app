-- Bug #61. Snacks via chat ahora usan origen='snack_chat' y se borran en
-- regeneración como snack_sugerido y sugerencia. Aplicado a prod via MCP
-- el 5 may 2026. Este archivo lo documenta retroactivamente.

CREATE OR REPLACE FUNCTION replace_calendario_generado(p_user_id UUID, p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  row_count INTEGER;
BEGIN
  -- Delete old auto-generated, system-suggested, and chat-snack rows
  -- Only preserves origen='chat' (user swaps in main meals)
  DELETE FROM calendario
  WHERE user_id = p_user_id AND origen IN ('generado', 'snack_sugerido', 'sugerencia', 'snack_chat');

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
