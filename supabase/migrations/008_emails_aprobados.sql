CREATE TABLE IF NOT EXISTS emails_aprobados (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  aprobado_por TEXT DEFAULT 'admin',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE emails_aprobados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON emails_aprobados USING (true) WITH CHECK (true);
