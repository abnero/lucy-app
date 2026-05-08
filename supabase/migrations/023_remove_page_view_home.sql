-- Remove page_view_home from valid events. mi-calendario IS the home page
-- post-login and already fires page_view_plan. Keeping an event that never
-- fires is tech debt. Applied to prod via MCP on 8 May 2026.

ALTER TABLE eventos_usuario DROP CONSTRAINT tipo_evento_valido;

ALTER TABLE eventos_usuario ADD CONSTRAINT tipo_evento_valido CHECK (tipo_evento IN (
  'page_view_plan',
  'page_view_lista_compras',
  'page_view_perfil',
  'page_view_chat',
  'action_marcar_comprado',
  'action_aceptar_sugerencia_banner',
  'action_swap_card'
));
