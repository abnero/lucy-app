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

    await getServiceSupabase()
      .from('funnel_eventos')
      .upsert(
        {
          tipo: 'visita_landing',
          session_id: visitId,
          utm_source: utm_source || null,
          utm_medium: utm_medium || null,
          utm_campaign: utm_campaign || null,
          metadata: { referer: referer || null, path: path || null },
          created_at: new Date().toISOString(),
        },
        { onConflict: 'session_id,tipo', ignoreDuplicates: true }
      )
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
