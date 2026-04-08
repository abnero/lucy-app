-- ============================================
-- Fix alimentos que deberían estar en unidades
-- Generado: 2026-04-07
-- PENDIENTE DE CONFIRMACIÓN — NO EJECUTAR SIN APROBAR
-- ============================================

-- Huevo: ya actualizado previamente (unidad_medida='unidad', porcion_base=2)
-- Verificar: SELECT nombre, unidad_medida, porcion_base FROM alimentos WHERE nombre = 'Huevo';

-- Pan: 1 rebanada = ~30g, macros por rebanada
UPDATE alimentos SET
  unidad_medida = 'unidad',
  porcion_base = 1,
  porcion_min = 1,
  porcion_max = 4
WHERE nombre = 'Pan';
-- calorias_por_unidad ya es 80 (por 30g = 1 rebanada) — OK

-- Tortillas de Maiz: 1 tortilla = ~45g, macros ajustados por tortilla
UPDATE alimentos SET
  unidad_medida = 'unidad',
  porcion_base = 2,
  porcion_min = 1,
  porcion_max = 4,
  calorias_por_unidad = 109,
  proteina_por_unidad = 2.85,
  carbs_por_unidad = 23,
  grasas_por_unidad = 1.25,
  fibra_por_unidad = 2.1
WHERE nombre = 'Tortillas de Maiz';
-- Original: 218 cal por 100g. 1 tortilla (~45g) = 98 cal. Usando ~2 tortillas como porcion_base.

-- Tocineta: 2 tiras = ~30g (porcion_base actual ya es 30g)
UPDATE alimentos SET
  unidad_medida = 'unidad',
  porcion_base = 2,
  porcion_min = 1,
  porcion_max = 4,
  calorias_por_unidad = 81,
  proteina_por_unidad = 5.5,
  carbs_por_unidad = 0.2,
  grasas_por_unidad = 6.3
WHERE nombre = 'Tocineta';
-- Original: 541 cal por 100g. 1 tira (~15g) = 81 cal.

-- Tocineta de Pavo: 2 tiras = ~30g
UPDATE alimentos SET
  unidad_medida = 'unidad',
  porcion_base = 2,
  porcion_min = 1,
  porcion_max = 4,
  calorias_por_unidad = 33,
  proteina_por_unidad = 4.2,
  carbs_por_unidad = 0.15,
  grasas_por_unidad = 1.65
WHERE nombre = 'Tocineta de Pavo';
-- Original: 218 cal por 100g. 1 tira (~15g) = 33 cal.

-- ============================================
-- Alimentos que se QUEDAN en gramos (correcto):
-- Yogur Griego: se mide en gramos (150g porción típica)
-- Guineo: se podría poner en unidad pero 100g es estándar para frutas
-- Queso Cottage: se mide en gramos
-- Arroz, Pasta, Avena: se miden en gramos
-- ============================================

-- Verificación después de ejecutar:
-- SELECT nombre, unidad_medida, porcion_base, calorias_por_unidad
-- FROM alimentos
-- WHERE nombre IN ('Huevo', 'Pan', 'Tortillas de Maiz', 'Tocineta', 'Tocineta de Pavo');
