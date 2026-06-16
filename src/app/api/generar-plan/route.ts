import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { analizarCalendario, type AlimentoCalendario } from '@/lib/analisis-calorico'
import { validarPoolMinimos } from '@/lib/validacion-pool'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

function createAuthenticatedClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface AlimentoData {
  id: string
  nombre: string
  categoria_comida: string
  calorias_por_unidad: number
  proteina_por_unidad: number
  carbs_por_unidad: number
  grasas_por_unidad: number
  unidad_medida: string
  porcion_base: number
  porcion_min: number
  porcion_max: number
  rol_permitido: string[]
}

interface PlanAlimento {
  alimento: string
  cantidad: number
  unidad: string
}

interface PlanDia {
  dia: number
  desayuno: PlanAlimento[]
  almuerzo: PlanAlimento[]
  cena: PlanAlimento[]
}

// Calculate real cal/prot per unit quantity
function calPerUnit(a: AlimentoData): number {
  return a.unidad_medida === 'unidad' ? a.calorias_por_unidad : a.calorias_por_unidad / (a.porcion_base || 100)
}
function protPerUnit(a: AlimentoData): number {
  return a.unidad_medida === 'unidad' ? a.proteina_por_unidad : a.proteina_por_unidad / (a.porcion_base || 100)
}

// Portion limits — use food's declared min/max, with sensible fallbacks
function getMin(a: AlimentoData): number {
  if (a.porcion_min && a.porcion_min > 0) return a.porcion_min
  return a.unidad_medida === 'unidad' ? 1 : 10
}
function getMax(a: AlimentoData): number {
  if (a.porcion_max && a.porcion_max > 0) return a.porcion_max
  return a.unidad_medida === 'unidad' ? 10 : 500
}

// Meal distribution constants
const MEAL_CAL_PCT: Record<string, number> = { desayuno: 0.30, almuerzo: 0.40, cena: 0.30 }

export async function POST(req: NextRequest) {
  let lockUserId: string | null = null
  try {
    const url = new URL(req.url)
    const { userId, accessToken, serviceRoleKey, forceRegenerate } = await req.json()
    lockUserId = userId
    if (!userId || (!accessToken && !serviceRoleKey)) {
      return NextResponse.json({ error: 'userId and accessToken (or serviceRoleKey) required' }, { status: 400 })
    }

    const supabase = serviceRoleKey === process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      : createAuthenticatedClient(accessToken)

    // ═══ 1. Fetch user profile ═══
    const { data: usuario, error: userErr } = await supabase
      .from('usuarios')
      .select('nombre, calorias_objetivo, proteina_objetivo, carbs_objetivo, grasas_objetivo, meta, peso_kg, altura_cm, edad, nivel_actividad, genero, generando_plan_at')
      .eq('id', userId)
      .single()

    if (userErr || !usuario) {
      return NextResponse.json(
        { error: 'Hubo un problema cargando tu perfil. Por favor regresa y completa tu información.' },
        { status: 404 }
      )
    }

    // ═══ Concurrency lock: prevent parallel plan generation for same user ═══
    const LOCK_TTL_MS = 5 * 60 * 1000 // 5 minutes
    if (usuario.generando_plan_at) {
      const lockAge = Date.now() - new Date(usuario.generando_plan_at).getTime()
      if (lockAge < LOCK_TTL_MS) {
        console.log('[plan] LOCKED — another generation in progress for', userId, 'age:', Math.round(lockAge / 1000), 's')
        return NextResponse.json(
          { error: 'Ya estamos generando tu plan. Espera unos segundos y recarga la página.', locked: true },
          { status: 409 }
        )
      }
    }

    // Acquire lock
    await supabase.from('usuarios').update({ generando_plan_at: new Date().toISOString() }).eq('id', userId)

    // ═══ Target macros ═══
    const testCal = process.env.NODE_ENV === 'development' ? url.searchParams.get('test_calorias') : null
    const testProt = process.env.NODE_ENV === 'development' ? url.searchParams.get('test_proteina') : null
    const calTarget = testCal ? parseInt(testCal) : (usuario.calorias_objetivo || 1800)
    const protTarget = testProt ? parseInt(testProt) : (usuario.proteina_objetivo || 100)
    console.log('[objetivo]', testCal ? '⚠️ TEST OVERRIDE' : 'leído desde DB:', 'calorias:', calTarget, 'proteina:', protTarget, 'nombre:', usuario.nombre)

    // ═══ Detect flow mode ═══
    const { count: calendarioCount } = await supabase
      .from('calendario')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    const { count: convosCount } = await supabase
      .from('conversaciones')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    // Flow signal: calendario=0 OR forceRegenerate → generate from preferences (Claude + INSERT)
    //              calendario>0 (no force) → recalculate quantities only (UPDATE)
    const necesitaGenerarDesdeCero = (calendarioCount ?? 0) === 0 || forceRegenerate === true
    // Message signal: first time ever → welcome messages; otherwise → regen messages
    const esPrimeraVez = (calendarioCount ?? 0) === 0 && (convosCount ?? 0) === 0
    console.log('[plan] necesitaGenerarDesdeCero:', necesitaGenerarDesdeCero, 'esPrimeraVez:', esPrimeraVez, 'forceRegenerate:', !!forceRegenerate, '(calendario:', calendarioCount, 'convos:', convosCount, ')')

    // ═══ Kill switch: block regeneration while Bug #18 is being fixed ═══
    if (!necesitaGenerarDesdeCero && (process.env.LUCY_REGEN_PAUSED === 'true' || process.env.NEXT_PUBLIC_LUCY_REGEN_PAUSED === 'true')) {
      console.log('[plan] BLOCKED by kill switch (regen paused). userId:', userId)
      // Bug #76: clear lock before early return
      await supabase.from('usuarios').update({ generando_plan_at: null }).eq('id', userId)
      return NextResponse.json(
        { error: 'Lucy está en mantenimiento. Tu plan actual sigue activo. Vuelve más tarde.', maintenance: true },
        { status: 503 }
      )
    }

    // ═══ REGENERATION MODE: Recalculate quantities only (no Claude, no DELETE/INSERT) ═══
    if (!necesitaGenerarDesdeCero) {
      console.log('[regen] Modo recálculo — sin Claude, sin DELETE/INSERT. userId:', userId)

      // 1. Read ALL calendar rows with food info
      const { data: calRows, error: calErr } = await supabase
        .from('calendario')
        .select(`
          id, dia, comida, cantidad, unidad, origen, alimento_id,
          alimento:alimentos(
            id, nombre, categoria_comida,
            calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad,
            unidad_medida, porcion_base, porcion_min, porcion_max, rol_permitido
          )
        `)
        .eq('user_id', userId)
        .order('dia')
        .order('comida')

      if (calErr || !calRows || calRows.length === 0) {
        return NextResponse.json({ error: 'Error leyendo calendario: ' + (calErr?.message || 'calendario vacío') }, { status: 500 })
      }

      console.log('[regen] Calendar rows:', calRows.length)

      // 2. Parse and group by (dia, comida)
      type RegenRow = {
        id: string
        dia: number
        comida: string
        cantidad: number
        cantidadOriginal: number
        unidad: string
        origen: string
        alimento_id: string
        alimentoData: AlimentoData
      }

      const slots: Record<string, RegenRow[]> = {}

      for (const row of calRows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a = (Array.isArray(row.alimento) ? (row.alimento as any)[0] : row.alimento) as AlimentoData | null
        if (!a) {
          console.warn('[regen] Row sin alimento, skip:', row.id)
          continue
        }

        const key = `${row.dia}|${row.comida}`
        if (!slots[key]) slots[key] = []
        slots[key].push({
          id: row.id,
          dia: row.dia,
          comida: row.comida,
          cantidad: row.cantidad,
          cantidadOriginal: row.cantidad,
          unidad: row.unidad,
          origen: row.origen,
          alimento_id: row.alimento_id,
          alimentoData: a,
        })
      }

      // 3. Budgets per meal type
      const REGEN_CAL: Record<string, number> = {
        desayuno: calTarget * 0.30,
        almuerzo: calTarget * 0.40,
        cena: calTarget * 0.30,
      }
      const REGEN_PROT: Record<string, number> = {
        desayuno: protTarget * 0.30,
        almuerzo: protTarget * 0.35,
        cena: protTarget * 0.35,
      }

      const DIA_NOMBRES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
      const emptySlots: string[] = []
      const impossibleSlots: string[] = []

      // Pre-calculate current daily totals for snack budget scaling
      const currentDayCal: Record<number, number> = {}
      for (const rows of Object.values(slots)) {
        for (const r of rows) {
          if (!currentDayCal[r.dia]) currentDayCal[r.dia] = 0
          currentDayCal[r.dia] += calPerUnit(r.alimentoData) * r.cantidad
        }
      }

      // 4. Recalculate per slot
      for (const [key, rows] of Object.entries(slots)) {
        const [diaStr, comida] = key.split('|')
        const dia = parseInt(diaStr)
        const label = `${DIA_NOMBRES[dia - 1] || `día ${dia}`} ${comida}`

        // For snacks: budget = current snack kcal × (calTarget / current day total)
        let budget: number
        if (comida === 'snack') {
          const dayTotal = currentDayCal[dia] || calTarget
          const snackCal = rows.reduce((s: number, r: RegenRow) => s + calPerUnit(r.alimentoData) * r.cantidad, 0)
          budget = dayTotal > 0 ? snackCal * (calTarget / dayTotal) : snackCal
        } else {
          budget = REGEN_CAL[comida]
        }
        if (!budget) continue

        if (rows.length === 0) {
          emptySlots.push(label)
          continue
        }

        // Current total calories in this slot
        const currentCal = rows.reduce((s: number, r: RegenRow) => s + calPerUnit(r.alimentoData) * r.cantidad, 0)
        if (currentCal <= 0) continue

        // ── Step 1: Proportional scale to hit budget ──
        const factor = budget / currentCal
        for (const r of rows) {
          const a = r.alimentoData
          const cpu = calPerUnit(a)
          if (cpu <= 0) continue
          const min = getMin(a)
          const max = getMax(a)
          r.cantidad = Math.max(min, Math.min(max, Math.round(r.cantidad * factor)))
        }

        const totalSlotCal = () => rows.reduce((s: number, r: RegenRow) => s + calPerUnit(r.alimentoData) * r.cantidad, 0)
        let total = totalSlotCal()
        console.log(`[regen] ${label}: scale(${factor.toFixed(2)})=${Math.round(total)} budget=${Math.round(budget)}`)

        // ── Step 2: Bidirectional fine-tuning if >10% off ──
        if (Math.abs(total - budget) > budget * 0.10) {
          if (total > budget) {
            // Reduce highest-density food toward porcion_min
            const sorted = [...rows].sort((a, b) => calPerUnit(b.alimentoData) - calPerUnit(a.alimentoData))
            for (const r of sorted) {
              const a = r.alimentoData
              const min = getMin(a)
              if (r.cantidad > min) {
                r.cantidad = min
                total = totalSlotCal()
                if (total <= budget * 1.05) break
              }
            }
          } else {
            // Increase lowest-density food toward porcion_max
            const sorted = [...rows].sort((a, b) => calPerUnit(a.alimentoData) - calPerUnit(b.alimentoData))
            for (const r of sorted) {
              const a = r.alimentoData
              const max = getMax(a)
              if (r.cantidad < max) {
                const deficit = budget - total
                const extra = calPerUnit(a) > 0 ? deficit / calPerUnit(a) : 0
                r.cantidad = Math.min(max, Math.round(r.cantidad + extra))
                total = totalSlotCal()
                if (total >= budget * 0.95) break
              }
            }
          }
        }

        if (Math.abs(totalSlotCal() - budget) > budget * 0.10) {
          impossibleSlots.push(label)
        }

        // ── Step 3: Protein enforcement ──
        const protBudget = REGEN_PROT[comida] || protTarget * 0.30
        const currentProt = rows.reduce((s: number, r: RegenRow) => s + protPerUnit(r.alimentoData) * r.cantidad, 0)

        if (currentProt < protBudget * 0.85) {
          const protRows = rows
            .filter((r: RegenRow) => (r.alimentoData.rol_permitido || []).includes('Proteina'))
            .sort((a: RegenRow, b: RegenRow) => protPerUnit(b.alimentoData) - protPerUnit(a.alimentoData))

          let remaining = protBudget - currentProt
          for (const r of protRows) {
            if (remaining <= 0) break
            const a = r.alimentoData
            const max = getMax(a)
            if (r.cantidad >= max) continue
            const ppu = protPerUnit(a)
            if (ppu <= 0) continue
            const extraQty = remaining / ppu
            const newQty = Math.min(max, Math.round(r.cantidad + extraQty))
            const actual = newQty - r.cantidad
            if (actual <= 0) continue

            // If pushing calories over budget, compensate by reducing non-protein foods
            const extraCals = calPerUnit(a) * actual
            if (totalSlotCal() + extraCals > budget * 1.10) {
              const nonProt = rows
                .filter((nr: RegenRow) => !(nr.alimentoData.rol_permitido || []).includes('Proteina'))
                .sort((x: RegenRow, y: RegenRow) => calPerUnit(y.alimentoData) - calPerUnit(x.alimentoData))
              let calReduce = totalSlotCal() + extraCals - budget
              for (const np of nonProt) {
                if (calReduce <= 0) break
                const npa = np.alimentoData
                const npMin = getMin(npa)
                if (np.cantidad <= npMin) continue
                const maxR = np.cantidad - npMin
                const rForCal = calPerUnit(npa) > 0 ? calReduce / calPerUnit(npa) : 0
                const rQty = Math.min(maxR, rForCal)
                np.cantidad = Math.max(npMin, Math.round(np.cantidad - rQty))
                calReduce -= calPerUnit(npa) * rQty
              }
            }

            r.cantidad = newQty
            remaining -= ppu * actual
          }

          console.log(`[regen] ${label}: prot ${Math.round(currentProt)}g → ${Math.round(rows.reduce((s: number, r: RegenRow) => s + protPerUnit(r.alimentoData) * r.cantidad, 0))}g (target ${Math.round(protBudget)}g)`)
        }
      }

      // 5. Final safety: enforce porcion_min as absolute floor
      for (const rows of Object.values(slots)) {
        for (const r of rows) {
          const min = getMin(r.alimentoData)
          if (r.cantidad < min) {
            console.warn(`[regen] Clamping ${r.alimentoData.nombre} from ${r.cantidad} to min ${min}`)
            r.cantidad = min
          }
        }
      }

      // 6. Collect updates (only changed quantities)
      const updates: { id: string; cantidad: number }[] = []
      for (const rows of Object.values(slots)) {
        for (const r of rows) {
          if (r.cantidad !== r.cantidadOriginal) {
            updates.push({ id: r.id, cantidad: r.cantidad })
          }
        }
      }

      console.log('[regen] Rows to update:', updates.length, 'of', calRows.length)

      // 6. Apply updates (parallel batches of 10)
      for (let i = 0; i < updates.length; i += 10) {
        const batch = updates.slice(i, i + 10)
        const results = await Promise.all(
          batch.map(u => supabase.from('calendario').update({ cantidad: u.cantidad }).eq('id', u.id))
        )
        for (const { error: e } of results) {
          if (e) console.error('[regen] Update error:', e.message)
        }
      }

      // 6b. Reset coach-edited rows to 'generado' (their quantities were just recalculated)
      await supabase.from('calendario').update({ origen: 'generado' }).eq('user_id', userId).eq('origen', 'coach')

      // 7. Rebuild shopping list
      await supabase.from('lista_compras').delete().eq('user_id', userId)

      const comprasMap = new Map<string, { alimentoId: string; cantidad: number; unidad: string }>()
      for (const rows of Object.values(slots)) {
        for (const r of rows) {
          const existing = comprasMap.get(r.alimento_id)
          if (existing) {
            existing.cantidad += r.cantidad
          } else {
            comprasMap.set(r.alimento_id, { alimentoId: r.alimento_id, cantidad: r.cantidad, unidad: r.unidad })
          }
        }
      }

      const comprasRows = Array.from(comprasMap.values()).map(c => ({
        user_id: userId,
        alimento_id: c.alimentoId,
        cantidad_total: c.cantidad,
        unidad: c.unidad,
        comprado: false,
      }))

      if (comprasRows.length > 0) {
        const { error: shopErr } = await supabase.from('lista_compras').insert(comprasRows)
        if (shopErr) console.error('[regen] lista_compras error:', shopErr.message)
      }

      // 8. Post-analysis + logging
      const dailyTotals: Record<number, { cal: number; prot: number }> = {}
      for (const rows of Object.values(slots)) {
        for (const r of rows) {
          if (!dailyTotals[r.dia]) dailyTotals[r.dia] = { cal: 0, prot: 0 }
          dailyTotals[r.dia].cal += calPerUnit(r.alimentoData) * r.cantidad
          dailyTotals[r.dia].prot += protPerUnit(r.alimentoData) * r.cantidad
        }
      }

      for (let d = 1; d <= 7; d++) {
        const dt = dailyTotals[d]
        if (dt) console.log(`[regen] día ${d}: cal=${Math.round(dt.cal)} prot=${Math.round(dt.prot)} target=(${calTarget}/${protTarget})`)
      }

      const regenDays = Object.values(dailyTotals)
      const avgCal = regenDays.length > 0 ? regenDays.reduce((s, d) => s + d.cal, 0) / regenDays.length : 0
      const avgProt = regenDays.length > 0 ? regenDays.reduce((s, d) => s + d.prot, 0) / regenDays.length : 0
      const diasBajosProteina = regenDays.filter(d => d.prot < protTarget * 0.85).length

      console.log('[regen] Promedio: cal=', Math.round(avgCal), 'prot=', Math.round(avgProt), 'días bajos prot:', diasBajosProteina)

      // 9. Message to user
      let regenMsg = `Actualicé las cantidades de tu plan con tus nuevos macros (${calTarget} kcal, ${protTarget}g proteína). Todo lo demás sigue igual.`

      if (emptySlots.length > 0) {
        regenMsg += `\n\nTu plan tiene algunas comidas vacías (${emptySlots.join(', ')}). Para completarlas, usa "Cambiar alimentos" en tu perfil o pídeme cambios por aquí.`
      }

      // Bug #75: removed hardcoded contradictory message. Real warnings come from
      // analizarCalendario (Paso 5) on the final saved plan, same as Flujo 1/3 (Bug #64).
      if (impossibleSlots.length > 0) {
        console.log('[generar-plan] Flujo 2 recalc — impossibleSlots:', impossibleSlots, 'user_id:', userId)
      }

      if (diasBajosProteina >= 5) {
        regenMsg += `\n\nImportante: la mayoría de los días te va a faltar proteína con los alimentos actuales. ¿Quieres que te sugiera snacks proteicos para completar? 💜`
      } else if (diasBajosProteina >= 2) {
        regenMsg += `\n\nNoté que ${diasBajosProteina} días quedan un poco bajos en proteína. ¿Quieres que ajustemos con un snack proteico? 💜`
      } else {
        regenMsg += ' 💜'
      }

      await supabase.from('conversaciones').insert({
        user_id: userId, role: 'assistant', content: regenMsg, leido: false,
      })

      // Release lock
      await supabase.from('usuarios').update({ generando_plan_at: null }).eq('id', userId)

      return NextResponse.json({
        success: true,
        mode: 'recalculation',
        updates: updates.length,
        dias: Object.keys(dailyTotals).length,
        avgCal: Math.round(avgCal),
        avgProt: Math.round(avgProt),
      })
    }

    // ═══ FIRST GENERATION FLOW (existing code below) ═══

    // ═══ 2. Fetch user preferences with food details ═══
    const { data: preferencias, error: prefErr } = await supabase
      .from('preferencias_usuario')
      .select(`
        categoria_comida,
        alimento:alimentos (
          id, nombre, categoria_comida,
          calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad,
          unidad_medida, porcion_base, porcion_min, porcion_max, rol_permitido
        )
      `)
      .eq('user_id', userId)

    if (prefErr || !preferencias?.length) {
      // Bug #76: clear lock before early return (prevents zombie generando_plan_at)
      await supabase.from('usuarios').update({ generando_plan_at: null }).eq('id', userId)
      return NextResponse.json(
        { error: 'No encontramos tus alimentos seleccionados. Por favor regresa y escoge tus alimentos.' },
        { status: 404 }
      )
    }

    // ═══ Capa B: Server-side pool validation (mínimos/máximos por categoría) ═══
    const poolValidation = validarPoolMinimos(preferencias)
    if (!poolValidation.valid) {
      console.warn(`[plan] Pool validation failed for user ${userId}: ${poolValidation.errorMessage}`)
      await supabase.from('usuarios').update({ generando_plan_at: null }).eq('id', userId)
      return NextResponse.json(
        { error: poolValidation.errorMessage, errores: poolValidation.errores },
        { status: 400 }
      )
    }

    // Build structured food data
    const alimentosMap = new Map<string, { id: string; nombre: string }>()
    const alimentosPorCategoria: Record<string, AlimentoData[]> = {}

    for (const pref of preferencias) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = pref.alimento as any
      if (!a) continue
      alimentosMap.set(a.nombre.toLowerCase(), { id: a.id, nombre: a.nombre })

      const cat = pref.categoria_comida
      if (!alimentosPorCategoria[cat]) alimentosPorCategoria[cat] = []
      alimentosPorCategoria[cat].push(a as AlimentoData)
    }

    // ═══ PASO 1: Calculate optimal quantities (backend arithmetic) ═══
    console.log('[nueva-arquitectura] v2 iniciando...', 'userId:', userId)

    // Group foods by meal role
    const breakfastFoods = [
      ...(alimentosPorCategoria['desayuno_1'] || []),
      ...(alimentosPorCategoria['desayuno_2'] || []),
    ]
    const mainFoods = [
      ...(alimentosPorCategoria['proteina'] || []),
      ...(alimentosPorCategoria['carbohidrato'] || []),
      ...(alimentosPorCategoria['fibra'] || []),
      ...(alimentosPorCategoria['grasa'] || []),
    ]

    // Calculate quantity for each food to hit meal targets
    const cantidadMap = new Map<string, { cantidad: number; unidad: string }>()

    // Budget share per category within a meal
    // Main meals: each category gets its share independently (1 food per category per meal)
    // Breakfast: desayuno_1 and desayuno_2 each get 100% of breakfast budget (they alternate days)
    //   but foods WITHIN each group share that budget proportionally by caloric density
    const CAT_SHARE: Record<string, number> = {
      proteina: 0.40,
      carbohidrato: 0.35,
      fibra: 0.10,
      grasa: 0.15,
      desayuno_1: 1.0,
      desayuno_2: 1.0,
    }

    const calcCantidades = (foods: AlimentoData[], mealCalBudget: number, categoryKey: string) => {
      const share = CAT_SHARE[categoryKey] ?? 0.25
      const catBudget = mealCalBudget * share
      const isBreakfastGroup = categoryKey === 'desayuno_1' || categoryKey === 'desayuno_2'

      if (isBreakfastGroup && foods.length > 1) {
        // Breakfast groups: multiple foods appear TOGETHER in one meal
        // Distribute budget proportionally by caloric density
        const totalDensity = foods.reduce((s, f) => s + calPerUnit(f), 0)

        for (const f of foods) {
          const cpu = calPerUnit(f)
          if (cpu <= 0 || totalDensity <= 0) {
            cantidadMap.set(f.nombre.toLowerCase(), { cantidad: f.porcion_base, unidad: f.unidad_medida })
            continue
          }
          const foodBudget = catBudget * (cpu / totalDensity)
          let qty: number
          if (f.unidad_medida === 'unidad') {
            qty = Math.max(1, Math.round(foodBudget / cpu))
            qty = Math.max(getMin(f), Math.min(getMax(f), qty))
          } else {
            qty = Math.round(foodBudget / cpu)
            qty = Math.max(getMin(f), Math.min(getMax(f), qty))
          }
          cantidadMap.set(f.nombre.toLowerCase(), { cantidad: qty, unidad: f.unidad_medida })
        }
      } else {
        // Main meal categories: each food gets the FULL category budget
        // (only 1 food per category appears in each meal, Claude picks which)
        for (const f of foods) {
          const cpu = calPerUnit(f)
          if (cpu <= 0) {
            cantidadMap.set(f.nombre.toLowerCase(), { cantidad: f.porcion_base, unidad: f.unidad_medida })
            continue
          }
          let qty: number
          if (f.unidad_medida === 'unidad') {
            qty = Math.max(1, Math.round(catBudget / cpu))
            qty = Math.max(getMin(f), Math.min(getMax(f), qty))
          } else {
            qty = Math.round(catBudget / cpu)
            qty = Math.max(getMin(f), Math.min(getMax(f), qty))
          }
          cantidadMap.set(f.nombre.toLowerCase(), { cantidad: qty, unidad: f.unidad_medida })
        }
      }
    }

    const breakfastBudget = calTarget * MEAL_CAL_PCT['desayuno']
    // Main meals: average of almuerzo (40%) and cena (30%) = 35%
    const mainMealBudget = calTarget * 0.35

    // Calculate each category independently with its own budget share
    for (const [cat, foods] of Object.entries(alimentosPorCategoria)) {
      const isBreakfast = cat === 'desayuno_1' || cat === 'desayuno_2'
      const budget = isBreakfast ? breakfastBudget : mainMealBudget
      calcCantidades(foods, budget, cat)
    }

    console.log('[nueva-arquitectura] cantidades iniciales:', JSON.stringify(Object.fromEntries(cantidadMap)))

    // ═══ PASO 1b: Second-pass adjustment per meal type ═══
    // Simulate a typical meal and redistribute deficit from clamped foods
    const mealGroups: { name: string; budget: number; categories: string[] }[] = [
      { name: 'desayuno', budget: calTarget * MEAL_CAL_PCT['desayuno'], categories: ['desayuno_1', 'desayuno_2'] },
      { name: 'almuerzo', budget: calTarget * MEAL_CAL_PCT['almuerzo'], categories: ['proteina', 'carbohidrato', 'fibra', 'grasa'] },
      { name: 'cena', budget: calTarget * MEAL_CAL_PCT['cena'], categories: ['proteina', 'carbohidrato', 'fibra', 'grasa'] },
    ]

    for (const meal of mealGroups) {
      // Collect one representative food per category (use the first — average would be better but this is simpler)
      const mealFoods: { food: AlimentoData; key: string }[] = []
      for (const cat of meal.categories) {
        const foods = alimentosPorCategoria[cat]
        if (foods && foods.length > 0) {
          // Use the food with median calories as representative
          const sorted = [...foods].sort((a, b) => calPerUnit(a) - calPerUnit(b))
          const median = sorted[Math.floor(sorted.length / 2)]
          mealFoods.push({ food: median, key: median.nombre.toLowerCase() })
        }
      }

      for (let iter = 0; iter < 3; iter++) {
        // Calculate current meal calories
        let calReales = 0
        for (const { food, key } of mealFoods) {
          const entry = cantidadMap.get(key)
          if (!entry) continue
          calReales += calPerUnit(food) * entry.cantidad
        }

        const deficit = meal.budget - calReales
        console.log('[ajuste]', meal.name, 'iter:', iter, 'cal:', Math.round(calReales), 'budget:', Math.round(meal.budget), 'deficit:', Math.round(deficit))

        if (Math.abs(deficit) <= meal.budget * 0.05) break // within 5%

        if (deficit <= 0) break // over budget, don't reduce

        // Find foods not at porcion_max
        const adjustable = mealFoods.filter(({ food, key }) => {
          const entry = cantidadMap.get(key)
          if (!entry) return false
          const max = getMax(food)
          return entry.cantidad < max
        })

        if (adjustable.length === 0) break // all maxed out

        // Distribute deficit proportionally by caloric density
        const totalDensity = adjustable.reduce((s, { food }) => s + calPerUnit(food), 0)

        for (const { food, key } of adjustable) {
          const entry = cantidadMap.get(key)
          if (!entry || totalDensity <= 0) continue

          const share = calPerUnit(food) / totalDensity
          const extraCal = deficit * share
          const extraQty = calPerUnit(food) > 0 ? extraCal / calPerUnit(food) : 0

          let newQty = entry.cantidad + extraQty
          const max = getMax(food)
          const min = getMin(food)

          if (food.unidad_medida === 'unidad') {
            newQty = Math.max(min, Math.min(max, Math.round(newQty)))
          } else {
            newQty = Math.max(min, Math.min(max, Math.round(newQty)))
          }

          // Apply to ALL foods in the same category (not just the representative)
          const catForFood = Object.entries(alimentosPorCategoria).find(([, foods]) =>
            foods.some(f => f.nombre.toLowerCase() === key)
          )
          if (catForFood) {
            for (const f of catForFood[1]) {
              const fKey = f.nombre.toLowerCase()
              const fEntry = cantidadMap.get(fKey)
              if (!fEntry) continue
              const fMax = getMax(f)
              const fMin = getMin(f)
              const fExtraQty = calPerUnit(f) > 0 ? extraCal / calPerUnit(f) : 0
              let fNewQty = fEntry.cantidad + fExtraQty
              if (f.unidad_medida === 'unidad') {
                fNewQty = Math.max(fMin, Math.min(fMax, Math.round(fNewQty)))
              } else {
                fNewQty = Math.max(fMin, Math.min(fMax, Math.round(fNewQty)))
              }
              cantidadMap.set(fKey, { cantidad: fNewQty, unidad: fEntry.unidad })
            }
          }
        }
      }
    }

    console.log('[nueva-arquitectura] cantidades ajustadas:', JSON.stringify(Object.fromEntries(cantidadMap)))

    // ═══ PASO 1c: Bidirectional meal budget scaling ═══
    // Scale each meal's foods UP or DOWN to hit its calorie budget within ±5%
    const MEAL_BUDGET: Record<string, number> = {
      desayuno: calTarget * 0.30,
      almuerzo: calTarget * 0.40,
      cena: calTarget * 0.30,
    }

    const totalCalsOfFoods = (foods: AlimentoData[]): number => {
      return foods.reduce((sum, f) => {
        const qty = cantidadMap.get(f.nombre.toLowerCase())?.cantidad ?? 0
        return sum + calPerUnit(f) * qty
      }, 0)
    }

    const warnings: string[] = []

    // Bidirectional scale: adjusts foods up or down to match budget within ±5%
    const scaleMeal = (foods: AlimentoData[], budget: number, mealName: string): { impossible: boolean } => {
      if (foods.length === 0) return { impossible: false }

      let total = totalCalsOfFoods(foods)
      console.log(`[scale] ${mealName}: inicial=${Math.round(total)} kcal, budget=${Math.round(budget)} kcal`)

      // Already within ±5%? Done.
      if (Math.abs(total - budget) <= budget * 0.05) return { impossible: false }

      // Step 1: Proportional scale (respecting min/max)
      const factor = budget / total
      const scalingUp = factor > 1

      for (const f of foods) {
        const entry = cantidadMap.get(f.nombre.toLowerCase())
        if (!entry) continue
        const min = getMin(f)
        const max = getMax(f)
        let newQty: number
        if (scalingUp) {
          newQty = Math.min(max, Math.round(entry.cantidad * factor))
        } else {
          newQty = Math.max(min, Math.round(entry.cantidad * factor))
        }
        cantidadMap.set(f.nombre.toLowerCase(), { cantidad: newQty, unidad: entry.unidad })
      }

      total = totalCalsOfFoods(foods)
      console.log(`[scale] ${mealName}: post-factor(${factor.toFixed(2)})=${Math.round(total)} kcal`)

      // Step 2: If still off by >10%, fine-tune one food at a time
      if (Math.abs(total - budget) > budget * 0.10) {
        if (total > budget) {
          // Reduce highest-density food toward porcion_min
          const sorted = [...foods].sort((a, b) => calPerUnit(b) - calPerUnit(a))
          for (const f of sorted) {
            const entry = cantidadMap.get(f.nombre.toLowerCase())
            if (!entry) continue
            const min = getMin(f)
            if (entry.cantidad > min) {
              cantidadMap.set(f.nombre.toLowerCase(), { cantidad: min, unidad: entry.unidad })
              total = totalCalsOfFoods(foods)
              console.log(`[scale] ${mealName}: ↓ ${f.nombre} → min(${min}), total=${Math.round(total)} kcal`)
              if (total <= budget * 1.05) break
            }
          }
        } else {
          // Increase lowest-density food toward porcion_max (adds kcal cheaply in terms of food volume)
          const sorted = [...foods].sort((a, b) => calPerUnit(a) - calPerUnit(b))
          for (const f of sorted) {
            const entry = cantidadMap.get(f.nombre.toLowerCase())
            if (!entry) continue
            const max = getMax(f)
            if (entry.cantidad < max) {
              // Calculate how much we need
              const deficit = budget - total
              const extraQty = calPerUnit(f) > 0 ? deficit / calPerUnit(f) : 0
              const newQty = Math.min(max, Math.round(entry.cantidad + extraQty))
              cantidadMap.set(f.nombre.toLowerCase(), { cantidad: newQty, unidad: entry.unidad })
              total = totalCalsOfFoods(foods)
              console.log(`[scale] ${mealName}: ↑ ${f.nombre} → ${newQty}, total=${Math.round(total)} kcal`)
              if (total >= budget * 0.95) break
            }
          }
        }
      }

      return { impossible: Math.abs(total - budget) > budget * 0.10 }
    }

    // Apply bidirectional scaling to each breakfast group separately (they alternate days)
    for (const key of ['desayuno_1', 'desayuno_2']) {
      const foods = alimentosPorCategoria[key]
      if (!foods || foods.length === 0) continue
      const { impossible } = scaleMeal(foods, MEAL_BUDGET.desayuno, `desayuno (${key})`)
      if (impossible) warnings.push(`tu desayuno (${key.replace('desayuno_', 'opción ')})`)
    }

    // Apply bidirectional scaling to main meals as a SINGLE group
    // (almuerzo and cena share the same food pool — can't scale independently)
    // Target: average 35% per meal (matches initial calc). Scale only if off.
    {
      const categorias = ['proteina', 'carbohidrato', 'fibra', 'grasa']
      const avgMainBudget = calTarget * 0.35

      const repFoods: AlimentoData[] = []
      for (const cat of categorias) {
        const foods = alimentosPorCategoria[cat]
        if (foods && foods.length > 0) {
          const sorted = [...foods].sort((a, b) => calPerUnit(a) - calPerUnit(b))
          repFoods.push(sorted[Math.floor(sorted.length / 2)])
        }
      }

      const totalBefore = totalCalsOfFoods(repFoods)
      console.log(`[scale] main-meals: representativo=${Math.round(totalBefore)} kcal, budget-avg=${Math.round(avgMainBudget)} kcal`)

      if (Math.abs(totalBefore - avgMainBudget) > avgMainBudget * 0.05) {
        const factor = avgMainBudget / totalBefore
        const scalingUp = factor > 1

        for (const cat of categorias) {
          const foods = alimentosPorCategoria[cat] || []
          for (const f of foods) {
            const entry = cantidadMap.get(f.nombre.toLowerCase())
            if (!entry) continue
            const min = getMin(f)
            const max = getMax(f)
            const newQty = scalingUp
              ? Math.min(max, Math.round(entry.cantidad * factor))
              : Math.max(min, Math.round(entry.cantidad * factor))
            cantidadMap.set(f.nombre.toLowerCase(), { cantidad: newQty, unidad: entry.unidad })
          }
        }

        let newTotal = totalCalsOfFoods(repFoods)
        console.log(`[scale] main-meals: post-factor(${factor.toFixed(2)})=${Math.round(newTotal)} kcal`)

        // Fine-tune: if still off by >10%, adjust one category at a time
        if (Math.abs(newTotal - avgMainBudget) > avgMainBudget * 0.10) {
          if (newTotal > avgMainBudget) {
            const sorted = [...repFoods].sort((a, b) => calPerUnit(b) - calPerUnit(a))
            for (const f of sorted) {
              const catForFood = Object.entries(alimentosPorCategoria).find(([, foods]) =>
                foods.some(ff => ff.nombre.toLowerCase() === f.nombre.toLowerCase())
              )
              if (!catForFood) continue
              for (const ff of catForFood[1]) {
                const entry = cantidadMap.get(ff.nombre.toLowerCase())
                if (!entry) continue
                const min = getMin(ff)
                if (entry.cantidad > min) cantidadMap.set(ff.nombre.toLowerCase(), { cantidad: min, unidad: entry.unidad })
              }
              newTotal = totalCalsOfFoods(repFoods)
              if (newTotal <= avgMainBudget * 1.05) break
            }
          } else {
            const sorted = [...repFoods].sort((a, b) => calPerUnit(a) - calPerUnit(b))
            for (const f of sorted) {
              const deficit = avgMainBudget - newTotal
              const catForFood = Object.entries(alimentosPorCategoria).find(([, foods]) =>
                foods.some(ff => ff.nombre.toLowerCase() === f.nombre.toLowerCase())
              )
              if (!catForFood) continue
              for (const ff of catForFood[1]) {
                const entry = cantidadMap.get(ff.nombre.toLowerCase())
                if (!entry) continue
                const max = getMax(ff)
                if (entry.cantidad < max) {
                  const extraQty = calPerUnit(ff) > 0 ? deficit / calPerUnit(ff) : 0
                  cantidadMap.set(ff.nombre.toLowerCase(), { cantidad: Math.min(max, Math.round(entry.cantidad + extraQty)), unidad: entry.unidad })
                }
              }
              newTotal = totalCalsOfFoods(repFoods)
              if (newTotal >= avgMainBudget * 0.95) break
            }
          }
        }

        if (Math.abs(newTotal - avgMainBudget) > avgMainBudget * 0.10) warnings.push('tus comidas principales')
      }
    }

    console.log('[nueva-arquitectura] cantidades post-scale:', JSON.stringify(Object.fromEntries(cantidadMap)))

    // ═══ PASO 1d: Protein budget enforcement per meal ═══
    const MEAL_PROT_BUDGET: Record<string, number> = {
      desayuno: protTarget * 0.30,
      almuerzo: protTarget * 0.35,
      cena: protTarget * 0.35,
    }

    const totalProtOfFoods = (foods: AlimentoData[]): number => {
      return foods.reduce((sum, f) => {
        const qty = cantidadMap.get(f.nombre.toLowerCase())?.cantidad ?? 0
        return sum + protPerUnit(f) * qty
      }, 0)
    }

    // Define which foods belong to each meal type
    const mealFoodGroups: { name: string; calBudget: number; protBudget: number; foods: AlimentoData[] }[] = [
      {
        name: 'desayuno_1',
        calBudget: MEAL_BUDGET.desayuno,
        protBudget: MEAL_PROT_BUDGET.desayuno,
        foods: alimentosPorCategoria['desayuno_1'] || [],
      },
      {
        name: 'desayuno_2',
        calBudget: MEAL_BUDGET.desayuno,
        protBudget: MEAL_PROT_BUDGET.desayuno,
        foods: alimentosPorCategoria['desayuno_2'] || [],
      },
    ]

    // For main meals, build a representative set (same as used in scaling)
    const mainCats = ['proteina', 'carbohidrato', 'fibra', 'grasa']
    const mainRepFoods: AlimentoData[] = []
    for (const cat of mainCats) {
      const foods = alimentosPorCategoria[cat]
      if (foods && foods.length > 0) {
        const sorted = [...foods].sort((a, b) => calPerUnit(a) - calPerUnit(b))
        mainRepFoods.push(sorted[Math.floor(sorted.length / 2)])
      }
    }
    // Use average main budget for the representative check
    mealFoodGroups.push({
      name: 'main-meals',
      calBudget: calTarget * 0.35,
      protBudget: (MEAL_PROT_BUDGET.almuerzo + MEAL_PROT_BUDGET.cena) / 2,
      foods: mainRepFoods,
    })

    for (const group of mealFoodGroups) {
      if (group.foods.length === 0) continue

      const currentProt = totalProtOfFoods(group.foods)
      const threshold = group.protBudget * 0.85

      console.log(`[prot] ${group.name}: proteina=${Math.round(currentProt)}g, target=${Math.round(group.protBudget)}g, threshold=${Math.round(threshold)}g`)

      if (currentProt >= threshold) continue // protein is fine

      const deficitProt = group.protBudget - currentProt

      // Find protein-rich foods in this group (sorted by protein density desc)
      const proteinFoods = group.foods
        .filter(f => (f.rol_permitido || []).includes('Proteina'))
        .sort((a, b) => protPerUnit(b) - protPerUnit(a))

      if (proteinFoods.length === 0) {
        console.log(`[prot] ${group.name}: no protein foods available, skipping`)
        continue
      }

      let remainingDeficit = deficitProt

      for (const pf of proteinFoods) {
        if (remainingDeficit <= 0) break

        const entry = cantidadMap.get(pf.nombre.toLowerCase())
        if (!entry) continue

        const max = getMax(pf)
        if (entry.cantidad >= max) continue // already maxed

        // Calculate how much to increase for the deficit
        const ppu = protPerUnit(pf)
        if (ppu <= 0) continue
        const extraQty = remainingDeficit / ppu
        const newQty = Math.min(max, Math.round(entry.cantidad + extraQty))
        const actualExtra = newQty - entry.cantidad
        if (actualExtra <= 0) continue

        // Calculate calorie impact
        const extraCal = calPerUnit(pf) * actualExtra
        const currentMealCal = totalCalsOfFoods(group.foods)
        const newMealCal = currentMealCal + extraCal

        console.log(`[prot] ${group.name}: ↑ ${pf.nombre} ${entry.cantidad}→${newQty}, +${Math.round(protPerUnit(pf) * actualExtra)}g prot, +${Math.round(extraCal)} kcal`)

        // If this pushes calories over budget, compensate by reducing a non-protein food
        if (newMealCal > group.calBudget * 1.05) {
          const nonProtein = group.foods
            .filter(f => !(f.rol_permitido || []).includes('Proteina'))
            .sort((a, b) => calPerUnit(b) - calPerUnit(a)) // highest density first

          let calToReduce = newMealCal - group.calBudget
          for (const np of nonProtein) {
            if (calToReduce <= 0) break
            const npEntry = cantidadMap.get(np.nombre.toLowerCase())
            if (!npEntry) continue
            const npMin = getMin(np)
            if (npEntry.cantidad <= npMin) continue

            const maxReduce = npEntry.cantidad - npMin
            const reduceForCal = calPerUnit(np) > 0 ? calToReduce / calPerUnit(np) : 0
            const reduceQty = Math.min(maxReduce, reduceForCal)
            const reducedQty = Math.max(npMin, Math.round(npEntry.cantidad - reduceQty))
            const actualReduce = npEntry.cantidad - reducedQty
            calToReduce -= calPerUnit(np) * actualReduce

            console.log(`[prot] ${group.name}: ↓ ${np.nombre} ${npEntry.cantidad}→${reducedQty} (compensar calorias)`)

            // Apply to ALL foods in same category if this is a main meal group
            if (group.name === 'main-meals') {
              const catForFood = Object.entries(alimentosPorCategoria).find(([, foods]) =>
                foods.some(ff => ff.nombre.toLowerCase() === np.nombre.toLowerCase())
              )
              if (catForFood) {
                for (const ff of catForFood[1]) {
                  const ffEntry = cantidadMap.get(ff.nombre.toLowerCase())
                  if (!ffEntry) continue
                  const ffMin = getMin(ff)
                  const ffReduced = Math.max(ffMin, Math.round(ffEntry.cantidad - reduceQty * (calPerUnit(np) / calPerUnit(ff) || 1)))
                  cantidadMap.set(ff.nombre.toLowerCase(), { cantidad: ffReduced, unidad: ffEntry.unidad })
                }
              }
            } else {
              cantidadMap.set(np.nombre.toLowerCase(), { cantidad: reducedQty, unidad: npEntry.unidad })
            }
          }
        }

        // Apply protein increase
        cantidadMap.set(pf.nombre.toLowerCase(), { cantidad: newQty, unidad: entry.unidad })

        // For main meals, apply to all foods in the protein category
        if (group.name === 'main-meals') {
          const protCat = alimentosPorCategoria['proteina'] || []
          for (const ff of protCat) {
            if (ff.nombre.toLowerCase() === pf.nombre.toLowerCase()) continue
            const ffEntry = cantidadMap.get(ff.nombre.toLowerCase())
            if (!ffEntry) continue
            const ffMax = getMax(ff)
            const ffPpu = protPerUnit(ff)
            if (ffPpu <= 0) continue
            const ffExtraQty = remainingDeficit / ffPpu
            const ffNewQty = Math.min(ffMax, Math.round(ffEntry.cantidad + ffExtraQty))
            cantidadMap.set(ff.nombre.toLowerCase(), { cantidad: ffNewQty, unidad: ffEntry.unidad })
          }
        }

        remainingDeficit -= protPerUnit(pf) * actualExtra
      }

      const finalProt = totalProtOfFoods(group.foods)
      console.log(`[prot] ${group.name}: final proteina=${Math.round(finalProt)}g (target ${Math.round(group.protBudget)}g)`)
    }

    console.log('[nueva-arquitectura] cantidades post-prot:', JSON.stringify(Object.fromEntries(cantidadMap)))

    // ═══ PASO 2: Check if plan can reach objectives ═══
    let maxDayCal = 0
    let maxDayProt = 0

    // Max breakfast
    let bfMaxCal = 0, bfMaxProt = 0
    for (const f of breakfastFoods) {
      const maxQty = getMax(f)
      bfMaxCal += calPerUnit(f) * maxQty
      bfMaxProt += protPerUnit(f) * maxQty
    }

    // Max main meal (use all main foods at porcion_max)
    let mainMaxCal = 0, mainMaxProt = 0
    for (const f of mainFoods) {
      const maxQty = getMax(f)
      mainMaxCal += calPerUnit(f) * maxQty
      mainMaxProt += protPerUnit(f) * maxQty
    }

    // A day = breakfast + almuerzo + cena. Almuerzo and cena share the same main foods
    // but each meal uses a subset. Estimate: each main meal uses ~60% of max main foods
    maxDayCal = bfMaxCal + mainMaxCal * 0.6 + mainMaxCal * 0.6
    maxDayProt = bfMaxProt + mainMaxProt * 0.6 + mainMaxProt * 0.6

    const deficitCalorias = maxDayCal < calTarget * 0.90
    const deficitProteina = maxDayProt < protTarget - 15

    console.log('[plan] Max posible cal:', Math.round(maxDayCal), 'objetivo:', calTarget, 'deficit:', deficitCalorias)
    console.log('[plan] Max posible prot:', Math.round(maxDayProt), 'objetivo:', protTarget, 'deficit:', deficitProteina)

    // ═══ PASO 3: Call Claude for rotations only ═══
    // Build the food catalog text with calculated quantities
    const catalogoPorCat: Record<string, string[]> = {}
    for (const [cat, foods] of Object.entries(alimentosPorCategoria)) {
      catalogoPorCat[cat] = foods.map(f => {
        const entry = cantidadMap.get(f.nombre.toLowerCase())
        const qty = entry?.cantidad ?? f.porcion_base
        const unit = entry?.unidad ?? f.unidad_medida
        return `${f.nombre} → ${qty} ${unit}`
      })
    }

    const catalogoTexto = Object.entries(catalogoPorCat)
      .map(([cat, items]) => `**${cat}:** ${items.join(', ')}`)
      .join('\n')

    // Determine breakfast instruction based on whether desayuno_2 exists
    const hasDesayuno2 = (alimentosPorCategoria['desayuno_2'] || []).length > 0
    const desayuno1Foods = (alimentosPorCategoria['desayuno_1'] || []).map(f => f.nombre)
    let breakfastInstruction: string
    if (hasDesayuno2) {
      breakfastInstruction = '2. Rotar los desayunos — usar variedad entre los alimentos de desayuno_1 y desayuno_2 disponibles'
    } else {
      breakfastInstruction = `2. El desayuno es IGUAL los 7 días: incluir TODOS estos alimentos juntos cada día: ${desayuno1Foods.join(', ')}. NO dividirlos ni alternarlos — todos aparecen en cada desayuno.`
      console.log(`[plan] Desayuno sin opción 2 — instruyendo a Claude: todos los desayuno_1 juntos los 7 días`)
    }

    const systemPrompt = `Eres un asistente de nutrición. Tu única tarea es crear la rotación de 7 días de un plan de comidas.

Se te darán los alimentos disponibles por categoría y las cantidades ya calculadas. Tu trabajo es SOLO decidir qué combinación va en cada día, siguiendo estas reglas:

1. No repetir la misma combinación exacta de alimentos en días consecutivos
${breakfastInstruction}
3. Variar las proteínas, carbs y fibras entre días
4. Usar ÚNICAMENTE los nombres exactos de alimentos que se te dan
5. Cada alimento debe aparecer al menos una vez en los 7 días
6. Cada comida principal (almuerzo/cena) debe incluir: 1 proteína, 1 carbohidrato, 1 fibra, 1 grasa
7. Responde ÚNICAMENTE con JSON válido, sin texto adicional

Estructura del JSON:
{
  "dias": [
    {
      "dia": 1,
      "desayuno": [{"alimento": "nombre exacto", "cantidad": 150, "unidad": "gramos"}],
      "almuerzo": [{"alimento": "nombre exacto", "cantidad": 150, "unidad": "gramos"}],
      "cena": [{"alimento": "nombre exacto", "cantidad": 150, "unidad": "gramos"}]
    }
  ]
}`

    const userMessage = `Cantidades calculadas por alimento (usa EXACTAMENTE estas cantidades):
${catalogoTexto}

Genera la rotación de 7 días usando estos alimentos con las cantidades indicadas. Responde SOLO con JSON.`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: userMessage }],
      system: [{
        type: 'text' as const,
        text: systemPrompt,
        // 5min ephemeral cache. Anthropic redujo default de 1h a 5min en marzo 2026.
        // Si en el futuro mueven el default otra vez, este código sigue siendo correcto.
        cache_control: { type: 'ephemeral' as const },
      }],
    })

    // Token logging for generar-plan
    if (message.usage) {
      const u = message.usage as unknown as Record<string, unknown>
      console.log(`[GenPlan][Tokens] user=${userId} input=${u.input_tokens} output=${u.output_tokens} cache_create=${u.cache_creation_input_tokens || 0} cache_read=${u.cache_read_input_tokens || 0}`)
    }

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Lucy tuvo un problema generando tu plan. Intenta de nuevo.' }, { status: 500 })
    }

    const plan: { dias: PlanDia[] } = JSON.parse(jsonMatch[0])

    // ═══ PASO 3.5: Iterative per-day quantity tuning ═══
    // Replicates the manual coach process: for each day, adjust quantities
    // iteratively until kcal ±10% AND prot ±10g, or give up after max iterations.
    const dayOverrides = new Map<string, number>() // key: `${dia}-${nombre.toLowerCase()}`
    // Build food lookup (also used by Paso 4)
    const allFoodsLookup = new Map<string, AlimentoData>()
    for (const foods of Object.values(alimentosPorCategoria)) {
      for (const f of foods) allFoodsLookup.set(f.nombre.toLowerCase(), f)
    }

    const CAL_TOL = calTarget * 0.10
    const PROT_TOL = 10
    const MAX_ITER = 10

    // Bug #45-E: Read persisted non-gen rows that survive replace_calendario_generado.
    // Bug #74: forceRegenerate=true → RPC borra todo, no leer baseline que no va a sobrevivir.
    const persistedBaseline = new Map<number, { kcal: number; prot: number }>()
    if (!forceRegenerate) {
      const { data: persistedRows } = await supabase
        .from('calendario')
        .select('dia, cantidad, alimento:alimentos(calorias_por_unidad, proteina_por_unidad, porcion_base, unidad_medida)')
        .eq('user_id', userId)
        .eq('origen', 'chat')

      if (persistedRows && persistedRows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const row of persistedRows as any[]) {
          const a = Array.isArray(row.alimento) ? row.alimento[0] : row.alimento
          if (!a) continue
          const ratio = a.unidad_medida === 'unidad' ? row.cantidad : row.cantidad / (a.porcion_base || 100)
          const prev = persistedBaseline.get(row.dia) || { kcal: 0, prot: 0 }
          prev.kcal += a.calorias_por_unidad * ratio
          prev.prot += a.proteina_por_unidad * ratio
          persistedBaseline.set(row.dia, prev)
        }
        console.log(`[loop] persisted chat rows for user: ${persistedRows.length} rows`)
      }
    }

    for (const dia of plan.dias) {
      // Build day items with current quantities from cantidadMap
      type DayItem = { nombre: string; comida: string; food: AlimentoData; qty: number }
      const dayItems: DayItem[] = []
      for (const comida of ['desayuno', 'almuerzo', 'cena'] as const) {
        const items = dia[comida]
        if (!items) continue
        for (const item of items) {
          const key = item.alimento.toLowerCase()
          const food = allFoodsLookup.get(key)
          if (!food) continue
          const qty = cantidadMap.get(key)?.cantidad ?? item.cantidad
          dayItems.push({ nombre: key, comida, food, qty })
        }
      }

      const getQty = (di: DayItem) => dayOverrides.get(`${dia.dia}-${di.nombre}`) ?? di.qty
      const setQty = (di: DayItem, q: number) => dayOverrides.set(`${dia.dia}-${di.nombre}`, q)
      const sumDay = () => {
        // Start from persisted non-gen rows (Bug #45-E)
        const fixed = persistedBaseline.get(dia.dia) || { kcal: 0, prot: 0 }
        let kcal = fixed.kcal, prot = fixed.prot
        for (const di of dayItems) { const q = getQty(di); kcal += calPerUnit(di.food) * q; prot += protPerUnit(di.food) * q }
        return { kcal, prot }
      }
      // Bug #45-D: bilateral protein check — excess >+10g also fails
      const isOk = (s: { kcal: number; prot: number }) =>
        Math.abs(s.kcal - calTarget) <= CAL_TOL && Math.abs(s.prot - protTarget) <= PROT_TOL

      for (let iter = 1; iter <= MAX_ITER; iter++) {
        const { kcal, prot } = sumDay()
        const kcalDelta = kcal - calTarget
        const protDelta = prot - protTarget

        if (isOk({ kcal, prot })) {
          console.log(`[loop dia=${dia.dia} iter=${iter}] kcal=${Math.round(kcal)} (${kcalDelta > 0 ? '+' : ''}${Math.round(kcalDelta)}), prot=${Math.round(prot)}g (${protDelta > 0 ? '+' : ''}${Math.round(protDelta)}g) — OK`)
          break
        }

        console.log(`[loop dia=${dia.dia} iter=${iter}] kcal=${Math.round(kcal)} (${kcalDelta > 0 ? '+' : ''}${Math.round(kcalDelta)}), prot=${Math.round(prot)}g (${protDelta > 0 ? '+' : ''}${Math.round(protDelta)}g)`)

        // Step 4: kcal deficit → raise quantities: protein first, then carbs, then fat
        if (kcalDelta < -CAL_TOL) {
          const deficit = Math.abs(kcalDelta)
          const catOrder = ['proteina', 'carbohidrato', 'fibra', 'grasa']
          let remaining = deficit
          for (const cat of catOrder) {
            if (remaining <= 10) break
            const catItems = dayItems.filter(di => di.food.categoria_comida === cat)
            for (const di of catItems) {
              if (remaining <= 10) break
              const cur = getQty(di)
              const max = Math.max(getMin(di.food), getMax(di.food)) // defensive for Pana bug
              if (cur >= max) continue
              const cpu = calPerUnit(di.food)
              if (cpu <= 0) continue
              const addQty = Math.min(max - cur, remaining / cpu)
              const newQty = Math.round(cur + addQty)
              if (newQty <= cur) continue
              const added = cpu * (newQty - cur)
              setQty(di, newQty)
              remaining -= added
              console.log(`[loop dia=${dia.dia} iter=${iter}] ↑ ${di.food.nombre} ${Math.round(cur)}→${newQty} (+${Math.round(added)} kcal)`)
            }
          }
        }

        // Step 6: kcal excess → lower quantities: carbs first, then fat (never reduce protein)
        if (kcalDelta > CAL_TOL) {
          const excess = kcalDelta - CAL_TOL * 0.5 // aim for middle of tolerance
          const catOrder = ['carbohidrato', 'grasa', 'fibra']
          let remaining = excess
          for (const cat of catOrder) {
            if (remaining <= 10) break
            const catItems = dayItems.filter(di => di.food.categoria_comida === cat)
              .sort((a, b) => calPerUnit(b.food) - calPerUnit(a.food)) // reduce densest first
            for (const di of catItems) {
              if (remaining <= 10) break
              const cur = getQty(di)
              const min = Math.min(getMin(di.food), getMax(di.food)) // defensive
              if (cur <= min) continue
              const cpu = calPerUnit(di.food)
              if (cpu <= 0) continue
              const reduceQty = Math.min(cur - min, remaining / cpu)
              const newQty = Math.max(min, Math.round(cur - reduceQty))
              if (newQty >= cur) continue
              const reduced = cpu * (cur - newQty)
              setQty(di, newQty)
              remaining -= reduced
              console.log(`[loop dia=${dia.dia} iter=${iter}] ↓ ${di.food.nombre} ${Math.round(cur)}→${newQty} (-${Math.round(reduced)} kcal)`)
            }
          }
        }

        // Step 5: prot deficit → raise protein foods specifically
        const postKcal = sumDay()
        if (postKcal.prot < protTarget - PROT_TOL) {
          const protItems = dayItems
            .filter(di => di.food.categoria_comida === 'proteina' || (di.food.rol_permitido || []).includes('Proteina'))
            .sort((a, b) => {
              const ra = protPerUnit(a.food) / (calPerUnit(a.food) || 1)
              const rb = protPerUnit(b.food) / (calPerUnit(b.food) || 1)
              return rb - ra // best prot/kcal ratio first
            })
          let protNeeded = protTarget - postKcal.prot
          for (const pi of protItems) {
            if (protNeeded <= 0) break
            const cur = getQty(pi)
            const max = Math.max(getMin(pi.food), getMax(pi.food))
            if (cur >= max) continue
            const ppu = protPerUnit(pi.food)
            if (ppu <= 0) continue
            const addQty = Math.min(max - cur, protNeeded / ppu)
            const newQty = Math.round(cur + addQty)
            if (newQty <= cur) continue
            const addedProt = ppu * (newQty - cur)
            const addedCal = calPerUnit(pi.food) * (newQty - cur)
            setQty(pi, newQty)
            protNeeded -= addedProt
            console.log(`[loop dia=${dia.dia} iter=${iter}] ���prot ${pi.food.nombre} ${Math.round(cur)}→${newQty} (+${Math.round(addedProt)}g prot, +${Math.round(addedCal)} kcal)`)
          }

          // If raising prot pushed kcal over +10%, compensate by lowering carbs/fat
          const afterProt = sumDay()
          if (afterProt.kcal > calTarget + CAL_TOL) {
            const overage = afterProt.kcal - calTarget
            const catOrder = ['carbohidrato', 'grasa', 'fibra']
            let rem = overage
            for (const cat of catOrder) {
              if (rem <= 10) break
              const catItems = dayItems.filter(di => di.food.categoria_comida === cat)
                .sort((a, b) => calPerUnit(b.food) - calPerUnit(a.food))
              for (const di of catItems) {
                if (rem <= 10) break
                const cur = getQty(di)
                const min = Math.min(getMin(di.food), getMax(di.food))
                if (cur <= min) continue
                const cpu = calPerUnit(di.food)
                if (cpu <= 0) continue
                const reduceQty = Math.min(cur - min, rem / cpu)
                const newQty = Math.max(min, Math.round(cur - reduceQty))
                if (newQty >= cur) continue
                const reduced = cpu * (cur - newQty)
                setQty(di, newQty)
                rem -= reduced
                console.log(`[loop dia=${dia.dia} iter=${iter}] ↓comp ${di.food.nombre} ${Math.round(cur)}→${newQty} (-${Math.round(reduced)} kcal)`)
              }
            }
          }
        }

        // Step 5b: prot excess → lower generated protein foods (Bug #45-D)
        // Chat rows (origen='chat') are the user's active choice — untouchable.
        // Only reduce foods from Claude's rotation (all dayItems are origen='generado').
        {
          const postSteps = sumDay()
          const protExcess = postSteps.prot - protTarget
          if (protExcess > PROT_TOL) {
            const protItems = dayItems
              .filter(di => di.food.categoria_comida === 'proteina')
              .sort((a, b) => {
                // Reduce highest prot/kcal ratio first (most prot removed per kcal freed)
                const ra = protPerUnit(a.food) / (calPerUnit(a.food) || 1)
                const rb = protPerUnit(b.food) / (calPerUnit(b.food) || 1)
                return rb - ra
              })
            let protToReduce = protExcess - PROT_TOL * 0.5 // aim for middle of band
            for (const pi of protItems) {
              if (protToReduce <= 0) break
              const cur = getQty(pi)
              const min = Math.min(getMin(pi.food), getMax(pi.food)) // defensive
              if (cur <= min) continue
              const ppu = protPerUnit(pi.food)
              if (ppu <= 0) continue
              const reduceQty = Math.min(cur - min, protToReduce / ppu)
              const newQty = Math.max(min, Math.round(cur - reduceQty))
              if (newQty >= cur) continue
              const reducedProt = ppu * (cur - newQty)
              const reducedCal = calPerUnit(pi.food) * (cur - newQty)
              setQty(pi, newQty)
              protToReduce -= reducedProt
              console.log(`[loop dia=${dia.dia} iter=${iter}] ↓prot ${pi.food.nombre} ${Math.round(cur)}→${newQty} (-${Math.round(reducedProt)}g prot, -${Math.round(reducedCal)} kcal)`)
            }
          }
        }

        // Check if converged after this iteration
        const endState = sumDay()
        if (isOk(endState)) {
          console.log(`[loop dia=${dia.dia} iter=${iter}] CONVERGED kcal=${Math.round(endState.kcal)}, prot=${Math.round(endState.prot)}g`)
          break
        }

        if (iter === MAX_ITER) {
          console.log(`[loop dia=${dia.dia}] GAVE UP after ${MAX_ITER} iters — kcal=${Math.round(endState.kcal)}, prot=${Math.round(endState.prot)}g`)
        }
      }
    }

    console.log('[loop] overrides:', dayOverrides.size)

    // Personalizaciones: computed AFTER RPC replace (moved from here to post-save block)

    // ═══ Messages: conditional on first generation vs regeneration ═══
    if (esPrimeraVez) {
      // First generation — full welcome messages
      const FACTORES_ACTIVIDAD: Record<string, number> = {
        // New levels (Bug #17)
        A: 1.2, B: 1.3, C: 1.4,
        // Legacy levels (pre-Bug #17 users)
        sedentario: 1.2, ligero: 1.375, moderado: 1.55, activo: 1.725, muy_activo: 1.9,
      }
      const pesoKg = Number(usuario.peso_kg) || 0
      const alturaCm = Number(usuario.altura_cm) || 0
      const edad = Number(usuario.edad) || 0
      const factor = FACTORES_ACTIVIDAD[usuario.nivel_actividad] ?? 1.2
      const generoOffset = usuario.genero === 'masculino' ? 5 : -161
      const bmr = 10 * pesoKg + 6.25 * alturaCm - 5 * edad + generoOffset
      const tdee = Math.round(bmr * factor)

      let introMessage = ''
      if (usuario.meta === 'perder_peso') {
        const deficitPct = Math.round(((tdee - calTarget) / tdee) * 100)
        introMessage = `Basado en tu peso, altura, edad y nivel de actividad, tu cuerpo quema aproximadamente ${tdee} calorías al día. Tu plan está diseñado con un déficit del ${deficitPct}% — ${calTarget} calorías — lo que te permite perder peso de forma sostenible sin sacrificar músculo ni energía. ¡Aquí está tu plan de la semana! 🌿`
      } else if (usuario.meta === 'ganar_masa') {
        const superavitPct = Math.round(((calTarget - tdee) / tdee) * 100)
        introMessage = `Basado en tu perfil, tu cuerpo quema aproximadamente ${tdee} calorías al día. Tu plan incluye un superávit del ${superavitPct}% — ${calTarget} calorías — diseñado para construir músculo de forma limpia. ¡Aquí está tu plan! 💪`
      } else {
        introMessage = `Basado en tu perfil, tu cuerpo necesita aproximadamente ${tdee} calorías al día para mantenerse. Tu plan está calibrado exactamente en eso — ${calTarget} calorías — con la distribución correcta de proteína, carbohidratos y grasas para que te sientas con energía todo el día. ¡Aquí está tu plan! ✨`
      }

      await supabase.from('conversaciones').insert({
        user_id: userId, role: 'assistant', content: introMessage,
      })

      // Bug #64: removed stale warning message about "alimentos densos calóricamente".
      // The warnings array from Paso 1c scaling is pre-iterative-loop state.
      // Paso 3.5 fixes these issues per-day. The real post-gen warnings come from
      // analizarCalendario (Paso 5) which operates on the final saved plan.
      if (warnings.length > 0) {
        console.log(`[plan] Paso 1c scaling warnings (informational only, not sent to user): ${warnings.join(', ')}`)
      }
    }
    // Regeneration message is built AFTER post-generation analysis (see below)

    // ═══ PASO 4: Save calendar using backend-calculated quantities ═══
    // allFoodsLookup built in Paso 3.5 iterative loop

    const calendarioRows: { user_id: string; dia: number; comida: string; alimento_id: string; cantidad: number; unidad: string; origen: string }[] = []
    const comprasTotals = new Map<string, { alimentoId: string; cantidad: number; unidad: string }>()

    for (const dia of plan.dias) {
      for (const comida of ['desayuno', 'almuerzo', 'cena'] as const) {
        const items = dia[comida]
        if (!items) continue
        for (const item of items) {
          const match = alimentosMap.get(item.alimento.toLowerCase())
          if (!match) {
            console.error('[plan] alimento no encontrado:', item.alimento)
            continue
          }

          // Use per-day override (Paso 3.5) if available, else global cantidadMap
          const overrideKey = `${dia.dia}-${item.alimento.toLowerCase()}`
          const dayOverrideQty = dayOverrides.get(overrideKey)
          const entry = cantidadMap.get(item.alimento.toLowerCase())
          let cantidad = dayOverrideQty ?? entry?.cantidad ?? item.cantidad
          const unidad = entry?.unidad ?? item.unidad

          // Final safety: enforce porcion_min as absolute floor
          const foodData = allFoodsLookup.get(item.alimento.toLowerCase())
          if (foodData) {
            const min = getMin(foodData)
            if (cantidad < min) {
              console.warn(`[plan] Clamping ${item.alimento} from ${cantidad} to min ${min}`)
              cantidad = min
            }
          }

          calendarioRows.push({
            user_id: userId,
            dia: dia.dia,
            comida,
            alimento_id: match.id,
            cantidad,
            unidad,
            origen: 'generado',
          })

          const key = match.id
          const existing = comprasTotals.get(key)
          if (existing) {
            existing.cantidad += cantidad
          } else {
            comprasTotals.set(key, { alimentoId: match.id, cantidad, unidad })
          }
        }
      }
    }

    // Desglose de calorías por comida por día
    for (let diaNum = 1; diaNum <= 7; diaNum++) {
      const diaRows = calendarioRows.filter(r => r.dia === diaNum)
      const calByMeal: Record<string, number> = { desayuno: 0, almuerzo: 0, cena: 0 }
      const protByMeal: Record<string, number> = { desayuno: 0, almuerzo: 0, cena: 0 }
      for (const row of diaRows) {
        const food = allFoodsLookup.get(
          Array.from(alimentosMap.entries()).find(([, v]) => v.id === row.alimento_id)?.[0] || ''
        )
        if (food) {
          calByMeal[row.comida] = (calByMeal[row.comida] || 0) + calPerUnit(food) * row.cantidad
          protByMeal[row.comida] = (protByMeal[row.comida] || 0) + protPerUnit(food) * row.cantidad
        }
      }
      console.log('[desglose]', JSON.stringify({
        dia: diaNum,
        d_cal: Math.round(calByMeal.desayuno), d_prot: Math.round(protByMeal.desayuno),
        a_cal: Math.round(calByMeal.almuerzo), a_prot: Math.round(protByMeal.almuerzo),
        c_cal: Math.round(calByMeal.cena), c_prot: Math.round(protByMeal.cena),
        total_cal: Math.round(calByMeal.desayuno + calByMeal.almuerzo + calByMeal.cena),
        total_prot: Math.round(protByMeal.desayuno + protByMeal.almuerzo + protByMeal.cena),
        obj_cal: calTarget, obj_prot: protTarget,
      }))
    }

    if (calendarioRows.length > 0) {
      // Atomic DELETE+INSERT via Postgres RPC (transactional — rollback on failure)
      const rpcRows = calendarioRows.map(r => ({
        dia: r.dia, comida: r.comida, alimento_id: r.alimento_id,
        cantidad: r.cantidad, unidad: r.unidad,
      }))
      const { data: insertedCount, error: rpcErr } = await supabase.rpc('replace_calendario_generado', {
        p_user_id: userId,
        p_rows: rpcRows,
      })
      if (rpcErr) {
        console.error('[plan] RPC replace_calendario_generado failed:', rpcErr.message)
        return NextResponse.json({ error: 'Error guardando el calendario: ' + rpcErr.message }, { status: 500 })
      }
      console.log('[plan] Atomic replace OK:', insertedCount, 'rows inserted')
    }

    // Save shopping list
    const comprasRows = Array.from(comprasTotals.values()).map(c => ({
      user_id: userId,
      alimento_id: c.alimentoId,
      cantidad_total: c.cantidad,
      unidad: c.unidad,
      comprado: false,
    }))

    if (comprasRows.length > 0) {
      const { error: shopErr } = await supabase.from('lista_compras').insert(comprasRows)
      if (shopErr) {
        return NextResponse.json({ error: 'Error guardando la lista de compras: ' + shopErr.message }, { status: 500 })
      }
    }

    // ═══ Check for existing personalizations (post-RPC: only counts chat rows that survived AND are visible) ═══
    // Build set of (dia, comida, alimento_id) from the new plan to detect overwritten chat rows
    const newPlanSlots = new Set<string>()
    for (const row of calendarioRows) {
      newPlanSlots.add(`${row.dia}|${row.comida}|${row.alimento_id}`)
    }

    const { data: personalizaciones } = await supabase
      .from('calendario')
      .select('cantidad, unidad, dia, comida, alimento_id, alimento:alimentos(nombre, calorias_por_unidad, porcion_base, unidad_medida)')
      .eq('user_id', userId)
      .in('origen', ['chat', 'coach', 'sugerencia'])

    // Filter: only keep chat rows where the alimento is STILL visible in that (dia, comida) slot
    // A chat row is "visible" if it exists in the DB and the new plan didn't overwrite that slot
    // with a DIFFERENT alimento. Check: is this (dia, comida, alimento_id) in the new plan?
    const visiblePersonalizaciones = (personalizaciones || []).filter(p => {
      return newPlanSlots.has(`${p.dia}|${p.comida}|${p.alimento_id}`)
    })

    const tienePersonalizaciones = visiblePersonalizaciones.length > 0

    let extrasCal = 0
    const alimentosPersonalizados: string[] = []
    if (tienePersonalizaciones) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const seen = new Map<string, Set<number>>()
      for (const p of visiblePersonalizaciones) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a = (Array.isArray(p.alimento) ? (p.alimento as any)[0] : p.alimento) as any
        if (!a) continue
        const ratio = a.unidad_medida === 'unidad' ? p.cantidad : p.cantidad / (a.porcion_base || 100)
        extrasCal += a.calorias_por_unidad * ratio
        const nombre = a.nombre
        if (!seen.has(nombre)) seen.set(nombre, new Set())
        seen.get(nombre)!.add(p.dia)
      }
      const DIA_NOMBRES_LOCAL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
      for (const [nombre, dias] of Array.from(seen.entries())) {
        if (dias.size >= 7) {
          alimentosPersonalizados.push(`${nombre} todos los días`)
        } else {
          const diasNames = Array.from(dias).sort().map((d: number) => DIA_NOMBRES_LOCAL[d - 1] || `día ${d}`)
          alimentosPersonalizados.push(`${nombre} en ${diasNames.join(', ')}`)
        }
      }
      console.log(`[plan] Personalizaciones visibles: ${visiblePersonalizaciones.length} rows, ${alimentosPersonalizados.length} alimentos, +${Math.round(extrasCal)} kcal`)
    }

    // ═══ PASO 5: Smart deficit messages with snack suggestions ═══
    if (deficitCalorias) {
      // Find top 3 snack candidates by calorie density
      const selectedNames = Array.from(alimentosMap.values()).map(a => a.nombre)
      const { data: snacksCal } = await supabase
        .from('alimentos')
        .select('nombre, calorias_por_unidad, porcion_base, unidad_medida')
        .not('rol_permitido', 'is', null)
        .order('calorias_por_unidad', { ascending: false })
        .limit(20)

      const topSnacksCal = (snacksCal || [])
        .filter(s => !selectedNames.includes(s.nombre))
        .slice(0, 3)
        .map(s => {
          const cal = s.unidad_medida === 'unidad' ? s.calorias_por_unidad : Math.round(s.calorias_por_unidad * (s.porcion_base || 100) / (s.porcion_base || 100))
          return `${s.nombre} (~${cal} kcal)`
        })

      if (topSnacksCal.length > 0) {
        await supabase.from('conversaciones').insert({
          user_id: userId, role: 'assistant',
          content: `Noté que con los alimentos que escogiste puedo armar un plan de hasta ${Math.round(maxDayCal)} calorías diarias, un poco por debajo de tu objetivo de ${calTarget} kcal. Para completar tus macros sin cambiar tus comidas principales, podrías considerar añadir como snack: ${topSnacksCal.join(', ')}. ¿Quieres que añada uno de estos a tu plan? 💜`,
        })
      }
    }

    if (deficitProteina) {
      const selectedNames = Array.from(alimentosMap.values()).map(a => a.nombre)
      const { data: snacksProt } = await supabase
        .from('alimentos')
        .select('nombre, proteina_por_unidad, porcion_base, unidad_medida')
        .not('rol_permitido', 'is', null)
        .order('proteina_por_unidad', { ascending: false })
        .limit(20)

      const topSnacksProt = (snacksProt || [])
        .filter(s => !selectedNames.includes(s.nombre))
        .slice(0, 3)
        .map(s => {
          const prot = s.unidad_medida === 'unidad' ? s.proteina_por_unidad : Math.round(s.proteina_por_unidad)
          return `${s.nombre} (~${prot}g proteína)`
        })

      if (topSnacksProt.length > 0) {
        await supabase.from('conversaciones').insert({
          user_id: userId, role: 'assistant',
          content: `También noté que con estos alimentos la proteína máxima que puedo incluir es ${Math.round(maxDayProt)}g, por debajo de tu objetivo de ${protTarget}g. Las mejores opciones para completarla serían: ${topSnacksProt.join(', ')}. ¿Te añado uno como snack?`,
        })
      }
    }

    // Post-generation analysis using the canonical product criteria
    const { data: calWithFood } = await supabase
      .from('calendario')
      .select('dia, cantidad, alimento:alimentos(id, nombre, calorias_por_unidad, proteina_por_unidad, porcion_base, porcion_min, porcion_max, unidad_medida, rol_permitido)')
      .eq('user_id', userId)

    let diasFuera = 0
    let diasDeficitProt = 0
    let diasExcesoProt = 0
    let diasDeficitCal = 0
    let diasExcesoCal = 0

    if (calWithFood && calWithFood.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const alimentosParaAnalisis: AlimentoCalendario[] = calWithFood.map((row: any) => {
        const a = Array.isArray(row.alimento) ? row.alimento[0] : row.alimento
        return {
          alimento_id: a?.id ?? '',
          nombre: a?.nombre ?? '',
          cantidad: row.cantidad,
          unidad_medida: a?.unidad_medida ?? 'gramos',
          porcion_base: a?.porcion_base ?? 100,
          porcion_min: a?.porcion_min ?? 0,
          porcion_max: a?.porcion_max ?? 999,
          calorias_por_unidad: a?.calorias_por_unidad ?? 0,
          proteina_por_unidad: a?.proteina_por_unidad ?? 0,
          comida: 'almuerzo' as const, // not used for day-level analysis
          dia: row.dia,
          rol_permitido: a?.rol_permitido ?? [],
        }
      })

      const analisis = analizarCalendario(alimentosParaAnalisis, calTarget, protTarget)

      // analizarCalendario detects: deficit_calorias, exceso_calorias, deficit_proteina
      // It does NOT detect excess protein (prot > target + 10g) — we check that separately
      diasDeficitCal = analisis.dias_problematicos.filter(d => d.problemas.includes('deficit_calorias')).length
      diasExcesoCal = analisis.dias_problematicos.filter(d => d.problemas.includes('exceso_calorias')).length
      diasDeficitProt = analisis.dias_problematicos.filter(d => d.problemas.includes('deficit_proteina')).length

      // Check ALL 7 days for excess protein (not covered by analizarCalendario)
      const dailyTotals: Record<number, { cal: number; prot: number }> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of calWithFood as any[]) {
        const a = Array.isArray(row.alimento) ? row.alimento[0] : row.alimento
        if (!a) continue
        const ratio = a.unidad_medida === 'unidad' ? row.cantidad : row.cantidad / (a.porcion_base || 100)
        if (!dailyTotals[row.dia]) dailyTotals[row.dia] = { cal: 0, prot: 0 }
        dailyTotals[row.dia].prot += (a.proteina_por_unidad || 0) * ratio
      }
      diasExcesoProt = Object.values(dailyTotals).filter(d => d.prot > protTarget + 10).length

      diasFuera = new Set([
        ...analisis.dias_problematicos.map(d => d.dia),
        ...Object.entries(dailyTotals).filter(([, d]) => d.prot > protTarget + 10).map(([dia]) => parseInt(dia)),
      ]).size

      console.log(`[plan] Verificación post-generación — dias_fuera: ${diasFuera}, deficit_prot: ${diasDeficitProt}, exceso_prot: ${diasExcesoProt}, deficit_cal: ${diasDeficitCal}, exceso_cal: ${diasExcesoCal}`)
    }

    // Build honest description of what's off
    const buildProblemaDesc = (): string => {
      const parts: string[] = []
      if (diasExcesoProt > 0) parts.push('la proteína queda por arriba de tu meta')
      if (diasDeficitProt > 0) parts.push('la proteína queda por debajo de tu meta')
      if (diasExcesoCal > 0) parts.push('las calorías quedan por encima de tu meta')
      if (diasDeficitCal > 0) parts.push('las calorías quedan por debajo de tu meta')
      if (parts.length === 0) return 'las calorías o la proteína quedan fuera de tu meta'
      return parts.join(' y ')
    }

    if (esPrimeraVez) {
      // First generation greeting
      let lucyPostMsg: string
      if (diasDeficitProt >= 5) {
        // Severe protein deficit — specific actionable message (preserved from original)
        lucyPostMsg = `¡Hola ${usuario.nombre}! Acabo de revisar tu plan y quiero contarte algo importante 💜 Veo que en la mayoría de los días te va a faltar proteína para llegar a tu meta. Esto no significa que el plan esté mal — significa que los alimentos que escogiste no alcanzan para cubrir tus ${protTarget}g de proteína diaria. Te recomiendo añadir una fuente de proteína a tu desayuno: Yogur Griego, Clara de Huevo o Proteína en Polvo funcionan perfecto. ¿Quieres que ajustemos el plan juntas?`
      } else if (diasFuera > 0) {
        // Some days outside tolerance — honest message
        lucyPostMsg = `¡Hola ${usuario.nombre}! Tu plan de la semana ya está listo 🌿 Antes de empezar, quiero ser clara: noté que en ${diasFuera} día${diasFuera > 1 ? 's' : ''} ${buildProblemaDesc()}. Eso es normal cuando los alimentos que elegiste tienen densidades distintas — podemos ver cómo ajustarlo. Si quieres revisar opciones, dime. 💜`
      } else {
        // All 7 days within tolerance — genuinely aligned
        lucyPostMsg = `¡Hola ${usuario.nombre}! Tu plan de la semana está listo y se ve muy bien 🎉 Tus calorías y proteína están alineadas con tu meta. Recuerda que puedes pedirme cualquier cambio — swap de alimentos, recetas, snacks — cuando quieras. ¡Vamos con todo esta semana! 💜`
      }
      await supabase.from('conversaciones').insert({
        user_id: userId, role: 'assistant', content: lucyPostMsg, leido: false,
      })
    } else {
      // Regeneration greeting
      let regenMsg = 'Tu plan se regeneró con tus nuevos macros.'

      // Add personalization mention if any
      if (tienePersonalizaciones) {
        const extrasKcalRound = Math.round(extrasCal / 7)
        const listaAlimentos = alimentosPersonalizados.join(', ')
        regenMsg += ` Mantuve las personalizaciones que habías pedido: ${listaAlimentos}.\n\nCon esos extras estás aproximadamente ${extrasKcalRound} kcal por encima de tu target diario. ¿Quieres que ajuste las cantidades del plan para compensar, o prefieres mantenerlo así?`
      }

      // Honest analysis — same criteria as first generation
      if (diasDeficitProt >= 5) {
        regenMsg += `\n\nImportante: la mayoría de los días te va a faltar proteína con los alimentos que escogiste. ¿Quieres que te sugiera snacks proteicos para completar? Es importante que lo ajustemos juntas. 💜`
      } else if (diasFuera > 0) {
        regenMsg += `\n\nAdemás, noté que en ${diasFuera} día${diasFuera > 1 ? 's' : ''} ${buildProblemaDesc()} — podemos ver cómo ajustarlo. Si quieres revisar opciones, dime. 💜`
      } else {
        regenMsg += ' Tus calorías y proteína están alineadas con tu meta. 💜'
      }

      await supabase.from('conversaciones').insert({
        user_id: userId, role: 'assistant', content: regenMsg, leido: false,
      })
    }

    // Release lock
    await supabase.from('usuarios').update({ generando_plan_at: null }).eq('id', userId)

    return NextResponse.json({ success: true, dias: plan.dias.length, items: calendarioRows.length })
  } catch (err) {
    console.error('generar-plan error:', err)
    // Release lock on error (best effort)
    if (lockUserId) {
      try {
        const sbCleanup = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
        await sbCleanup.from('usuarios').update({ generando_plan_at: null }).eq('id', lockUserId)
      } catch { /* ignore */ }
    }
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
