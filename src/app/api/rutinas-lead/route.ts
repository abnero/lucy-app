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
    const { email, empresa } = await req.json()

    // Honeypot: bots fill this hidden field, humans don't
    if (empresa) {
      console.log('[rutinas-lead] Honeypot triggered, ignoring submission')
      return NextResponse.json({ success: true })
    }

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
    }

    const sb = getServiceSupabase()

    // INSERT into leads_rutinas, capture id
    const { data: insertedRow, error: insertErr } = await sb.from('leads_rutinas').insert({
      email,
      fuente: 'landing-rutinas',
    }).select('id').single()

    if (insertErr || !insertedRow) {
      console.error('[rutinas-lead] Insert error:', insertErr?.message)
      return NextResponse.json({ error: 'Error guardando lead' }, { status: 500 })
    }

    const leadId = insertedRow.id

    // POST to GHL webhook
    const ghlUrl = process.env.GHL_RUTINAS_WEBHOOK_URL
    let enviado_a_ghl = false

    if (ghlUrl) {
      try {
        const ghlRes = await fetch(ghlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, fuente: 'landing-rutinas' }),
        })

        if (ghlRes.ok) {
          enviado_a_ghl = true
          console.log('[rutinas-lead] GHL webhook OK')
        } else {
          console.error('[rutinas-lead] GHL webhook failed:', ghlRes.status, await ghlRes.text().catch(() => ''))
        }
      } catch (ghlErr) {
        console.error('[rutinas-lead] GHL webhook error:', ghlErr instanceof Error ? ghlErr.message : ghlErr)
      }

      if (enviado_a_ghl) {
        await sb.from('leads_rutinas').update({ enviado_a_ghl: true }).eq('id', leadId)
      }
    } else {
      console.warn('[rutinas-lead] GHL_RUTINAS_WEBHOOK_URL not configured')
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[rutinas-lead] Error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
