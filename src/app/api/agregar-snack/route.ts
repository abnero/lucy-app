import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calcularCompensaciones, type AlimentoCalendario, type Compensacion } from '@/lib/analisis-calorico'

function createAuthenticatedClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )
}

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
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
    .select('id, nombre, porcion_min, porcion_max, unidad_medida, calorias_por_unidad, proteina_por_unidad, porcion_base, rol_permitido')
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

  // Fetch user objectives
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('calorias_objetivo, proteina_objetivo')
    .eq('id', user_id)
    .single()

  if (!usuario) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 400 })
  }

  // Fetch day's current foods for compensation calculation
  const { data: dayFoods } = await supabase
    .from('calendario')
    .select('alimento_id, cantidad, unidad, comida, alimento:alimentos(nombre, calorias_por_unidad, proteina_por_unidad, porcion_base, porcion_min, porcion_max, unidad_medida, rol_permitido)')
    .eq('user_id', user_id)
    .eq('dia', dia)

  // Calculate snack's caloric/protein contribution
  const snackKcal = alimento.unidad_medida === 'unidad'
    ? cantidad * alimento.calorias_por_unidad
    : (cantidad * alimento.calorias_por_unidad) / alimento.porcion_base
  const snackProt = alimento.unidad_medida === 'unidad'
    ? cantidad * alimento.proteina_por_unidad
    : (cantidad * alimento.proteina_por_unidad) / alimento.porcion_base

  // Calculate compensations
  let compensaciones: Compensacion[] = []
  if (dayFoods && dayFoods.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alimentosDia: AlimentoCalendario[] = dayFoods.map((f: any) => {
      const a = Array.isArray(f.alimento) ? f.alimento[0] : f.alimento
      return {
        alimento_id: f.alimento_id,
        nombre: a?.nombre ?? '',
        cantidad: f.cantidad,
        unidad_medida: a?.unidad_medida ?? 'gramos',
        porcion_base: a?.porcion_base ?? 100,
        porcion_min: a?.porcion_min ?? 0,
        porcion_max: a?.porcion_max ?? 999,
        calorias_por_unidad: a?.calorias_por_unidad ?? 0,
        proteina_por_unidad: a?.proteina_por_unidad ?? 0,
        comida: f.comida,
        dia,
        rol_permitido: a?.rol_permitido ?? [],
      }
    })

    compensaciones = calcularCompensaciones(
      alimentosDia,
      snackKcal,
      snackProt,
      usuario.calorias_objetivo,
      usuario.proteina_objetivo,
    )
  }

  // Execute atomic transaction via RPC
  const serviceSb = getServiceSupabase()
  const { data: rpcResult, error: rpcErr } = await serviceSb.rpc('agregar_snack_con_compensacion', {
    p_user_id: user_id,
    p_dia: dia,
    p_alimento_id: alimento_id,
    p_cantidad: cantidad,
    p_unidad: alimento.unidad_medida,
    p_compensaciones: compensaciones.map(c => ({
      alimento_id: c.alimento_id,
      cantidad_despues: c.cantidad_despues,
    })),
  })

  if (rpcErr) {
    console.error('[agregar-snack] RPC error:', rpcErr)
    return NextResponse.json({ error: 'Error al agregar snack' }, { status: 500 })
  }

  return NextResponse.json({
    snack: {
      id: rpcResult?.snack_id,
      user_id,
      dia,
      comida: 'snack',
      alimento_id,
      cantidad,
      unidad: alimento.unidad_medida,
      origen: 'snack_sugerido',
      nombre: alimento.nombre,
    },
    compensaciones,
  })
}
