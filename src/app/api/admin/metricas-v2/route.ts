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

    const url = new URL(req.url)
    const range = url.searchParams.get('range') || '7d'
    const incluirInternos = url.searchParams.get('incluir_internos') === 'true'

    const days = range === '90d' ? 90 : range === '30d' ? 30 : 7
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // === ADQUISICIÓN ===
    // Signups por dia — fetch raw, aggregate in JS
    let signupsQuery = sb.from('usuarios')
      .select('id, created_at, es_interno')
      .gte('created_at', since)
    if (!incluirInternos) {
      signupsQuery = signupsQuery.or('es_interno.is.null,es_interno.eq.false')
    }
    const { data: signupsRaw } = await signupsQuery

    const signupsByDay: Record<string, number> = {}
    for (const u of signupsRaw || []) {
      const day = u.created_at.slice(0, 10)
      signupsByDay[day] = (signupsByDay[day] || 0) + 1
    }
    const signupsPorDia = Object.entries(signupsByDay)
      .map(([dia, cnt]) => ({ dia, cnt }))
      .sort((a, b) => a.dia.localeCompare(b.dia))

    // Funnel
    const { data: funnelRaw } = await sb.from('usuarios')
      .select('id, onboarding_completado, es_interno')

    const extUsers = (funnelRaw || []).filter(u => incluirInternos || !u.es_interno)
    const totalUsers = extUsers.length
    const onboarded = extUsers.filter(u => u.onboarding_completado).length
    const onboardedIds = new Set(extUsers.filter(u => u.onboarding_completado).map(u => u.id))

    const { data: chatUsers } = await sb.from('conversaciones')
      .select('user_id')
      .in('user_id', Array.from(onboardedIds))
    const chattedIds = new Set((chatUsers || []).map(c => c.user_id))
    const chatted = chattedIds.size

    // === ENGAGEMENT ===
    const { data: dauRaw } = await sb.from('eventos_usuario')
      .select('user_id, created_at')
      .gte('created_at', since)

    const dauByDay: Record<string, Set<string>> = {}
    for (const e of dauRaw || []) {
      const day = e.created_at.slice(0, 10)
      if (!dauByDay[day]) dauByDay[day] = new Set()
      dauByDay[day].add(e.user_id)
    }
    const dauSeries = Object.entries(dauByDay)
      .map(([dia, users]) => ({ dia, count: users.size }))
      .sort((a, b) => a.dia.localeCompare(b.dia))

    // WAU/MAU
    const now = new Date()
    const wauSince = new Date(now.getTime() - 7 * 86400000).toISOString()
    const mauSince = new Date(now.getTime() - 30 * 86400000).toISOString()
    const wauUsers = new Set((dauRaw || []).filter(e => e.created_at >= wauSince).map(e => e.user_id))
    const mauUsers = new Set((dauRaw || []).filter(e => e.created_at >= mauSince).map(e => e.user_id))

    // Top actions (last 7d)
    const { data: topActions } = await sb.from('eventos_usuario')
      .select('tipo_evento')
      .gte('created_at', new Date(now.getTime() - 7 * 86400000).toISOString())

    const actionBreakdown: Record<string, number> = {}
    for (const e of topActions || []) {
      actionBreakdown[e.tipo_evento] = (actionBreakdown[e.tipo_evento] || 0) + 1
    }
    const topActionsSorted = Object.entries(actionBreakdown)
      .map(([tipo, count]) => ({ tipo, count }))
      .sort((a, b) => b.count - a.count)

    // Top chat users (within range)
    const chatCountQuery = sb.from('conversaciones')
      .select('user_id, created_at')
      .eq('role', 'user')
      .gte('created_at', since)
    const { data: chatCountRaw } = await chatCountQuery

    // Aggregate per user
    const chatCountByUser: Record<string, { count: number; last: string }> = {}
    for (const c of chatCountRaw || []) {
      if (!chatCountByUser[c.user_id]) chatCountByUser[c.user_id] = { count: 0, last: c.created_at }
      chatCountByUser[c.user_id].count++
      if (c.created_at > chatCountByUser[c.user_id].last) chatCountByUser[c.user_id].last = c.created_at
    }

    // Get user names for top chatters
    const chatUserIds = Object.keys(chatCountByUser)
    const chatUserNames: Record<string, { nombre: string; email: string; es_interno: boolean }> = {}
    if (chatUserIds.length > 0) {
      const { data: chatUserRows } = await sb.from('usuarios')
        .select('id, nombre, email, es_interno')
        .in('id', chatUserIds)
      for (const u of chatUserRows || []) {
        chatUserNames[u.id] = { nombre: u.nombre, email: u.email, es_interno: u.es_interno }
      }
    }

    const topChatUsers = Object.entries(chatCountByUser)
      .map(([uid, { count, last }]) => ({
        user_id: uid,
        nombre: chatUserNames[uid]?.nombre || uid.slice(0, 8),
        email: chatUserNames[uid]?.email || '',
        es_interno: chatUserNames[uid]?.es_interno || false,
        mensajes: count,
        ultimo_mensaje: last,
      }))
      .filter(u => incluirInternos || !u.es_interno)
      .sort((a, b) => b.mensajes - a.mensajes)
      .slice(0, 10)

    // === SALUD CALENDARIO ===
    // Fetch calendario + alimentos + usuarios separately, compute bilateral tolerance in JS
    let usersQuery = sb.from('usuarios')
      .select('id, nombre, calorias_objetivo, proteina_objetivo, es_interno, onboarding_completado')
      .eq('onboarding_completado', true)
    if (!incluirInternos) {
      usersQuery = usersQuery.or('es_interno.is.null,es_interno.eq.false')
    }
    const { data: healthUsers } = await usersQuery

    const healthUserIds = (healthUsers || []).map(u => u.id)

    // Fetch calendario entries for these users (paginated — default limit is 1000)
    let calEntries: { user_id: string; dia: number; alimento_id: string; cantidad: number }[] = []
    if (healthUserIds.length > 0) {
      const PAGE_SIZE = 1000
      let from = 0
      let hasMore = true
      while (hasMore) {
        const { data: page } = await sb.from('calendario')
          .select('user_id, dia, alimento_id, cantidad')
          .in('user_id', healthUserIds)
          .range(from, from + PAGE_SIZE - 1)
        const rows = page || []
        calEntries = calEntries.concat(rows)
        hasMore = rows.length === PAGE_SIZE
        from += PAGE_SIZE
      }
    }

    // Get unique alimento_ids
    const alimentoIds = Array.from(new Set(calEntries.map(c => c.alimento_id)))
    const { data: alimentos } = alimentoIds.length > 0
      ? await sb.from('alimentos')
          .select('id, unidad_medida, porcion_base, calorias_por_unidad, proteina_por_unidad')
          .in('id', alimentoIds)
      : { data: [] }

    const alimentoMap = new Map((alimentos || []).map(a => [a.id, a]))

    // Compute per-user per-day macros
    type DayData = { kcal: number; prot: number }
    const userDayMacros: Record<string, Record<number, DayData>> = {}

    for (const entry of calEntries) {
      const food = alimentoMap.get(entry.alimento_id)
      if (!food) continue
      const kcal = food.unidad_medida === 'unidad'
        ? entry.cantidad * food.calorias_por_unidad
        : (entry.cantidad / food.porcion_base) * food.calorias_por_unidad
      const prot = food.unidad_medida === 'unidad'
        ? entry.cantidad * food.proteina_por_unidad
        : (entry.cantidad / food.porcion_base) * food.proteina_por_unidad

      if (!userDayMacros[entry.user_id]) userDayMacros[entry.user_id] = {}
      if (!userDayMacros[entry.user_id][entry.dia]) userDayMacros[entry.user_id][entry.dia] = { kcal: 0, prot: 0 }
      userDayMacros[entry.user_id][entry.dia].kcal += kcal
      userDayMacros[entry.user_id][entry.dia].prot += prot
    }

    // Build health summary per user
    const calHealth = (healthUsers || []).map(u => {
      const days = userDayMacros[u.id] || {}
      const dayEntries = Object.values(days)
      const totalDays = dayEntries.length
      const daysOk = dayEntries.filter(d =>
        Math.abs(d.kcal - u.calorias_objetivo) <= u.calorias_objetivo * 0.10 &&
        Math.abs(d.prot - u.proteina_objetivo) <= 10
      ).length
      return {
        user_id: u.id,
        nombre: u.nombre,
        meta_cal: u.calorias_objetivo,
        meta_prot: u.proteina_objetivo,
        dias: totalDays,
        dias_ok: daysOk,
      }
    }).sort((a, b) => a.dias_ok - b.dias_ok)

    // === RE-ENGAGEMENT ===
    // Fetch last activity from 4 sources: eventos_usuario, conversaciones (user msgs), calendario (chat edits), auth last_sign_in
    const [
      { data: eventsForReeng },
      { data: chatMsgsForReeng },
      { data: calChatForReeng },
    ] = await Promise.all([
      sb.from('eventos_usuario').select('user_id, created_at'),
      sb.from('conversaciones').select('user_id, created_at').eq('role', 'user'),
      sb.from('calendario').select('user_id, created_at').eq('origen', 'chat'),
    ])

    // Fetch last_sign_in_at from auth.users (paginated)
    const lastSignInByUser: Record<string, string> = {}
    let authPage = 1
    let authHasMore = true
    while (authHasMore) {
      const { data: { users: authUsers } } = await sb.auth.admin.listUsers({ page: authPage, perPage: 1000 })
      for (const au of authUsers) {
        if (au.last_sign_in_at) lastSignInByUser[au.id] = au.last_sign_in_at
      }
      authHasMore = authUsers.length === 1000
      authPage++
    }

    // Build max timestamp per user across all 4 sources
    const lastActivityByUser: Record<string, string> = {}
    const updateMax = (userId: string, ts: string) => {
      if (!lastActivityByUser[userId] || ts > lastActivityByUser[userId]) {
        lastActivityByUser[userId] = ts
      }
    }
    for (const e of eventsForReeng || []) updateMax(e.user_id, e.created_at)
    for (const c of chatMsgsForReeng || []) updateMax(c.user_id, c.created_at)
    for (const c of calChatForReeng || []) updateMax(c.user_id, c.created_at)
    for (const [uid, ts] of Object.entries(lastSignInByUser)) updateMax(uid, ts)

    // Get onboarded users with their info
    let reengUsersQuery = sb.from('usuarios')
      .select('id, nombre, email, created_at, es_interno, onboarding_completado')
      .eq('onboarding_completado', true)
    if (!incluirInternos) {
      reengUsersQuery = reengUsersQuery.or('es_interno.is.null,es_interno.eq.false')
    }
    const { data: reengUsers } = await reengUsersQuery

    const nowMs = Date.now()
    type UserActivity = { id: string; nombre: string; email: string; last_activity: string; days_since: number; status: string }
    const reEngagement: UserActivity[] = (reengUsers || []).map(u => {
      const lastAct = lastActivityByUser[u.id] || null
      const refDate = lastAct || u.created_at
      const daysSince = Math.floor((nowMs - new Date(refDate).getTime()) / 86400000)
      return {
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        last_activity: refDate,
        days_since: daysSince,
        status: !lastAct ? 'sin_actividad' : daysSince <= 7 ? 'activa' : daysSince <= 13 ? 'lurker' : 'churned',
      }
    }).sort((a, b) => b.days_since - a.days_since)

    return NextResponse.json({
      range,
      adquisicion: {
        signupsPorDia,
        funnel: { total: totalUsers, onboarded, chatted },
      },
      engagement: {
        dauSeries,
        wau: wauUsers.size,
        mau: mauUsers.size,
        topActions: topActionsSorted,
        topChatUsers,
      },
      saludCalendario: calHealth,
      reEngagement,
    })
  } catch (err) {
    console.error('[metricas-v2] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
