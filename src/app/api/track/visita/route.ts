import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  // Read or create visit_id cookie
  const existingVisitId = req.cookies.get('visit_id')?.value
  const visitId = existingVisitId || randomUUID()

  try {
    const body = await req.json()
    const { utm_source, utm_medium, utm_campaign, referer, path } = body

    await getServiceSupabase().rpc('upsert_visita_landing', {
      p_session_id: visitId,
      p_utm_source: utm_source || null,
      p_utm_medium: utm_medium || null,
      p_utm_campaign: utm_campaign || null,
      p_metadata: { referer: referer || null, path: path || null },
    })
  } catch (err) {
    console.error('[track/visita] insert failed:', err instanceof Error ? err.message : err)
  }

  const response = new NextResponse(null, { status: 204 })

  if (!existingVisitId) {
    response.cookies.set('visit_id', visitId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 30 * 60,
      path: '/',
    })
  }

  return response
}
