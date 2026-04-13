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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

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
    const customerId = typeof session.customer === 'string' ? session.customer : null
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null

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
