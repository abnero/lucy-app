import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'
import Stripe from 'stripe'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature'
    console.error('[webhook] Signature verification failed:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  console.log(`[webhook] Event: ${event.type}`)

  const LUCY_PRICE_ID = 'price_1TLnvRRykkihHqQUAhdbGCtY'

  // ── Funnel: checkout_iniciado ──
  if ((event.type as string) === 'checkout.session.created') {
    const session = event.data.object as Stripe.Checkout.Session
    // Fetch line items to verify this is a Lucy checkout
    const lineItems = await getStripe().checkout.sessions.listLineItems(session.id, { limit: 5 })
    const isLucy = lineItems.data.some((li) => li.price?.id === LUCY_PRICE_ID)
    if (!isLucy) {
      console.log(`[webhook][funnel] session ${session.id} is not Lucy product, skipping`)
    } else {
      const meta = (session.metadata ?? {}) as Record<string, string>
      await getServiceSupabase()
        .from('funnel_eventos')
        .upsert(
          {
            tipo: 'checkout_iniciado',
            session_id: session.id,
            email: session.customer_details?.email ?? session.customer_email ?? null,
            monto: (session.amount_total ?? 0) / 100,
            utm_source: meta.utm_source ?? null,
            utm_medium: meta.utm_medium ?? null,
            utm_campaign: meta.utm_campaign ?? null,
            metadata: meta,
            created_at: new Date(session.created * 1000).toISOString(),
          },
          { onConflict: 'session_id,tipo', ignoreDuplicates: true }
        )
      console.log(`[webhook][funnel] checkout_iniciado recorded for session ${session.id}`)
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    // ── Funnel: checkout_completado (only for Lucy product) ──
    const lineItems = await getStripe().checkout.sessions.listLineItems(session.id, { limit: 5 })
    const isLucy = lineItems.data.some((li) => li.price?.id === LUCY_PRICE_ID)
    if (isLucy) {
      const meta = (session.metadata ?? {}) as Record<string, string>
      await getServiceSupabase()
        .from('funnel_eventos')
        .upsert(
          {
            tipo: 'checkout_completado',
            session_id: session.id,
            email: session.customer_details?.email ?? session.customer_email ?? null,
            monto: (session.amount_total ?? 0) / 100,
            utm_source: meta.utm_source ?? null,
            utm_medium: meta.utm_medium ?? null,
            utm_campaign: meta.utm_campaign ?? null,
            metadata: meta,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'session_id,tipo', ignoreDuplicates: true }
        )
      console.log(`[webhook][funnel] checkout_completado recorded for session ${session.id}`)
    } else {
      console.log(`[webhook][funnel] session ${session.id} is not Lucy product, skipping completado`)
    }

    if (session.payment_status !== 'paid') {
      console.log('[webhook] Session not paid yet, skipping')
      return NextResponse.json({ received: true })
    }

    const email = session.customer_email || session.customer_details?.email
    if (!email) {
      console.error('[webhook] No email in session')
      return NextResponse.json({ received: true })
    }

    const emailLower = email.toLowerCase()
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null

    // Idempotent — check if already processed
    const { data: existing } = await getServiceSupabase()
      .from('suscripciones')
      .select('id')
      .eq('email', emailLower)
      .eq('estado', 'activa')
      .single()

    if (!existing) {
      const fechaInicio = new Date()
      const fechaFin = new Date()
      fechaFin.setFullYear(fechaFin.getFullYear() + 1)

      await getServiceSupabase().from('suscripciones').insert({
        email: emailLower,
        stripe_customer_id: customerId,
        stripe_payment_intent_id: paymentIntentId,
        plan: 'anual',
        precio: 297,
        estado: 'activa',
        fecha_inicio: fechaInicio.toISOString(),
        fecha_fin: fechaFin.toISOString(),
      })
    }

    // Insert into emails_aprobados (idempotent)
    const { data: alreadyApproved } = await getServiceSupabase()
      .from('emails_aprobados')
      .select('id')
      .eq('email', emailLower)
      .single()

    if (!alreadyApproved) {
      await getServiceSupabase().from('emails_aprobados').insert({ email: emailLower })
    }

    // Set aprobado=true if user exists
    await getServiceSupabase().from('usuarios').update({ aprobado: true }).eq('email', emailLower)

    // Send approval email (non-blocking)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lucy.fit'
    fetch(`${siteUrl}/api/send-approval-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailLower }),
    }).catch(err => console.error('[webhook] Approval email failed:', err))

    console.log(`[webhook] Access activated for ${emailLower}`)

    // Tag contact in GoHighLevel (non-blocking — never affects account activation)
    try {
      const ghlToken = process.env.GHL_API_TOKEN
      const ghlLocationId = process.env.GHL_LOCATION_ID
      if (ghlToken && ghlLocationId) {
        const ghlHeaders = {
          'Authorization': `Bearer ${ghlToken}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        }
        const ghlBase = 'https://services.leadconnectorhq.com'

        // Search for existing contact by email
        const searchRes = await fetch(
          `${ghlBase}/contacts/?locationId=${ghlLocationId}&query=${encodeURIComponent(emailLower)}`,
          { headers: ghlHeaders }
        )

        if (!searchRes.ok) {
          const errBody = await searchRes.text().catch(() => '')
          console.error(`[webhook][GHL] Search failed: ${searchRes.status} ${errBody}`)
          throw new Error(`GHL search failed: ${searchRes.status}`)
        }

        const searchData = await searchRes.json()
        let contactId: string | null = null

        if (searchData.contacts && searchData.contacts.length > 0) {
          const exact = searchData.contacts.find(
            (c: { email?: string }) => c.email?.toLowerCase() === emailLower
          )
          contactId = exact?.id || null
        }

        if (contactId) {
          // Contact exists — add tag
          const tagRes = await fetch(`${ghlBase}/contacts/${contactId}/tags`, {
            method: 'POST',
            headers: ghlHeaders,
            body: JSON.stringify({ tags: ['lucy_comprado'] }),
          })
          if (!tagRes.ok) {
            const errBody = await tagRes.text().catch(() => '')
            console.error(`[webhook][GHL] Add tag failed: ${tagRes.status} ${errBody}`)
          } else {
            console.log(`[webhook][GHL] Tag lucy_comprado added to existing contact ${emailLower} (${contactId})`)
          }
        } else {
          // Contact doesn't exist — create with tag
          const createRes = await fetch(`${ghlBase}/contacts/`, {
            method: 'POST',
            headers: ghlHeaders,
            body: JSON.stringify({
              locationId: ghlLocationId,
              email: emailLower,
              tags: ['lucy_comprado'],
            }),
          })
          if (!createRes.ok) {
            // Case 3: duplicate contact — extract contactId from error and tag it
            const errData = await createRes.json().catch(() => null)
            const duplicateId = errData?.meta?.contactId as string | undefined
            if (createRes.status === 400 && duplicateId) {
              console.log(`[webhook][GHL] Contact ${emailLower} already exists (${duplicateId}) — adding tag`)
              const tagRes2 = await fetch(`${ghlBase}/contacts/${duplicateId}/tags`, {
                method: 'POST',
                headers: ghlHeaders,
                body: JSON.stringify({ tags: ['lucy_comprado'] }),
              })
              if (tagRes2.ok) {
                console.log(`[webhook][GHL] Tag lucy_comprado added to duplicate contact ${emailLower} (${duplicateId})`)
              } else {
                const tagErr = await tagRes2.text().catch(() => '')
                console.error(`[webhook][GHL] Add tag to duplicate failed: ${tagRes2.status} ${tagErr}`)
              }
            } else {
              console.error(`[webhook][GHL] Create contact failed: ${createRes.status} ${JSON.stringify(errData)}`)
            }
          } else {
            const createData = await createRes.json()
            contactId = createData.contact?.id || null
            console.log(`[webhook][GHL] Created contact ${emailLower} with tag lucy_comprado (${contactId})`)
          }
        }
      } else {
        console.warn('[webhook][GHL] GHL_API_TOKEN or GHL_LOCATION_ID not configured — skipping tag')
      }
    } catch (ghlErr) {
      console.error('[webhook][GHL] Failed to tag contact:', ghlErr instanceof Error ? ghlErr.message : ghlErr)
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent
    const email = paymentIntent.receipt_email

    if (email) {
      await getServiceSupabase()
        .from('suscripciones')
        .update({ estado: 'fallida' })
        .eq('email', email.toLowerCase())
        .eq('stripe_payment_intent_id', paymentIntent.id)
    }

    console.log(`[webhook] Payment failed for ${email || 'unknown'}`)
  }

  return NextResponse.json({ received: true })
}
