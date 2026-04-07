-- Add columns for custom/personalized foods (Tier 2)
ALTER TABLE alimentos
  ADD COLUMN IF NOT EXISTS es_personalizado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS creado_por UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS fuente TEXT DEFAULT 'catalogo';
  -- fuente: 'catalogo', 'usda', 'usuario'

-- Allow authenticated users to insert custom foods
CREATE POLICY "Authenticated users can insert alimentos"
  ON alimentos FOR INSERT WITH CHECK (auth.role() = 'authenticated');
