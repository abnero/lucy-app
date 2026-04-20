import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

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

// Meal distribution constants
const MEAL_CAL_PCT: Record<string, number> = { desayuno: 0.30, almuerzo: 0.40, cena: 0.30 }
// Protein distribution reserved for future protein-aware scaling
// const MEAL_PROT_PCT = { desayuno: 0.30, almuerzo: 0.35, cena: 0.35 }

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const { userId, accessToken, serviceRoleKey } = await req.json()
    if (!userId || (!accessToken && !serviceRoleKey)) {
      return NextResponse.json({ error: 'userId and accessToken (or serviceRoleKey) required' }, { status: 400 })
    }

    const supabase = serviceRoleKey === process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      : createAuthenticatedClient(accessToken)

    // ═══ 1. Fetch user profile ═══
    const { data: usuario, error: userErr } = await supabase
      .from('usuarios')
      .select('nombre, calorias_objetivo, proteina_objetivo, carbs_objetivo, grasas_objetivo, meta, peso_kg, altura_cm, edad, nivel_actividad, genero')
      .eq('id', userId)
      .single()

    if (userErr || !usuario) {
      return NextResponse.json(
        { error: 'Hubo un problema cargando tu perfil. Por favor regresa y completa tu información.' },
        { status: 404 }
      )
    }

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
      return NextResponse.json(
        { error: 'No encontramos tus alimentos seleccionados. Por favor regresa y escoge tus alimentos.' },
        { status: 404 }
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
    // Dev-only test overrides via query params
    const testCal = process.env.NODE_ENV === 'development' ? url.searchParams.get('test_calorias') : null
    const testProt = process.env.NODE_ENV === 'development' ? url.searchParams.get('test_proteina') : null

    const calTarget = testCal ? parseInt(testCal) : (usuario.calorias_objetivo || 1800)
    const protTarget = testProt ? parseInt(testProt) : (usuario.proteina_objetivo || 100)

    console.log('[objetivo]', testCal ? '⚠️ TEST OVERRIDE' : 'leído desde DB:', 'calorias:', calTarget, 'proteina:', protTarget, 'nombre:', usuario.nombre)

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
            qty = Math.max(f.porcion_min || 1, Math.min(f.porcion_max || 10, qty))
          } else {
            qty = Math.round(foodBudget / cpu)
            qty = Math.max(f.porcion_min || 10, Math.min(f.porcion_max || 300, qty))
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
            qty = Math.max(f.porcion_min || 1, Math.min(f.porcion_max || 10, qty))
          } else {
            qty = Math.round(catBudget / cpu)
            qty = Math.max(f.porcion_min || 10, Math.min(f.porcion_max || 300, qty))
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
          const max = food.unidad_medida === 'unidad' ? (food.porcion_max || 10) : (food.porcion_max || 300)
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
          const max = food.unidad_medida === 'unidad' ? (food.porcion_max || 10) : (food.porcion_max || 300)
          const min = food.unidad_medida === 'unidad' ? (food.porcion_min || 1) : (food.porcion_min || 10)

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
              const fMax = f.unidad_medida === 'unidad' ? (f.porcion_max || 10) : (f.porcion_max || 300)
              const fMin = f.unidad_medida === 'unidad' ? (f.porcion_min || 1) : (f.porcion_min || 10)
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
        const min = f.unidad_medida === 'unidad' ? (f.porcion_min || 1) : (f.porcion_min || 10)
        const max = f.unidad_medida === 'unidad' ? (f.porcion_max || 10) : (f.porcion_max || 300)
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
            const min = f.unidad_medida === 'unidad' ? (f.porcion_min || 1) : (f.porcion_min || 10)
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
            const max = f.unidad_medida === 'unidad' ? (f.porcion_max || 10) : (f.porcion_max || 300)
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
            const min = f.unidad_medida === 'unidad' ? (f.porcion_min || 1) : (f.porcion_min || 10)
            const max = f.unidad_medida === 'unidad' ? (f.porcion_max || 10) : (f.porcion_max || 300)
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
                const min = ff.unidad_medida === 'unidad' ? (ff.porcion_min || 1) : (ff.porcion_min || 10)
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
                const max = ff.unidad_medida === 'unidad' ? (ff.porcion_max || 10) : (ff.porcion_max || 300)
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

        const max = pf.unidad_medida === 'unidad' ? (pf.porcion_max || 10) : (pf.porcion_max || 300)
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
            const npMin = np.unidad_medida === 'unidad' ? (np.porcion_min || 1) : (np.porcion_min || 10)
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
                  const ffMin = ff.unidad_medida === 'unidad' ? (ff.porcion_min || 1) : (ff.porcion_min || 10)
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
            const ffMax = ff.unidad_medida === 'unidad' ? (ff.porcion_max || 10) : (ff.porcion_max || 300)
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
      const maxQty = f.unidad_medida === 'unidad' ? (f.porcion_max || 10) : (f.porcion_max || 300)
      bfMaxCal += calPerUnit(f) * maxQty
      bfMaxProt += protPerUnit(f) * maxQty
    }

    // Max main meal (use all main foods at porcion_max)
    let mainMaxCal = 0, mainMaxProt = 0
    for (const f of mainFoods) {
      const maxQty = f.unidad_medida === 'unidad' ? (f.porcion_max || 10) : (f.porcion_max || 300)
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

    const systemPrompt = `Eres un asistente de nutrición. Tu única tarea es crear la rotación de 7 días de un plan de comidas.

Se te darán los alimentos disponibles por categoría y las cantidades ya calculadas. Tu trabajo es SOLO decidir qué combinación va en cada día, siguiendo estas reglas:

1. No repetir la misma combinación exacta de alimentos en días consecutivos
2. Rotar los desayunos — usar variedad entre los alimentos de desayuno_1 y desayuno_2 disponibles
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
      system: systemPrompt,
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Lucy tuvo un problema generando tu plan. Intenta de nuevo.' }, { status: 500 })
    }

    const plan: { dias: PlanDia[] } = JSON.parse(jsonMatch[0])

    // ═══ Detect first generation vs regeneration ═══
    // "Primera generación" = the system has NEVER done anything for this user yet
    // (no calendar rows AND no conversation rows of any kind)
    const { count: calendarioCount } = await supabase
      .from('calendario')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    const { count: convosCount } = await supabase
      .from('conversaciones')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    const esPrimeraGeneracion = ((calendarioCount ?? 0) === 0 && (convosCount ?? 0) === 0)
    console.log('[plan] esPrimeraGeneracion:', esPrimeraGeneracion, '(calendario:', calendarioCount, 'convos:', convosCount, ')')

    // ═══ Check for existing personalizations (independent of first/regen) ═══
    const { data: personalizaciones } = await supabase
      .from('calendario')
      .select('cantidad, unidad, dia, comida, alimento_id, alimento:alimentos(nombre, calorias_por_unidad, porcion_base, unidad_medida)')
      .eq('user_id', userId)
      .in('origen', ['chat', 'coach', 'sugerencia'])

    const tienePersonalizaciones = personalizaciones && personalizaciones.length > 0

    let extrasCal = 0
    const alimentosPersonalizados: string[] = []
    if (tienePersonalizaciones) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const seen = new Map<string, Set<number>>()
      for (const p of personalizaciones) {
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
      console.log(`[plan] Personalizaciones: ${personalizaciones.length} rows, ${alimentosPersonalizados.length} alimentos, +${Math.round(extrasCal)} kcal`)
    }

    // ═══ Clear only auto-generated data (preserve chat/coach personalizations) ═══
    await supabase.from('calendario').delete().eq('user_id', userId).eq('origen', 'generado')
    await supabase.from('lista_compras').delete().eq('user_id', userId)
    // DO NOT delete conversaciones — chat history is permanent

    // ═══ Messages: conditional on first generation vs regeneration ═══
    if (esPrimeraGeneracion) {
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
        introMessage = `Basado en tu peso, altura, edad y nivel de actividad, tu cuerpo quema aproximadamente ${tdee} calorías al día. Tu plan está diseñado con un déficit del 15% — ${calTarget} calorías — lo que te permite perder peso de forma sostenible sin sacrificar músculo ni energía. ¡Aquí está tu plan de la semana! 🌿`
      } else if (usuario.meta === 'ganar_masa') {
        introMessage = `Basado en tu perfil, tu cuerpo quema aproximadamente ${tdee} calorías al día. Tu plan incluye un superávit del 20% — ${calTarget} calorías — diseñado para construir músculo de forma limpia. ¡Aquí está tu plan! 💪`
      } else {
        introMessage = `Basado en tu perfil, tu cuerpo necesita aproximadamente ${tdee} calorías al día para mantenerse. Tu plan está calibrado exactamente en eso — ${calTarget} calorías — con la distribución correcta de proteína, carbohidratos y grasas para que te sientas con energía todo el día. ¡Aquí está tu plan! ✨`
      }

      await supabase.from('conversaciones').insert({
        user_id: userId, role: 'assistant', content: introMessage,
      })

      if (warnings.length > 0) {
        const mealsTxt = warnings.join(', ')
        const warningMsg = `Noté que algunos alimentos que escogiste son muy densos calóricamente. Para ${mealsTxt}, las porciones mínimas disponibles superan tu presupuesto calórico de esa comida. Considera cambiar algunos alimentos por opciones más ligeras (ej. menos aceites, frutos secos o quesos) para tener más flexibilidad. 💜`
        await supabase.from('conversaciones').insert({
          user_id: userId, role: 'assistant', content: warningMsg,
        })
      }
    }
    // Regeneration message is built AFTER post-generation analysis (see below)

    // ═══ PASO 4: Save calendar using backend-calculated quantities ═══
    // Build a lookup for calPerUnit by nombre (lowercase)
    const allFoodsLookup = new Map<string, AlimentoData>()
    for (const foods of Object.values(alimentosPorCategoria)) {
      for (const f of foods) allFoodsLookup.set(f.nombre.toLowerCase(), f)
    }

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

          // Use backend-calculated quantity, NOT Claude's
          const entry = cantidadMap.get(item.alimento.toLowerCase())
          const cantidad = entry?.cantidad ?? item.cantidad
          const unidad = entry?.unidad ?? item.unidad

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
      const { error: calErr } = await supabase.from('calendario').insert(calendarioRows)
      if (calErr) {
        return NextResponse.json({ error: 'Error guardando el calendario: ' + calErr.message }, { status: 500 })
      }
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

    // Post-generation analysis
    const { data: calWithFood } = await supabase
      .from('calendario')
      .select('dia, cantidad, alimento:alimentos(calorias_por_unidad, proteina_por_unidad, porcion_base, unidad_medida)')
      .eq('user_id', userId)

    let diasBajosProteina = 0
    if (calWithFood && calWithFood.length > 0) {
      const dailyTotals: Record<number, { cal: number; prot: number }> = {}
      for (const row of calWithFood) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a = (Array.isArray(row.alimento) ? (row.alimento as any)[0] : row.alimento) as any
        if (!a) continue
        const ratio = a.unidad_medida === 'unidad' ? row.cantidad : row.cantidad / (a.porcion_base || 100)
        if (!dailyTotals[row.dia]) dailyTotals[row.dia] = { cal: 0, prot: 0 }
        dailyTotals[row.dia].cal += a.calorias_por_unidad * ratio
        dailyTotals[row.dia].prot += (a.proteina_por_unidad || 0) * ratio
      }

      const days = Object.values(dailyTotals)
      const avgCal = days.reduce((s, d) => s + d.cal, 0) / (days.length || 1)
      const avgProt = days.reduce((s, d) => s + d.prot, 0) / (days.length || 1)
      diasBajosProteina = days.filter(d => d.prot < protTarget * 0.85).length
      console.log('[plan] Verificación post-generación — cal promedio:', Math.round(avgCal), 'prot promedio:', Math.round(avgProt), 'días bajos prot:', diasBajosProteina)
    }

    if (esPrimeraGeneracion) {
      // First generation — insert PASO 5 analysis message
      let lucyPostMsg: string
      if (diasBajosProteina >= 5) {
        lucyPostMsg = `¡Hola ${usuario.nombre}! Acabo de revisar tu plan y quiero contarte algo importante 💜 Veo que en la mayoría de los días te va a faltar proteína para llegar a tu meta. Esto no significa que el plan esté mal — significa que los alimentos que escogiste no alcanzan para cubrir tus ${protTarget}g de proteína diaria. Te recomiendo añadir una fuente de proteína a tu desayuno: Yogur Griego, Clara de Huevo o Proteína en Polvo funcionan perfecto. ¿Quieres que ajustemos el plan juntas?`
      } else if (diasBajosProteina >= 2) {
        lucyPostMsg = `¡Hola ${usuario.nombre}! Ya tengo tu plan listo 🎉 Solo quiero avisarte que ${diasBajosProteina} días de tu semana van a quedar un poco bajos en proteína — específicamente los días con tu Desayuno 2. Nada que no se pueda resolver: puedes pedirme que te sugiera un snack proteico para esos días o ajustamos las porciones. Estoy aquí cuando me necesites 💜`
      } else {
        lucyPostMsg = `¡Hola ${usuario.nombre}! Tu plan de la semana está listo y se ve muy bien 🎉 Tus calorías y proteína están alineadas con tu meta. Recuerda que puedes pedirme cualquier cambio — swap de alimentos, recetas, snacks — cuando quieras. ¡Vamos con todo esta semana! 💜`
      }
      await supabase.from('conversaciones').insert({
        user_id: userId, role: 'assistant', content: lucyPostMsg, leido: false,
      })
    } else {
      // Regeneration — single fused message
      let regenMsg = 'Tu plan se regeneró con tus nuevos macros.'

      // Add personalization mention if any
      if (tienePersonalizaciones) {
        const extrasKcalRound = Math.round(extrasCal / 7)
        const listaAlimentos = alimentosPersonalizados.join(', ')
        regenMsg += ` Mantuve las personalizaciones que habías pedido: ${listaAlimentos}.\n\nCon esos extras estás aproximadamente ${extrasKcalRound} kcal por encima de tu target diario. ¿Quieres que ajuste las cantidades del plan para compensar, o prefieres mantenerlo así?`
      }

      // Fuse protein warning if needed
      if (diasBajosProteina >= 5) {
        regenMsg += `\n\nImportante: la mayoría de los días te va a faltar proteína con los alimentos que escogiste. ¿Quieres que te sugiera snacks proteicos para completar? Es importante que lo ajustemos juntas. 💜`
      } else if (diasBajosProteina >= 2) {
        regenMsg += `\n\nAdemás, noté que ${diasBajosProteina} días te van a quedar un poco bajos en proteína. ¿Quieres que añada un snack proteico esos días, o ajustamos las cantidades? 💜`
      } else {
        regenMsg += ' 💜'
      }

      await supabase.from('conversaciones').insert({
        user_id: userId, role: 'assistant', content: regenMsg, leido: false,
      })
    }

    return NextResponse.json({ success: true, dias: plan.dias.length, items: calendarioRows.length })
  } catch (err) {
    console.error('generar-plan error:', err)
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
