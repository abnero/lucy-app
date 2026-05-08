'use client'

import { useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'

type TipoEvento =
  | 'page_view_home'
  | 'page_view_plan'
  | 'page_view_lista_compras'
  | 'page_view_perfil'
  | 'page_view_chat'
  | 'action_marcar_comprado'
  | 'action_aceptar_sugerencia_banner'
  | 'action_swap_card'

export function useTrackEvent() {
  const { user, session } = useAuth()

  return useCallback(
    (tipo_evento: TipoEvento, metadata?: Record<string, unknown>) => {
      if (!user?.id || !session?.access_token) return

      // Fire-and-forget — never block UI
      fetch('/api/track-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          accessToken: session.access_token,
          tipo_evento,
          metadata,
        }),
      }).catch(() => {
        // Telemetry must never break UX
      })
    },
    [user?.id, session?.access_token]
  )
}
