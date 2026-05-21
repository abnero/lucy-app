-- Migration 024: leads_macros table for macros calculator lead capture
-- Aditivo: tabla nueva, no toca tablas existentes

CREATE TABLE IF NOT EXISTS leads_macros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  peso_lbs NUMERIC,
  altura_pies INT,
  altura_pulgadas INT,
  edad INT,
  nivel_actividad TEXT,
  meta TEXT,
  calorias INT,
  proteina INT,
  carbs INT,
  grasas INT,
  enviado_a_ghl BOOLEAN DEFAULT FALSE,
  fuente TEXT DEFAULT 'calculadora-macros'
);

-- RLS: solo service_role lee/escribe (no accesible via anon key)
ALTER TABLE leads_macros ENABLE ROW LEVEL SECURITY;

-- No policies for anon or authenticated — only service_role bypasses RLS
