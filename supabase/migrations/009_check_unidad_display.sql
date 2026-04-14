-- Ensure alimentos with rol_permitido must have unidad_display set
ALTER TABLE alimentos ADD CONSTRAINT check_unidad_display_not_null
CHECK (
  rol_permitido = ARRAY[]::text[]
  OR rol_permitido IS NULL
  OR unidad_display IS NOT NULL
);
