-- Migration 025: leads_rutinas table for rutinas landing lead capture
-- Aditivo: tabla nueva, no toca tablas existentes

CREATE TABLE IF NOT EXISTS leads_rutinas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  enviado_a_ghl BOOLEAN DEFAULT FALSE,
  fuente TEXT DEFAULT 'landing-rutinas'
);

-- RLS: solo service_role lee/escribe (no accesible via anon key)
ALTER TABLE leads_rutinas ENABLE ROW LEVEL SECURITY;
