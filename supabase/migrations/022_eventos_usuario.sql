-- Telemetría de eventos de usuario para dashboard admin.
-- 8 eventos válidos: 5 page views + 3 acciones.
-- Data empieza desde merge (no backfill).

CREATE TABLE eventos_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT tipo_evento_valido CHECK (tipo_evento IN (
    'page_view_home',
    'page_view_plan',
    'page_view_lista_compras',
    'page_view_perfil',
    'page_view_chat',
    'action_marcar_comprado',
    'action_aceptar_sugerencia_banner',
    'action_swap_card'
  ))
);

CREATE INDEX idx_eventos_user_created ON eventos_usuario (user_id, created_at DESC);
CREATE INDEX idx_eventos_tipo_created ON eventos_usuario (tipo_evento, created_at DESC);

-- RLS: users insert/read own events. Admin reads via service_role key (bypasses RLS).
ALTER TABLE eventos_usuario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own events" ON eventos_usuario
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users read own events" ON eventos_usuario
  FOR SELECT USING (auth.uid() = user_id);
