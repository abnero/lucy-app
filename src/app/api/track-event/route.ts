import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const VALID_EVENTS = new Set([
  'page_view_plan',
  'page_view_lista_compras',
  'page_view_perfil',
  'page_view_chat',
  'action_marcar_comprado',
  'action_aceptar_sugerencia_banner',
  'action_swap_card',
])

function createAuthenticatedClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const { userId, accessToken, tipo_evento, metadata } = await req.json()

    if (!userId || !accessToken) {
      return NextResponse.json({ error: 'Missing auth' }, { status: 401 })
    }

    if (!tipo_evento || !VALID_EVENTS.has(tipo_evento)) {
      return NextResponse.json(
        { error: `Invalid tipo_evento. Valid: ${Array.from(VALID_EVENTS).join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = createAuthenticatedClient(accessToken)

    // Telemetry never blocks UX — log error but return 200
    const { error } = await supabase.from('eventos_usuario').insert({
      user_id: userId,
      tipo_evento,
      metadata: metadata || null,
    })

    if (error) {
      console.error('[track-event] Insert error:', error.message, 'user:', userId, 'event:', tipo_evento)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[track-event] Unexpected error:', err)
    // Still return 200 — telemetry must never break UX
    return NextResponse.json({ success: true })
  }
}
