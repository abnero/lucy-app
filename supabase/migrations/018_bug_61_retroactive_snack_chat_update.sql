-- Bug #61. Migración retroactiva: rows con origen='chat' y comida='snack' fueron
-- creados antes del fix de Bug #61 (cuando executeAgregarSnack insertaba con
-- origen='chat'). Filosóficamente esos rows son auxiliares al plan viejo y deben
-- comportarse igual que snack_sugerido — borrarse al regenerar. Aplicado a prod
-- via MCP el 5 may 2026.

UPDATE calendario
SET origen = 'snack_chat'
WHERE origen = 'chat'
  AND comida = 'snack';
