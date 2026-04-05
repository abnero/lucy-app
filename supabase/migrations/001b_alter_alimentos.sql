-- ============================================
-- Agregar columnas nuevas a tabla alimentos
-- ============================================
ALTER TABLE alimentos ADD COLUMN IF NOT EXISTS fibra_por_unidad DECIMAL(6,2) DEFAULT 0;
ALTER TABLE alimentos ADD COLUMN IF NOT EXISTS porcion_base DECIMAL(7,2);
ALTER TABLE alimentos ADD COLUMN IF NOT EXISTS porcion_min DECIMAL(7,2);
ALTER TABLE alimentos ADD COLUMN IF NOT EXISTS porcion_max DECIMAL(7,2);
ALTER TABLE alimentos ADD COLUMN IF NOT EXISTS rol_permitido TEXT[];
