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

  const { data: coach } = await sb.from('coaches').select('id, nombre, email').eq('user_id', user.id).single()
  if (!coach) return null

  return { user, coach }
}

interface AlimentoData {
  nombre: string
  calorias_por_unidad: number
  proteina_por_unidad: number
  carbs_por_unidad: number
  grasas_por_unidad: number
  porcion_base: number
  unidad_medida: string
}

function calcMacros(cantidad: number, a: AlimentoData) {
  const ratio = a.unidad_medida === 'unidad' ? cantidad : cantidad / (a.porcion_base || 100)
  return {
    cal: a.calorias_por_unidad * ratio,
    prot: a.proteina_por_unidad * ratio,
    carbs: a.carbs_por_unidad * ratio,
    grasas: a.grasas_por_unidad * ratio,
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const verified = await verifyCoach(authHeader)
    if (!verified) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { clientaUserId, calendarioRowId, cantidadNueva } = await req.json()

    if (!clientaUserId || !calendarioRowId || cantidadNueva == null) {
      return NextResponse.json({ error: 'clientaUserId, calendarioRowId, and cantidadNueva required' }, { status: 400 })
    }

    if (typeof cantidadNueva !== 'number' || cantidadNueva <= 0) {
      return NextResponse.json({ error: 'cantidadNueva must be a positive number' }, { status: 400 })
    }

    const sb = getServiceSupabase()

    // 1. Read the calendar row with food data
    const { data: row, error: rowErr } = await sb
      .from('calendario')
      .select('id, user_id, dia, comida, cantidad, unidad, alimento_id, alimento:alimentos(nombre, calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad, porcion_base, unidad_medida)')
      .eq('id', calendarioRowId)
      .single()

    if (rowErr || !row) {
      return NextResponse.json({ error: 'Calendar row not found' }, { status: 404 })
    }

    if (row.user_id !== clientaUserId) {
      return NextResponse.json({ error: 'Row does not belong to this clienta' }, { status: 403 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alimento: AlimentoData = Array.isArray(row.alimento) ? (row.alimento as any)[0] : row.alimento as any
    if (!alimento) {
      return NextResponse.json({ error: 'Food data not found for this row' }, { status: 404 })
    }

    // 2. Validate technical ceiling (prevents typos, not nutritional limit)
    const maxCantidad = alimento.unidad_medida === 'unidad' ? 50 : 2000
    if (cantidadNueva > maxCantidad) {
      return NextResponse.json({
        error: `Cantidad exceeds technical limit (max ${maxCantidad}${alimento.unidad_medida === 'unidad' ? ' units' : 'g'})`,
      }, { status: 400 })
    }

    const cantidadAntes = row.cantidad

    // 3. Update the calendar row
    const { error: updateErr } = await sb
      .from('calendario')
      .update({ cantidad: cantidadNueva, origen: 'coach' })
      .eq('id', calendarioRowId)

    if (updateErr) {
      return NextResponse.json({ error: 'Error updating: ' + updateErr.message }, { status: 500 })
    }

    // 4. Log in historial_coach
    const { error: histErr } = await sb.from('historial_coach').insert({
      coach_id: verified.coach.id,
      clienta_user_id: clientaUserId,
      tipo: 'cantidad',
      calendario_row_id: calendarioRowId,
      alimento_nombre: alimento.nombre,
      cantidad_antes: cantidadAntes,
      cantidad_despues: cantidadNueva,
      nota: null,
    })

    if (histErr) {
      console.error('[ajustar-cantidad] historial INSERT failed:', histErr.message)
    }

    // 5. Rebuild lista_compras (same pattern as generar-plan)
    const { data: allCalRows } = await sb
      .from('calendario')
      .select('alimento_id, cantidad, unidad')
      .eq('user_id', clientaUserId)

    if (allCalRows) {
      const comprasMap = new Map<string, { alimentoId: string; cantidad: number; unidad: string }>()
      for (const r of allCalRows) {
        const existing = comprasMap.get(r.alimento_id)
        if (existing) {
          existing.cantidad += r.cantidad
        } else {
          comprasMap.set(r.alimento_id, { alimentoId: r.alimento_id, cantidad: r.cantidad, unidad: r.unidad })
        }
      }

      await sb.from('lista_compras').delete().eq('user_id', clientaUserId)

      const comprasRows = Array.from(comprasMap.values()).map(c => ({
        user_id: clientaUserId,
        alimento_id: c.alimentoId,
        cantidad_total: c.cantidad,
        unidad: c.unidad,
        comprado: false,
      }))

      if (comprasRows.length > 0) {
        const { error: shopErr } = await sb.from('lista_compras').insert(comprasRows)
        if (shopErr) console.error('[ajustar-cantidad] lista_compras error:', shopErr.message)
      }
    }

    // 6. Compute macros for the meal and the full day
    const { data: dayRows } = await sb
      .from('calendario')
      .select('comida, cantidad, alimento:alimentos(calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad, porcion_base, unidad_medida)')
      .eq('user_id', clientaUserId)
      .eq('dia', row.dia)

    const macrosComida = { cal: 0, prot: 0, carbs: 0, grasas: 0 }
    const macrosDia = { cal: 0, prot: 0, carbs: 0, grasas: 0 }

    if (dayRows) {
      for (const dr of dayRows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a: AlimentoData = Array.isArray(dr.alimento) ? (dr.alimento as any)[0] : dr.alimento as any
        if (!a) continue
        const m = calcMacros(dr.cantidad, a)

        macrosDia.cal += m.cal
        macrosDia.prot += m.prot
        macrosDia.carbs += m.carbs
        macrosDia.grasas += m.grasas

        if (dr.comida === row.comida) {
          macrosComida.cal += m.cal
          macrosComida.prot += m.prot
          macrosComida.carbs += m.carbs
          macrosComida.grasas += m.grasas
        }
      }
    }

    // Round for display
    const round = (n: number) => Math.round(n)

    console.log(`[ajustar-cantidad] ${alimento.nombre}: ${cantidadAntes} → ${cantidadNueva} (coach: ${verified.coach.email}, clienta: ${clientaUserId})`)

    return NextResponse.json({
      success: true,
      macrosComida: { cal: round(macrosComida.cal), prot: round(macrosComida.prot), carbs: round(macrosComida.carbs), grasas: round(macrosComida.grasas) },
      macrosDia: { cal: round(macrosDia.cal), prot: round(macrosDia.prot), carbs: round(macrosDia.carbs), grasas: round(macrosDia.grasas) },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
