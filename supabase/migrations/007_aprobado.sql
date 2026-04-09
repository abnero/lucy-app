ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aprobado BOOLEAN DEFAULT false;
UPDATE usuarios SET aprobado = true WHERE onboarding_completado = true;
