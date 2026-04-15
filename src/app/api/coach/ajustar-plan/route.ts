import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function verifyCoach(authHeader: string) {
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return null

  const sb = getServiceSupabase()
  const { data: coach } = await sb.from('coaches').select('id, nombre, email').eq('user_id', user.id).single()
  if (!coach) return null

  return { user, coach }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const verified = await verifyCoach(authHeader)
    if (!verified) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { clientaUserId, caloriasNuevas, proteinaPct, carbsPct, grasasPct, nota } = await req.json()
    console.log('[ajustar-plan] Input:', { clientaUserId, caloriasNuevas, proteinaPct, carbsPct, grasasPct, coachId: verified.coach.id, coachEmail: verified.coach.email })
    if (!clientaUserId || !caloriasNuevas) {
      return NextResponse.json({ error: 'clientaUserId and caloriasNuevas required' }, { status: 400 })
    }

    const sb = getServiceSupabase()

    // Read current values
    const { data: clienta, error: readErr } = await sb
      .from('usuarios')
      .select('nombre, calorias_objetivo, proteina_objetivo, carbs_objetivo, grasas_objetivo')
      .eq('id', clientaUserId)
      .single()

    if (readErr || !clienta) {
      return NextResponse.json({ error: 'Clienta not found' }, { status: 404 })
    }

    // Calculate new grams
    const proteinaG = Math.round((caloriasNuevas * proteinaPct / 100) / 4)
    const carbsG = Math.round((caloriasNuevas * carbsPct / 100) / 4)
    const grasasG = Math.round((caloriasNuevas * grasasPct / 100) / 9)

    // Update usuarios
    const { error: updateErr } = await sb
      .from('usuarios')
      .update({
        calorias_objetivo: caloriasNuevas,
        proteina_objetivo: proteinaG,
        carbs_objetivo: carbsG,
        grasas_objetivo: grasasG,
      })
      .eq('id', clientaUserId)

    if (updateErr) {
      return NextResponse.json({ error: 'Error updating: ' + updateErr.message }, { status: 500 })
    }

    // Regenerate calendar for the clienta
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lucy.fit'

    await sb.from('calendario').delete().eq('user_id', clientaUserId)
    await sb.from('lista_compras').delete().eq('user_id', clientaUserId)

    try {
      const genRes = await fetch(`${siteUrl}/api/generar-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: clientaUserId, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY }),
      })
      const genData = await genRes.json()
      if (genData.error) {
        console.error('[ajustar-plan] generar-plan error:', genData.error)
      }
    } catch (genErr) {
      console.error('[ajustar-plan] generar-plan fetch failed:', genErr)
    }

    // Insert Lucy message in clienta's chat
    const coachName = verified.coach.nombre || 'Tu coach'
    let lucyMsg = `Tu coach ${coachName} actualizó tu plan 💜\n\nNuevos macros:\n• Calorías: ${caloriasNuevas} kcal\n• Proteína: ${proteinaPct}% (${proteinaG}g)\n• Carbohidratos: ${carbsPct}% (${carbsG}g)\n• Grasas: ${grasasPct}% (${grasasG}g)`
    if (nota) {
      lucyMsg += `\n\nNota de tu coach: ${nota}`
    }

    await sb.from('conversaciones').insert({
      user_id: clientaUserId,
      role: 'assistant',
      content: lucyMsg,
    })

    // Insert historial — at the end so logs don't get truncated by generar-plan
    console.log('[ajustar-plan] INSERT historial_coach con coach_id:', verified.coach.id, 'clienta:', clientaUserId)
    const { error: historialError } = await sb.from('historial_coach').insert({
      coach_id: verified.coach.id,
      coach_email: verified.coach.email,
      clienta_user_id: clientaUserId,
      calorias_antes: clienta.calorias_objetivo,
      proteina_antes: clienta.proteina_objetivo,
      carbs_antes: clienta.carbs_objetivo,
      grasas_antes: clienta.grasas_objetivo,
      calorias_despues: caloriasNuevas,
      proteina_despues: proteinaG,
      carbs_despues: carbsG,
      grasas_despues: grasasG,
      nota: nota || null,
    })

    if (historialError) {
      console.error('[ajustar-plan] INSERT historial_coach FAILED:', JSON.stringify(historialError))
    } else {
      console.log('[ajustar-plan] INSERT historial_coach OK')
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
