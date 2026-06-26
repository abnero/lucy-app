import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const ALLOWED_HOSTS = new Set([
  'www.lucy.fit',
  'lucy.fit',
  'lucy-app.vercel.app',
])

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const to = searchParams.get('to')

  // ── Validate destination ──
  if (!to) {
    return NextResponse.json({ error: 'Missing ?to= parameter' }, { status: 400 })
  }

  let dest: URL
  try {
    // Allow relative paths (resolve against own origin)
    dest = new URL(to, req.nextUrl.origin)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  // Whitelist: only Lucy domains or same-origin relative paths
  if (!ALLOWED_HOSTS.has(dest.hostname)) {
    return NextResponse.json({ error: 'Redirect domain not allowed' }, { status: 403 })
  }

  // ── Visit ID cookie (30 min, httpOnly) ──
  const existingVisitId = req.cookies.get('visit_id')?.value
  const visitId = existingVisitId || randomUUID()

  // ── Insert funnel event (non-blocking) ──
  const utmSource = searchParams.get('utm_source') || null
  const utmMedium = searchParams.get('utm_medium') || null
  const utmCampaign = searchParams.get('utm_campaign') || null
  const referer = req.headers.get('referer') || null

  getServiceSupabase()
    .from('funnel_eventos')
    .upsert(
      {
        tipo: 'visita_landing',
        session_id: visitId,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        metadata: { referer, to: dest.toString() },
        created_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,tipo', ignoreDuplicates: true }
    )
    .then(({ error }) => {
      if (error) console.error('[/r] funnel insert failed:', error.message)
    })

  // ── Redirect (never blocked by insert) ──
  const response = NextResponse.redirect(dest.toString(), 302)
  response.cookies.set('visit_id', visitId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 30 * 60, // 30 minutes
    path: '/',
  })

  return response
}
