ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS genero TEXT DEFAULT 'femenino' CHECK (genero IN ('femenino', 'masculino'));
