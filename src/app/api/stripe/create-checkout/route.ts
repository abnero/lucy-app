import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'

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

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[create-checkout] Error:', err)
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
