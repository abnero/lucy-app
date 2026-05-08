-- Bug #77. Atomic DELETE+INSERT for preferencias_usuario in wizard.
-- The previous flow (separate DELETE then INSERT from JS client) had a race
-- window: if the browser closed or network dropped between the two calls,
-- preferencias would be 0 permanently.
-- Applied to prod via MCP on 7 May 2026.

CREATE OR REPLACE FUNCTION replace_preferencias(p_user_id UUID, p_prefs JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM preferencias_usuario WHERE user_id = p_user_id;
  DELETE FROM lista_compras WHERE user_id = p_user_id;
  INSERT INTO preferencias_usuario (user_id, alimento_id, categoria_comida)
  SELECT
    p_user_id,
    (r->>'alimento_id')::UUID,
    r->>'categoria_comida'
  FROM jsonb_array_elements(p_prefs) AS r;
END;
$$;
