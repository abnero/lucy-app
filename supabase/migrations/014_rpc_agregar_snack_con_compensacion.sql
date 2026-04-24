-- 014_rpc_agregar_snack_con_compensacion.sql
-- Atomic RPC: inserts snack + applies compensations in one transaction

CREATE OR REPLACE FUNCTION agregar_snack_con_compensacion(
  p_user_id uuid,
  p_dia int,
  p_alimento_id uuid,
  p_cantidad numeric,
  p_unidad text,
  p_compensaciones jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snack_id uuid;
  v_comp jsonb;
  v_alimento_id uuid;
  v_cantidad_nueva numeric;
  v_result jsonb;
BEGIN
  -- 1. Insert snack
  INSERT INTO calendario (user_id, dia, comida, alimento_id, cantidad, unidad, origen)
  VALUES (p_user_id, p_dia, 'snack', p_alimento_id, p_cantidad, p_unidad, 'snack_sugerido')
  RETURNING id INTO v_snack_id;

  -- 2. Apply compensations (reduce other foods)
  FOR v_comp IN SELECT * FROM jsonb_array_elements(p_compensaciones)
  LOOP
    v_alimento_id := (v_comp->>'alimento_id')::uuid;
    v_cantidad_nueva := (v_comp->>'cantidad_despues')::numeric;

    UPDATE calendario
    SET cantidad = v_cantidad_nueva,
        origen = 'sugerencia'
    WHERE user_id = p_user_id
      AND dia = p_dia
      AND alimento_id = v_alimento_id
      AND comida != 'snack';
  END LOOP;

  -- 3. Return result
  v_result := jsonb_build_object(
    'snack_id', v_snack_id,
    'compensaciones_aplicadas', jsonb_array_length(p_compensaciones)
  );

  RETURN v_result;
END;
$$;
