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
  try {
    // Auth check (Bug #25 pattern)
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')

    const sb = getServiceSupabase()
    const { data: { user }, error: authError } = await sb.auth.getUser(token)

    if (authError || !user || user.id !== ADMIN_USER_ID) {
      console.error('[admin/metricas] auth failed:', {
        hasUser: !!user,
        errorMessage: authError?.message,
        userId: user?.id,
      })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchAll = async (table: string, select: string, filter?: { col: string; op: string; val: unknown }): Promise<any[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all: any[] = []
      let from = 0
      const PAGE = 1000
      let iterations = 0
      while (true) {
        iterations++
        if (iterations > 50) break
        let query = sb.from(table).select(select).range(from, from + PAGE - 1)
        if (filter) {
          if (filter.op === 'eq') query = query.eq(filter.col, filter.val)
        }
        const { data } = await query
        if (!data || data.length === 0) break
        all.push(...data)
        if (data.length < PAGE) break
        from += PAGE
      }
      return all
    }

    // Fetch all data
    const [usuarios, convos, calRows, histRows, alimentos] = await Promise.all([
      fetchAll('usuarios', 'id, email, nombre, created_at, onboarding_completado, calorias_objetivo, proteina_objetivo, re_onboarding_completado, es_interno'),
      fetchAll('conversaciones', 'user_id, role, created_at'),
      fetchAll('calendario', 'user_id, dia, comida, cantidad, alimento_id'),
      fetchAll('historial_coach', 'clienta_user_id'),
      fetchAll('alimentos', 'id, calorias_por_unidad, proteina_por_unidad, porcion_base, unidad_medida, porcion_min'),
    ])

    const now = new Date()

    // Build alimento lookup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alimentoMap = new Map<string, any>()
    for (const a of alimentos) alimentoMap.set(a.id, a)

    // Pre-compute per-user calendar metrics
    const calByUser: Record<string, typeof calRows> = {}
    for (const r of calRows) {
      if (!calByUser[r.user_id]) calByUser[r.user_id] = []
      calByUser[r.user_id].push(r)
    }

    // Group convos by user
    const convosByUser: Record<string, { role: string; created_at: string }[]> = {}
    for (const c of convos) {
      if (!convosByUser[c.user_id]) convosByUser[c.user_id] = []
      convosByUser[c.user_id].push(c)
    }

    const histByUser: Record<string, number> = {}
    for (const h of histRows) {
      histByUser[h.clienta_user_id] = (histByUser[h.clienta_user_id] || 0) + 1
    }

    // Build per-user metrics
    const userMetrics = usuarios.map(u => {
      const isInternal = !!u.es_interno
      const userConvos = convosByUser[u.id] || []
      const userMsgs = userConvos.filter(c => c.role === 'user')
      const userCal = calByUser[u.id] || []

      let ultimaInteraccion: string | null = null
      if (userConvos.length > 0) {
        ultimaInteraccion = userConvos.reduce((max, c) => c.created_at > max ? c.created_at : max, userConvos[0].created_at)
      }

      const activeDays = (days: number) => {
        const cutoff = new Date(now.getTime() - days * 86400000).toISOString()
        return new Set(userMsgs.filter(c => c.created_at >= cutoff).map(c => c.created_at.slice(0, 10))).size
      }

      // Nutritional health metrics
      let calReal = 0
      let protReal = 0
      let comPrinc = 0
      let subMins = 0
      const pool = new Set<string>()
      const entries = userCal.length

      if (entries > 0) {
        // Daily totals
        const dailyCal: Record<number, number> = {}
        const dailyProt: Record<number, number> = {}
        const mealSlots = new Set<string>()

        for (const r of userCal) {
          const a = alimentoMap.get(r.alimento_id)
          if (!a) continue
          pool.add(r.alimento_id)
          const ratio = a.unidad_medida === 'unidad' ? r.cantidad : r.cantidad / (a.porcion_base || 100)
          const cal = a.calorias_por_unidad * ratio
          const prot = (a.proteina_por_unidad || 0) * ratio
          dailyCal[r.dia] = (dailyCal[r.dia] || 0) + cal
          dailyProt[r.dia] = (dailyProt[r.dia] || 0) + prot
          if (['desayuno', 'almuerzo', 'cena'].includes(r.comida)) {
            mealSlots.add(`${r.dia}-${r.comida}`)
          }
          if (a.porcion_min && a.porcion_min > 0 && r.cantidad < a.porcion_min) {
            subMins++
          }
        }

        const days = Object.values(dailyCal)
        calReal = days.length > 0 ? Math.round(days.reduce((s, v) => s + v, 0) / days.length) : 0
        const protDays = Object.values(dailyProt)
        protReal = protDays.length > 0 ? Math.round(protDays.reduce((s, v) => s + v, 0) / protDays.length) : 0
        comPrinc = mealSlots.size
      }

      const calMeta = u.calorias_objetivo || 0
      const protMeta = u.proteina_objetivo || 0
      const pctCal = calMeta > 0 && entries > 0 ? Math.round(((calReal - calMeta) / calMeta) * 100) : null
      const pctProt = protMeta > 0 && entries > 0 ? Math.round(((protReal - protMeta) / protMeta) * 100) : null

      // Veredicto
      let veredicto: string
      if (entries === 0) veredicto = '🔴 sin calendario'
      else if (comPrinc < 21) veredicto = '🔴 plan incompleto'
      else if (subMins >= 5) veredicto = '🔴 sub-mins severo'
      else if (pctCal !== null && Math.abs(pctCal) > 20) veredicto = '🔴 déficit cal severo'
      else if (pctProt !== null && Math.abs(pctProt) > 25) veredicto = '🔴 déficit prot severo'
      else if (entries > 100) veredicto = '🟡 posible duplicado'
      else if (pctCal !== null && Math.abs(pctCal) > 10) veredicto = '🟡 déficit cal'
      else if (pctProt !== null && Math.abs(pctProt) > 15) veredicto = '🟡 déficit prot'
      else if (subMins >= 1) veredicto = '🟡 sub-mins leve'
      else if (pool.size < 18) veredicto = '🟡 pool bajo'
      else if (!u.re_onboarding_completado) veredicto = '🟡 meta vieja'
      else veredicto = '✅'

      return {
        id: u.id,
        email: u.email,
        nombre: u.nombre,
        isInternal,
        createdAt: u.created_at,
        onboardingCompleto: !!u.onboarding_completado,
        tieneCalendario: entries > 0,
        ultimaInteraccion,
        totalMensajes: userMsgs.length,
        diasActivos7d: activeDays(7),
        diasActivos14d: activeDays(14),
        diasActivos30d: activeDays(30),
        modificacionesCalendario: histByUser[u.id] || 0,
        // New fields
        meta: u.re_onboarding_completado ? 'nueva' : 'vieja',
        pctCal,
        pctProt,
        comPrinc,
        subMins,
        pool: pool.size,
        entries,
        veredicto,
      }
    })

    // Sort: non-internal first (by ultima interaccion desc), then internal
    userMetrics.sort((a, b) => {
      if (a.isInternal !== b.isInternal) return a.isInternal ? 1 : -1
      const aDate = a.ultimaInteraccion || '0'
      const bDate = b.ultimaInteraccion || '0'
      return bDate.localeCompare(aDate)
    })

    // Summary (only real — using es_interno flag)
    const reales = userMetrics.filter(u => !u.isInternal)
    const totalBeta = reales.length
    const completaronOnboarding = reales.filter(u => u.onboardingCompleto).length
    const generaronCalendario = reales.filter(u => u.tieneCalendario).length

    const h24 = new Date(now.getTime() - 86400000).toISOString()
    const h7d = new Date(now.getTime() - 7 * 86400000).toISOString()

    const dau = reales.filter(u => u.ultimaInteraccion && u.ultimaInteraccion >= h24).length
    const wau = reales.filter(u => u.ultimaInteraccion && u.ultimaInteraccion >= h7d).length

    const signedUp7dAgo = reales.filter(u => u.createdAt < h7d)
    const retencion7d = signedUp7dAgo.length > 0
      ? Math.round((signedUp7dAgo.filter(u => u.diasActivos7d > 0).length / signedUp7dAgo.length) * 100)
      : 0

    const h14d = new Date(now.getTime() - 14 * 86400000).toISOString()
    const signedUp14dAgo = reales.filter(u => u.createdAt < h14d)
    const retencion14d = signedUp14dAgo.length > 0
      ? Math.round((signedUp14dAgo.filter(u => u.diasActivos14d > 0).length / signedUp14dAgo.length) * 100)
      : 0

    const sinCalendario = reales
      .filter(u => !u.tieneCalendario)
      .map(u => ({
        email: u.email,
        nombre: u.nombre,
        diasDesdeSingup: Math.floor((now.getTime() - new Date(u.createdAt).getTime()) / 86400000),
        ultimaInteraccion: u.ultimaInteraccion,
      }))
      .sort((a, b) => b.diasDesdeSingup - a.diasDesdeSingup)

    // Requieren atención
    const requierenAtencion = reales
      .filter(u => u.veredicto.startsWith('🔴'))
      .map(u => ({ nombre: u.nombre, email: u.email, veredicto: u.veredicto }))

    // Salud counts for resumen
    const saludOk = reales.filter(u => u.veredicto === '✅').length
    const saludWarning = reales.filter(u => u.veredicto.startsWith('🟡')).length
    const saludCritical = reales.filter(u => u.veredicto.startsWith('🔴')).length

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
        saludOk,
        saludWarning,
        saludCritical,
      },
      usuarios: userMetrics,
      sinCalendario,
      requierenAtencion,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
