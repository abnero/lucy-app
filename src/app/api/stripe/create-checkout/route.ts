import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    const sessionParams: Record<string, unknown> = {
      mode: 'payment',
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lucy.fit'}/pago/exito?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lucy.fit'}/pago`,
      metadata: { source: 'lucy_fit' },
    }

    if (email) {
      sessionParams.customer_email = email
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await getStripe().checkout.sessions.create(sessionParams as any)

    // ── Funnel: checkout_iniciado (non-blocking) ──
    try {
      const visitId = req.cookies.get('visit_id')?.value || null

      // Try to inherit UTM from the visita_landing row for this visit
      let utmSource: string | null = null
      let utmMedium: string | null = null
      let utmCampaign: string | null = null

      if (visitId) {
        const { data: visitRow } = await getServiceSupabase()
          .from('funnel_eventos')
          .select('utm_source, utm_medium, utm_campaign')
          .eq('session_id', visitId)
          .eq('tipo', 'visita_landing')
          .single()

        if (visitRow) {
          utmSource = visitRow.utm_source
          utmMedium = visitRow.utm_medium
          utmCampaign = visitRow.utm_campaign
        }
      }

      await getServiceSupabase()
        .from('funnel_eventos')
        .upsert(
          {
            tipo: 'checkout_iniciado',
            session_id: session.id,
            email: email?.toLowerCase() || null,
            monto: (session.amount_total ?? 0) / 100,
            utm_source: utmSource,
            utm_medium: utmMedium,
            utm_campaign: utmCampaign,
            metadata: { visit_id: visitId, source: 'create-checkout' },
            created_at: new Date().toISOString(),
          },
          { onConflict: 'session_id,tipo', ignoreDuplicates: true }
        )

      console.log(`[create-checkout][funnel] checkout_iniciado recorded for session ${session.id}`)
    } catch (funnelErr) {
      console.error('[create-checkout][funnel] insert failed:', funnelErr instanceof Error ? funnelErr.message : funnelErr)
    }

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[create-checkout] Error:', err)
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
