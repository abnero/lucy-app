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

    // Insert historial BEFORE generar-plan (which can take 30+ sec and cause timeout)
    const { data: insertData, error: insertErr } = await sb.from('historial_coach').insert({
      coach_id: verified.coach.id,
      clienta_user_id: clientaUserId,
      calorias_antes: clienta.calorias_objetivo,
      calorias_despues: caloriasNuevas,
      proteina_antes: clienta.proteina_objetivo,
      proteina_despues: proteinaG,
      carbs_antes: clienta.carbs_objetivo,
      carbs_despues: carbsG,
      grasas_antes: clienta.grasas_objetivo,
      grasas_despues: grasasG,
      nota: nota ?? null,
    }).select()

    if (insertErr) {
      console.error('[historial] INSERT FAILED:', insertErr.message, insertErr.details, insertErr.hint, insertErr.code)
    } else {
      console.log('[historial] INSERT OK, id:', insertData?.[0]?.id)
    }

    // Regenerate calendar for the clienta (skip if regen paused)
    const regenPaused = process.env.LUCY_REGEN_PAUSED === 'true' || process.env.NEXT_PUBLIC_LUCY_REGEN_PAUSED === 'true'

    if (!regenPaused) {
      // generar-plan handles clearing calendario (filtered by origen='generado') and lista_compras
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lucy.fit'

      try {
        console.log('[ajustar-plan] Calling generar-plan for clienta:', clientaUserId)
        const genRes = await fetch(`${siteUrl}/api/generar-plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: clientaUserId, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY }),
        })
        const genData = await genRes.json()
        if (genData.error) {
          console.error('[ajustar-plan] generar-plan error:', genData.error)
        } else {
          console.log('[ajustar-plan] generar-plan OK:', genData.dias, 'dias,', genData.items, 'items')
        }
      } catch (genErr) {
        console.error('[ajustar-plan] generar-plan fetch failed:', genErr instanceof Error ? genErr.message : genErr)
      }
    } else {
      console.log('[ajustar-plan] SKIPPED generar-plan (regen paused). Macros updated, plan unchanged.')
    }

    // Insert Lucy message in clienta's chat
    const coachName = verified.coach.nombre || 'Tu coach'
    let lucyMsg = `Tu coach ${coachName} actualizó tu plan 💜\n\nNuevos macros:\n• Calorías: ${caloriasNuevas} kcal\n• Proteína: ${proteinaPct}% (${proteinaG}g)\n• Carbohidratos: ${carbsPct}% (${carbsG}g)\n• Grasas: ${grasasPct}% (${grasasG}g)`
    if (regenPaused) {
      lucyMsg += '\n\nTus nuevos macros están guardados. Tu calendario se actualizará pronto con estas nuevas cantidades.'
    }
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
