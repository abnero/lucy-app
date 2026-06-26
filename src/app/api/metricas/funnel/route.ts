import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_USER_ID = '57c22f0f-5d15-4b8e-ba80-070383f8c11e'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  // Auth: Bearer token, admin only
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.replace('Bearer ', '')
  const sb = getServiceSupabase()
  const { data: { user }, error: authError } = await sb.auth.getUser(token)
  if (authError || !user || user.id !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const range = req.nextUrl.searchParams.get('range') || 'this_month'
  const now = new Date()
  let since: string

  if (range === '30d') {
    const d = new Date(now)
    d.setDate(d.getDate() - 30)
    since = d.toISOString()
  } else if (range === 'all') {
    since = '2020-01-01T00:00:00.000Z'
  } else {
    // this_month
    since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  }

  // Funnel events
  const { data: funnelRows } = await sb
    .from('funnel_eventos')
    .select('tipo, session_id, utm_source')
    .gte('created_at', since)

  const events = funnelRows || []

  const visitSessions = new Set<string>()
  let checkoutIni = 0
  let checkoutComp = 0
  const utmVisits: Record<string, number> = {}
  const utmCompletados: Record<string, number> = {}

  for (const row of events) {
    const src = row.utm_source || 'directo'
    if (row.tipo === 'visita_landing') {
      visitSessions.add(row.session_id)
      utmVisits[src] = (utmVisits[src] || 0) + 1
    } else if (row.tipo === 'checkout_iniciado') {
      checkoutIni++
    } else if (row.tipo === 'checkout_completado') {
      checkoutComp++
      utmCompletados[src] = (utmCompletados[src] || 0) + 1
    }
  }

  const visitas = visitSessions.size

  // Suscripciones (ventas) — exclude internal accounts
  const { data: internos } = await sb
    .from('usuarios')
    .select('email')
    .eq('es_interno', true)

  const internosSet = new Set((internos || []).map((u) => u.email?.toLowerCase()))

  const { data: suscRows } = await sb
    .from('suscripciones')
    .select('id, precio, email')
    .eq('estado', 'activa')
    .gte('fecha_inicio', since)

  const suscs = (suscRows || []).filter((s) => !internosSet.has(s.email?.toLowerCase()))
  const ventasCount = suscs.length
  const ventasMonto = suscs.reduce((sum, s) => sum + (s.precio || 0), 0)

  // Conversion rates (safe division)
  const convVisitaCheckout = visitas > 0 ? checkoutIni / visitas : null
  const convCheckoutComp = checkoutIni > 0 ? checkoutComp / checkoutIni : null
  const convVisitaVenta = visitas > 0 ? ventasCount / visitas : null

  // UTM table
  const allSources = new Set([...Object.keys(utmVisits), ...Object.keys(utmCompletados)])
  const utmTable = Array.from(allSources).map(src => ({
    source: src,
    visitas: utmVisits[src] || 0,
    completados: utmCompletados[src] || 0,
  })).sort((a, b) => b.visitas - a.visitas)

  // Reconciliation check
  const reconciliationOk = checkoutComp === ventasCount

  return NextResponse.json({
    range,
    visitas,
    checkoutIni,
    checkoutComp,
    ventasCount,
    ventasMonto,
    convVisitaCheckout,
    convCheckoutComp,
    convVisitaVenta,
    utmTable,
    reconciliation: {
      ok: reconciliationOk,
      checkoutComp,
      ventasCount,
    },
  })
}
