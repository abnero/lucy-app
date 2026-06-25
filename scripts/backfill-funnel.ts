/**
 * One-off backfill: populate funnel_eventos from Stripe checkout sessions (last 120 days).
 *
 * Usage:
 *   npx tsx scripts/backfill-funnel.ts
 *
 * Required env vars: STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const LUCY_PRICE_ID = 'price_1TLnvRRykkihHqQUAhdbGCtY'

async function main() {
  const since = Math.floor(Date.now() / 1000) - 120 * 24 * 60 * 60
  let totalSessions = 0
  let lucyMatch = 0
  let skipped = 0
  let insertedIniciado = 0
  let insertedCompletado = 0

  console.log(`Fetching checkout sessions created since ${new Date(since * 1000).toISOString()}...`)
  console.log(`Filtering for Lucy price: ${LUCY_PRICE_ID}`)

  // Auto-paginated iteration — no expand, line items fetched per session
  for await (const session of stripe.checkout.sessions.list({ limit: 100, created: { gte: since } })) {
    totalSessions++

    // Fetch line items per session (same approach as webhook)
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5 })
    const isLucy = lineItems.data.some((li) => li.price?.id === LUCY_PRICE_ID)
    if (!isLucy) {
      skipped++
      if (totalSessions % 50 === 0) {
        process.stdout.write(`\r  Scanned ${totalSessions} sessions (${lucyMatch} Lucy, ${skipped} skipped)...`)
      }
      continue
    }

    lucyMatch++
    const meta = (session.metadata ?? {}) as Record<string, string>
    const email = session.customer_details?.email ?? session.customer_email ?? null

    // checkout_iniciado for every Lucy session
    const { error: e1 } = await supabase.from('funnel_eventos').upsert(
      {
        tipo: 'checkout_iniciado',
        session_id: session.id,
        email,
        monto: (session.amount_total ?? 0) / 100,
        utm_source: meta.utm_source ?? null,
        utm_medium: meta.utm_medium ?? null,
        utm_campaign: meta.utm_campaign ?? null,
        metadata: meta,
        created_at: new Date(session.created * 1000).toISOString(),
      },
      { onConflict: 'session_id,tipo', ignoreDuplicates: true }
    )
    if (!e1) insertedIniciado++

    // checkout_completado only if paid/complete
    if (session.payment_status === 'paid' || session.status === 'complete') {
      const { error: e2 } = await supabase.from('funnel_eventos').upsert(
        {
          tipo: 'checkout_completado',
          session_id: session.id,
          email,
          monto: (session.amount_total ?? 0) / 100,
          utm_source: meta.utm_source ?? null,
          utm_medium: meta.utm_medium ?? null,
          utm_campaign: meta.utm_campaign ?? null,
          metadata: meta,
          created_at: new Date(session.created * 1000).toISOString(),
        },
        { onConflict: 'session_id,tipo', ignoreDuplicates: true }
      )
      if (!e2) insertedCompletado++
    }

    process.stdout.write(`\r  Scanned ${totalSessions} sessions (${lucyMatch} Lucy, ${skipped} skipped)...`)
  }

  const totalInserted = insertedIniciado + insertedCompletado

  console.log(`\n\nDone!`)
  console.log(`  Total sessions scanned: ${totalSessions}`)
  console.log(`  Lucy match: ${lucyMatch}`)
  console.log(`  Skipped (not Lucy): ${skipped}`)
  console.log(`  checkout_iniciado inserted: ${insertedIniciado}`)
  console.log(`  checkout_completado inserted: ${insertedCompletado}`)

  if (totalInserted === 0 && skipped > 0) {
    console.error('\x1b[31m⚠️  POSIBLE FALLA DE FILTRO — revisar antes de confiar en el resultado\x1b[0m')
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
