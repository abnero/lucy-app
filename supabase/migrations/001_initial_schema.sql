-- ============================================
-- Lucy App - Esquema inicial
-- ============================================

-- 1. Usuarios — perfil completo de la usuaria
CREATE TABLE usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  email TEXT,
  peso_lbs DECIMAL(6,2),
  peso_kg DECIMAL(6,2),
  altura_pies DECIMAL(4,2),
  altura_cm DECIMAL(5,2),
  edad INTEGER,
  nivel_actividad TEXT CHECK (nivel_actividad IN ('sedentario', 'ligero', 'moderado', 'activo', 'muy_activo')),
  meta TEXT CHECK (meta IN ('perder_peso', 'mantener_peso', 'ganar_masa', 'comer_saludable', 'energia')),
  calorias_objetivo INTEGER,
  proteina_objetivo INTEGER,
  carbs_objetivo INTEGER,
  grasas_objetivo INTEGER,
  onboarding_completado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Alimentos — catálogo de alimentos
CREATE TABLE alimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  categoria_comida TEXT NOT NULL CHECK (categoria_comida IN ('proteina', 'carbohidrato', 'vegetal', 'fruta', 'lacteo', 'grasa', 'bebida', 'condimento', 'otro')),
  calorias_por_unidad DECIMAL(7,2) NOT NULL,
  proteina_por_unidad DECIMAL(6,2) DEFAULT 0,
  carbs_por_unidad DECIMAL(6,2) DEFAULT 0,
  grasas_por_unidad DECIMAL(6,2) DEFAULT 0,
  fibra_por_unidad DECIMAL(6,2) DEFAULT 0,
  unidad_medida TEXT NOT NULL DEFAULT 'gramos',
  porcion_base DECIMAL(7,2),
  porcion_min DECIMAL(7,2),
  porcion_max DECIMAL(7,2),
  rol_permitido TEXT[],
  foto_url TEXT,
  categoria_supermercado TEXT CHECK (categoria_supermercado IN ('carnes', 'frutas_verduras', 'lacteos', 'granos_cereales', 'enlatados', 'condimentos', 'bebidas', 'congelados', 'panaderia', 'otro')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Preferencias de usuario — alimentos seleccionados por usuaria y categoría
CREATE TABLE preferencias_usuario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  alimento_id UUID NOT NULL REFERENCES alimentos(id) ON DELETE CASCADE,
  categoria_comida TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, alimento_id)
);

-- 4. Calendario — plan de 7 días por usuaria
CREATE TABLE calendario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  dia INTEGER NOT NULL CHECK (dia BETWEEN 1 AND 7),
  comida TEXT NOT NULL CHECK (comida IN ('desayuno', 'almuerzo', 'cena', 'snack')),
  alimento_id UUID NOT NULL REFERENCES alimentos(id) ON DELETE CASCADE,
  cantidad DECIMAL(7,2) NOT NULL DEFAULT 1,
  unidad TEXT NOT NULL DEFAULT 'porcion',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Lista de compras — cantidad total semanal por alimento por usuaria
CREATE TABLE lista_compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  alimento_id UUID NOT NULL REFERENCES alimentos(id) ON DELETE CASCADE,
  cantidad_total DECIMAL(7,2) NOT NULL DEFAULT 0,
  unidad TEXT NOT NULL DEFAULT 'unidad',
  comprado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, alimento_id)
);

-- 6. Conversaciones — historial de chat con Lucy
CREATE TABLE conversaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Índices
-- ============================================
CREATE INDEX idx_preferencias_user_id ON preferencias_usuario(user_id);
CREATE INDEX idx_preferencias_alimento_id ON preferencias_usuario(alimento_id);
CREATE INDEX idx_calendario_user_id ON calendario(user_id);
CREATE INDEX idx_calendario_dia ON calendario(user_id, dia);
CREATE INDEX idx_lista_compras_user_id ON lista_compras(user_id);
CREATE INDEX idx_conversaciones_user_id ON conversaciones(user_id);
CREATE INDEX idx_conversaciones_created_at ON conversaciones(user_id, created_at);
CREATE INDEX idx_alimentos_categoria ON alimentos(categoria_comida);

-- ============================================
-- Trigger: actualizar updated_at automáticamente
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE alimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferencias_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario ENABLE ROW LEVEL SECURITY;
ALTER TABLE lista_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversaciones ENABLE ROW LEVEL SECURITY;

-- Usuarios: solo la usuaria ve/edita su propio perfil
CREATE POLICY "Users can view own profile"
  ON usuarios FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON usuarios FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON usuarios FOR INSERT WITH CHECK (auth.uid() = id);

-- Alimentos: todas las usuarias autenticadas pueden leer el catálogo
CREATE POLICY "Authenticated users can view alimentos"
  ON alimentos FOR SELECT USING (auth.role() = 'authenticated');

-- Preferencias: solo la usuaria ve/edita sus preferencias
CREATE POLICY "Users can view own preferencias"
  ON preferencias_usuario FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferencias"
  ON preferencias_usuario FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own preferencias"
  ON preferencias_usuario FOR DELETE USING (auth.uid() = user_id);

-- Calendario: solo la usuaria ve/edita su calendario
CREATE POLICY "Users can view own calendario"
  ON calendario FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own calendario"
  ON calendario FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own calendario"
  ON calendario FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own calendario"
  ON calendario FOR DELETE USING (auth.uid() = user_id);

-- Lista de compras: solo la usuaria ve/edita su lista
CREATE POLICY "Users can view own lista_compras"
  ON lista_compras FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own lista_compras"
  ON lista_compras FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own lista_compras"
  ON lista_compras FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own lista_compras"
  ON lista_compras FOR DELETE USING (auth.uid() = user_id);

-- Conversaciones: solo la usuaria ve/crea sus mensajes
CREATE POLICY "Users can view own conversaciones"
  ON conversaciones FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conversaciones"
  ON conversaciones FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Función: crear perfil automáticamente al registrarse
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usuarios (id, nombre, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', 'Usuaria'),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
