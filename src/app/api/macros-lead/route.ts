import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const { email, inputs, resultado } = await req.json()

    // Validate email server-side
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
    }

    if (!inputs || !resultado) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    // Calculate nivel_actividad from q1/q2/q3
    const score = (inputs.q1 ?? 0) + (inputs.q2 ?? 0) + (inputs.q3 ?? 0)
    const nivel_actividad = score <= 2 ? 'A' : score <= 4 ? 'B' : 'C'

    // Map meta from calculadora format to Lucy format
    const metaMap: Record<string, string> = {
      perder: 'perder_peso',
      mantener: 'mantener_peso',
      ganar: 'ganar_masa',
    }

    const sb = getServiceSupabase()

    // INSERT into leads_macros
    const { data: insertedRow, error: insertErr } = await sb.from('leads_macros').insert({
      email,
      peso_lbs: inputs.peso,
      altura_pies: inputs.pies,
      altura_pulgadas: inputs.pulgadas,
      edad: inputs.edad,
      nivel_actividad,
      meta: metaMap[inputs.meta] || inputs.meta,
      calorias: resultado.calorias,
      proteina: resultado.proteina,
      carbs: resultado.carbs,
      grasas: resultado.grasas,
      fuente: 'calculadora-macros',
    }).select('id').single()

    if (insertErr || !insertedRow) {
      console.error('[macros-lead] Insert error:', insertErr?.message)
      return NextResponse.json({ error: 'Error guardando lead' }, { status: 500 })
    }

    const leadId = insertedRow.id

    // POST to GHL webhook
    const ghlUrl = process.env.GHL_MACROS_WEBHOOK_URL
    let enviado_a_ghl = false

    if (ghlUrl) {
      try {
        const ghlPayload = {
          email,
          calorias: resultado.calorias,
          proteina: resultado.proteina,
          carbs: resultado.carbs,
          grasas: resultado.grasas,
          meta: inputs.meta, // "perder" | "mantener" | "ganar"
          peso_lbs: inputs.peso,
          altura_pies: inputs.pies,
          altura_pulgadas: inputs.pulgadas,
          edad: inputs.edad,
          nivel_actividad,
          fuente: 'calculadora-macros',
        }

        const ghlRes = await fetch(ghlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ghlPayload),
        })

        if (ghlRes.ok) {
          enviado_a_ghl = true
          console.log('[macros-lead] GHL webhook OK')
        } else {
          console.error('[macros-lead] GHL webhook failed:', ghlRes.status, await ghlRes.text().catch(() => ''))
        }
      } catch (ghlErr) {
        console.error('[macros-lead] GHL webhook error:', ghlErr instanceof Error ? ghlErr.message : ghlErr)
      }

      // Update enviado_a_ghl status using exact row ID
      if (enviado_a_ghl) {
        await sb.from('leads_macros').update({ enviado_a_ghl: true }).eq('id', leadId)
      }
    } else {
      console.warn('[macros-lead] GHL_MACROS_WEBHOOK_URL not configured')
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[macros-lead] Error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
