import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe } from '@/lib/stripe'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function activateAccess(email: string, customerId: string | null, paymentIntentId: string | null) {
  const sb = getServiceSupabase()
  const emailLower = email.toLowerCase()

  // 1. Insert into suscripciones (idempotent — skip if already exists)
  const { data: existing } = await sb
    .from('suscripciones')
    .select('id')
    .eq('email', emailLower)
    .eq('estado', 'activa')
    .single()

  if (!existing) {
    const fechaInicio = new Date()
    const fechaFin = new Date()
    fechaFin.setFullYear(fechaFin.getFullYear() + 1)

    await sb.from('suscripciones').insert({
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

  // 2. Insert into emails_aprobados (idempotent)
  const { data: alreadyApproved } = await sb
    .from('emails_aprobados')
    .select('id')
    .eq('email', emailLower)
    .single()

  if (!alreadyApproved) {
    await sb.from('emails_aprobados').insert({ email: emailLower })
  }

  // 3. If user already exists in usuarios, set aprobado=true
  await sb.from('usuarios').update({ aprobado: true }).eq('email', emailLower)

  // 4. Send approval email (non-blocking)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lucy.fit'
  fetch(`${siteUrl}/api/send-approval-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailLower }),
  }).catch(err => console.error('[verify-session] Approval email failed:', err))

  // 5. Check if user already has an account
  const { data: existingUser } = await sb
    .from('usuarios')
    .select('id')
    .eq('email', emailLower)
    .single()

  return { isNewUser: !existingUser }
}

export async function POST(req: NextRequest) {
  try {
    const { session_id } = await req.json()
    if (!session_id) {
      return NextResponse.json({ error: 'session_id required' }, { status: 400 })
    }

    const session = await getStripe().checkout.sessions.retrieve(session_id, {
      expand: ['customer', 'payment_intent'],
    })

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 })
    }

    const email = session.customer_email || session.customer_details?.email
    if (!email) {
      return NextResponse.json({ error: 'No email found in session' }, { status: 400 })
    }

    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null

    const { isNewUser } = await activateAccess(email, customerId, paymentIntentId)

    return NextResponse.json({ success: true, email, isNewUser })
  } catch (err) {
    console.error('[verify-session] Error:', err)
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
