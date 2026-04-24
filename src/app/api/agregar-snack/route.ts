import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createAuthenticatedClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createAuthenticatedClient(authHeader.replace('Bearer ', ''))
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { user_id, alimento_id, cantidad, dia } = body

  // Auth: user_id must match session
  if (user_id !== user.id) {
    return NextResponse.json({ error: 'user_id no coincide con sesión' }, { status: 403 })
  }

  // Validate alimento exists and has 'Snack' in rol_permitido
  const { data: alimento, error: aliErr } = await supabase
    .from('alimentos')
    .select('id, nombre, porcion_min, porcion_max, unidad_medida, rol_permitido')
    .eq('id', alimento_id)
    .single()

  if (aliErr || !alimento) {
    return NextResponse.json({ error: 'Alimento no encontrado' }, { status: 400 })
  }

  if (!(alimento.rol_permitido || []).includes('Snack')) {
    return NextResponse.json({ error: 'Alimento no es apto para snack' }, { status: 400 })
  }

  // Validate cantidad within [porcion_min, porcion_max]
  if (typeof cantidad !== 'number' || cantidad < alimento.porcion_min || cantidad > alimento.porcion_max) {
    return NextResponse.json({
      error: `Cantidad fuera de rango [${alimento.porcion_min}, ${alimento.porcion_max}]`,
    }, { status: 400 })
  }

  // Validate dia exists in user's calendar
  const { count } = await supabase
    .from('calendario')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user_id)
    .eq('dia', dia)

  if (!count || count === 0) {
    return NextResponse.json({ error: 'Día no existe en tu calendario' }, { status: 400 })
  }

  // No duplicate: check if (user_id, dia, comida='snack', alimento_id) already exists
  const { data: existing } = await supabase
    .from('calendario')
    .select('id')
    .eq('user_id', user_id)
    .eq('dia', dia)
    .eq('comida', 'snack')
    .eq('alimento_id', alimento_id)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'Este snack ya está en ese día' }, { status: 409 })
  }

  // INSERT
  const { data: inserted, error: insertErr } = await supabase
    .from('calendario')
    .insert({
      user_id,
      dia,
      comida: 'snack',
      alimento_id,
      cantidad,
      unidad: alimento.unidad_medida,
      origen: 'snack_sugerido',
    })
    .select('id, user_id, dia, comida, alimento_id, cantidad, unidad, origen')
    .single()

  if (insertErr) {
    console.error('[agregar-snack] INSERT error:', insertErr)
    return NextResponse.json({ error: 'Error al agregar snack' }, { status: 500 })
  }

  return NextResponse.json(inserted)
}
