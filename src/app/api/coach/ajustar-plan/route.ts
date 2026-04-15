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

    // Insert historial
    await sb.from('historial_coach').insert({
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

    // Regenerate calendar for the clienta
    // Get a service-level access token by getting the user's session
    // Since we use service role, we call generar-plan internally
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lucy.fit'

    // We need the clienta's access token for generar-plan (which uses authenticated client)
    // Instead, we'll clear and regenerate using service role directly
    await sb.from('calendario').delete().eq('user_id', clientaUserId)
    await sb.from('lista_compras').delete().eq('user_id', clientaUserId)

    // Call generar-plan via internal fetch (it needs userId + accessToken)
    // Since we can't get the clienta's access token, we use a workaround:
    // Import and call the generation logic. For now, just clear and let the clienta
    // regenerate on next login. OR we can trigger it server-side.
    // Best approach: call the API with service role workaround
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

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
