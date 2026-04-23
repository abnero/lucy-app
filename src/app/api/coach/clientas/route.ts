import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function verifyCoach(authHeader: string) {
  if (!authHeader.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')

  const sb = getServiceSupabase()
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) return null

  const { data: coach } = await sb.from('coaches').select('id, nombre').eq('user_id', user.id).single()
  if (!coach) return null

  return { user, coach }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const verified = await verifyCoach(authHeader)
    if (!verified) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const sb = getServiceSupabase()
    const { data, error } = await sb
      .from('usuarios')
      .select('id, email, nombre, calorias_objetivo, proteina_objetivo, carbs_objetivo, grasas_objetivo, meta, onboarding_completado')
      .order('nombre')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ clientas: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: fetch a specific clienta's calendar + historial
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const verified = await verifyCoach(authHeader)
    if (!verified) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { clientaId } = await req.json()
    if (!clientaId) return NextResponse.json({ error: 'clientaId required' }, { status: 400 })

    const sb = getServiceSupabase()

    const [calRes, histRes] = await Promise.all([
      sb
        .from('calendario')
        .select('dia, comida, cantidad, unidad, alimento:alimentos(nombre, foto_url, categoria_comida, calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad, porcion_base, unidad_medida, unidad_display, factor_conversion)')
        .eq('user_id', clientaId)
        .order('dia')
        .order('comida'),
      sb
        .from('historial_coach')
        .select('id, created_at, coach_id, calorias_antes, calorias_despues, proteina_antes, proteina_despues, carbs_antes, carbs_despues, grasas_antes, grasas_despues, nota, coach:coaches!coach_id(email)')
        .eq('clienta_user_id', clientaId)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    return NextResponse.json({
      calendario: calRes.data || [],
      historial: histRes.data || [],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
