import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_USER_ID = '57c22f0f-5d15-4b8e-ba80-070383f8c11e'

const INTERNAL_EMAILS = new Set([
  'coachabner@caribeno.fit',
  'coach.melina.espinosa@gmail.com',
  'sport_fitness@live.com.mx',
  'abnero@gmail.com',
  'josefinavilsilva@gmail.com',
])

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  try {
    // Auth check
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user || user.id !== ADMIN_USER_ID) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sb = getServiceSupabase()

    // Paginated fetch helper — handles Supabase 1000 row default limit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchAll = async (table: string, select: string): Promise<any[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all: any[] = []
      let from = 0
      const PAGE = 1000
      let iterations = 0
      while (true) {
        iterations++
        if (iterations > 50) {
          console.warn(`[metricas] fetchAll('${table}') exceeded 50 iterations — aborting`)
          break
        }
        const { data } = await sb.from(table).select(select).range(from, from + PAGE - 1)
        if (!data || data.length === 0) break
        all.push(...data)
        if (data.length < PAGE) break
        from += PAGE
      }
      console.log(`[metricas] ${table}: ${all.length} rows in ${iterations} page(s)`)
      return all
    }

    // Fetch all data with pagination
    const [usuarios, convos, calRows, histRows] = await Promise.all([
      fetchAll('usuarios', 'id, email, nombre, created_at, onboarding_completado, calorias_objetivo'),
      fetchAll('conversaciones', 'user_id, role, created_at'),
      fetchAll('calendario', 'user_id'),
      fetchAll('historial_coach', 'clienta_user_id'),
    ])

    const now = new Date()

    // Pre-compute sets
    const usersWithCal = new Set(calRows.map(r => r.user_id))

    // Group convos by user
    const convosByUser: Record<string, { role: string; created_at: string }[]> = {}
    for (const c of convos) {
      if (!convosByUser[c.user_id]) convosByUser[c.user_id] = []
      convosByUser[c.user_id].push(c)
    }

    // Count hist by user
    const histByUser: Record<string, number> = {}
    for (const h of histRows) {
      histByUser[h.clienta_user_id] = (histByUser[h.clienta_user_id] || 0) + 1
    }

    // Build per-user metrics
    const userMetrics = usuarios.map(u => {
      const email = (u.email || '').toLowerCase()
      const isInternal = INTERNAL_EMAILS.has(email)
      const userConvos = convosByUser[u.id] || []
      const userMsgs = userConvos.filter(c => c.role === 'user')

      // Last interaction (any message)
      let ultimaInteraccion: string | null = null
      if (userConvos.length > 0) {
        ultimaInteraccion = userConvos.reduce((max, c) => c.created_at > max ? c.created_at : max, userConvos[0].created_at)
      }

      // Unique active days
      const activeDays = (days: number) => {
        const cutoff = new Date(now.getTime() - days * 86400000).toISOString()
        const dates = new Set(
          userMsgs.filter(c => c.created_at >= cutoff).map(c => c.created_at.slice(0, 10))
        )
        return dates.size
      }

      return {
        id: u.id,
        email: u.email,
        nombre: u.nombre,
        isInternal,
        createdAt: u.created_at,
        onboardingCompleto: !!u.onboarding_completado,
        tieneCalendario: usersWithCal.has(u.id),
        ultimaInteraccion,
        totalMensajes: userMsgs.length,
        diasActivos7d: activeDays(7),
        diasActivos14d: activeDays(14),
        diasActivos30d: activeDays(30),
        modificacionesCalendario: histByUser[u.id] || 0,
      }
    })

    // Sort: non-internal first (by ultima interaccion desc), then internal
    userMetrics.sort((a, b) => {
      if (a.isInternal !== b.isInternal) return a.isInternal ? 1 : -1
      const aDate = a.ultimaInteraccion || '0'
      const bDate = b.ultimaInteraccion || '0'
      return bDate.localeCompare(aDate)
    })

    // Summary (only real beta testers)
    const reales = userMetrics.filter(u => !u.isInternal)
    const totalBeta = reales.length
    const completaronOnboarding = reales.filter(u => u.onboardingCompleto).length
    const generaronCalendario = reales.filter(u => u.tieneCalendario).length

    const h24 = new Date(now.getTime() - 86400000).toISOString()
    const h7d = new Date(now.getTime() - 7 * 86400000).toISOString()

    const dau = reales.filter(u => u.ultimaInteraccion && u.ultimaInteraccion >= h24).length
    const wau = reales.filter(u => u.ultimaInteraccion && u.ultimaInteraccion >= h7d).length

    // Retention: users who signed up >7d ago AND were active in last 7d
    const signedUp7dAgo = reales.filter(u => u.createdAt < h7d)
    const retencion7d = signedUp7dAgo.length > 0
      ? Math.round((signedUp7dAgo.filter(u => u.diasActivos7d > 0).length / signedUp7dAgo.length) * 100)
      : 0

    const h14d = new Date(now.getTime() - 14 * 86400000).toISOString()
    const signedUp14dAgo = reales.filter(u => u.createdAt < h14d)
    const retencion14d = signedUp14dAgo.length > 0
      ? Math.round((signedUp14dAgo.filter(u => u.diasActivos14d > 0).length / signedUp14dAgo.length) * 100)
      : 0

    // Users without calendar (real only)
    const sinCalendario = reales
      .filter(u => !u.tieneCalendario)
      .map(u => ({
        email: u.email,
        nombre: u.nombre,
        diasDesdeSingup: Math.floor((now.getTime() - new Date(u.createdAt).getTime()) / 86400000),
        ultimaInteraccion: u.ultimaInteraccion,
      }))
      .sort((a, b) => b.diasDesdeSingup - a.diasDesdeSingup)

    return NextResponse.json({
      resumen: {
        totalBeta,
        completaronOnboarding,
        completaronOnboardingPct: totalBeta > 0 ? Math.round((completaronOnboarding / totalBeta) * 100) : 0,
        generaronCalendario,
        generaronCalendarioPct: totalBeta > 0 ? Math.round((generaronCalendario / totalBeta) * 100) : 0,
        dau,
        wau,
        retencion7d,
        retencion14d,
      },
      usuarios: userMetrics,
      sinCalendario,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
