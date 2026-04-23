-- Bug #29 Fix #3: Transacción atómica DELETE+INSERT para calendario
-- Envuelve DELETE de origen='generado' + INSERT de rows nuevas en una transacción.
-- Si el INSERT falla, el DELETE se revierte automáticamente.
CREATE OR REPLACE FUNCTION replace_calendario_generado(
  p_user_id UUID,
  p_rows JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  row_count INTEGER;
BEGIN
  -- Delete old auto-generated rows
  DELETE FROM calendario
  WHERE user_id = p_user_id AND origen = 'generado';

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
