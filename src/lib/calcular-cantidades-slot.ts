// src/lib/calcular-cantidades-slot.ts
// Pure function: calculates quantities for ALL foods in a single meal slot.
// Replaces the old Paso 1c (global factor) and Paso 1d (protein enforcement)
// with a per-slot calculation that knows the exact budget.

export interface AlimentoSlot {
  alimento_id: string
  nombre: string
  categoria: string // 'proteina' | 'carbohidrato' | 'fibra' | 'grasa' | 'desayuno_1' | 'desayuno_2'
  calorias_por_unidad: number
  proteina_por_unidad: number
  porcion_base: number
  porcion_min: number
  porcion_max: number
  unidad_medida: string
}

export interface SlotBudget {
  kcal: number
  prot: number
}

export interface SlotShares {
  [categoria: string]: number // e.g. { proteina: 0.40, carbohidrato: 0.35, fibra: 0.10, grasa: 0.15 }
}

export interface CantidadResult {
  alimento_id: string
  nombre: string
  cantidad: number
  unidad: string
  kcal_aportadas: number
  prot_aportadas: number
}

export interface SlotResult {
  cantidades: CantidadResult[]
  kcal_total_slot: number
  prot_total_slot: number
  deficit_kcal: number
  warnings: string[]
}

function cpuOf(a: AlimentoSlot): number {
  return a.unidad_medida === 'unidad'
    ? a.calorias_por_unidad
    : a.calorias_por_unidad / (a.porcion_base || 100)
}

function ppuOf(a: AlimentoSlot): number {
  return a.unidad_medida === 'unidad'
    ? a.proteina_por_unidad
    : a.proteina_por_unidad / (a.porcion_base || 100)
}

function clamp(qty: number, min: number, max: number, unidad: string): number {
  if (unidad === 'unidad') {
    return Math.max(min, Math.min(max, Math.round(qty)))
  }
  return Math.max(min, Math.min(max, Math.round(qty)))
}

function calcKcal(a: AlimentoSlot, qty: number): number {
  return cpuOf(a) * qty
}

function calcProt(a: AlimentoSlot, qty: number): number {
  return ppuOf(a) * qty
}

export function calcularCantidadesParaSlot(
  alimentosDelSlot: AlimentoSlot[],
  slotBudget: SlotBudget,
  slotShares: SlotShares,
): SlotResult {
  if (alimentosDelSlot.length === 0) {
    return { cantidades: [], kcal_total_slot: 0, prot_total_slot: 0, deficit_kcal: slotBudget.kcal, warnings: [] }
  }

  const warnings: string[] = []
  const cantidades = new Map<string, number>() // alimento_id → cantidad

  // ═══ PASO 1 — Initial calculation by category share ═══
  // Group foods by category
  const byCategory = new Map<string, AlimentoSlot[]>()
  for (const a of alimentosDelSlot) {
    if (!byCategory.has(a.categoria)) byCategory.set(a.categoria, [])
    byCategory.get(a.categoria)!.push(a)
  }

  for (const [cat, foods] of Array.from(byCategory.entries())) {
    const share = slotShares[cat] ?? (1 / byCategory.size) // fallback: equal share
    const catBudgetKcal = slotBudget.kcal * share

    if (foods.length === 1) {
      // Single food gets full category budget
      const f = foods[0]
      const cpu = cpuOf(f)
      if (cpu <= 0) {
        cantidades.set(f.alimento_id, f.porcion_min || 1)
        continue
      }
      const idealQty = catBudgetKcal / cpu
      cantidades.set(f.alimento_id, clamp(idealQty, f.porcion_min, f.porcion_max, f.unidad_medida))
    } else {
      // Multiple foods: distribute proportionally by caloric density
      const totalDensity = foods.reduce((s: number, f: AlimentoSlot) => s + cpuOf(f), 0)
      for (const f of foods) {
        const cpu = cpuOf(f)
        if (cpu <= 0 || totalDensity <= 0) {
          cantidades.set(f.alimento_id, f.porcion_min || 1)
          continue
        }
        const foodBudget = catBudgetKcal * (cpu / totalDensity)
        const idealQty = foodBudget / cpu
        cantidades.set(f.alimento_id, clamp(idealQty, f.porcion_min, f.porcion_max, f.unidad_medida))
      }
    }
  }

  // ═══ PASO 2 — Detect deficit ═══
  let kcalTotal = 0
  for (const a of alimentosDelSlot) {
    kcalTotal += calcKcal(a, cantidades.get(a.alimento_id) ?? 0)
  }

  const deficit = slotBudget.kcal - kcalTotal
  if (deficit <= slotBudget.kcal * 0.05) {
    // Calories within 5% — skip calorie compensation but still check protein (Paso 4 below)
  } else {

  // ═══ PASO 3 — Cross-category compensation ═══
  // Find foods with room to grow (current < porcion_max)
  const growable = alimentosDelSlot.filter(a => {
    const current = cantidades.get(a.alimento_id) ?? 0
    return current < a.porcion_max && cpuOf(a) > 0
  })

  if (growable.length === 0) {
    warnings.push('pool estructuralmente insuficiente: todos los alimentos al máximo')
    return buildResult(alimentosDelSlot, cantidades, slotBudget, warnings)
  }

  // Distribute deficit proportionally by available capacity (kcal headroom)
  let remainingDeficit = deficit
  // Sort by kcal headroom descending (foods with most room to contribute first)
  const sortedGrowable = growable
    .map(a => {
      const current = cantidades.get(a.alimento_id) ?? 0
      const headroom = (a.porcion_max - current) * cpuOf(a)
      return { alimento: a, headroom }
    })
    .sort((a, b) => b.headroom - a.headroom)

  const totalHeadroom = sortedGrowable.reduce((s, g) => s + g.headroom, 0)

  for (const { alimento, headroom } of sortedGrowable) {
    if (remainingDeficit <= 0) break

    const share = totalHeadroom > 0 ? headroom / totalHeadroom : 1 / sortedGrowable.length
    const extraKcal = Math.min(remainingDeficit * share, headroom)
    const cpu = cpuOf(alimento)
    const extraQty = cpu > 0 ? extraKcal / cpu : 0

    const current = cantidades.get(alimento.alimento_id) ?? 0
    const newQty = clamp(current + extraQty, alimento.porcion_min, alimento.porcion_max, alimento.unidad_medida)
    const actualExtraKcal = calcKcal(alimento, newQty) - calcKcal(alimento, current)

    cantidades.set(alimento.alimento_id, newQty)
    remainingDeficit -= actualExtraKcal
  }

  // Check if compensation was sufficient
  kcalTotal = 0
  for (const a of alimentosDelSlot) {
    kcalTotal += calcKcal(a, cantidades.get(a.alimento_id) ?? 0)
  }

  const finalDeficit = slotBudget.kcal - kcalTotal
  if (finalDeficit > slotBudget.kcal * 0.10) {
    warnings.push(`pool estructuralmente insuficiente: deficit residual ${Math.round(finalDeficit)} kcal`)
  } else if (remainingDeficit > 0) {
    warnings.push(`proteína magra requirió compensación cross-category`)
  }
  } // end else (calorie compensation path)

  // ═══ PASO 4 — Protein enforcement (runs ALWAYS, not just after compensation) ═══
  // After calorie compensation, check if protein is still under budget.
  // If so, increase protein-category foods toward porcion_max and compensate
  // by reducing non-protein foods if needed.
  let protTotal = 0
  for (const a of alimentosDelSlot) {
    protTotal += calcProt(a, cantidades.get(a.alimento_id) ?? 0)
  }

  const protThreshold = Math.max(slotBudget.prot - 3, slotBudget.prot * 0.95) // act when deficit > 3g per slot
  if (protTotal < protThreshold) {
    const proteinFoods = alimentosDelSlot
      .filter(a => a.categoria === 'proteina' || ppuOf(a) > 0.10) // protein-rich
      .filter(a => (cantidades.get(a.alimento_id) ?? 0) < a.porcion_max)

    let protDeficit = slotBudget.prot - protTotal
    for (const pf of proteinFoods) {
      if (protDeficit <= 0) break
      const current = cantidades.get(pf.alimento_id) ?? 0
      const ppu = ppuOf(pf)
      if (ppu <= 0) continue
      const extraQty = protDeficit / ppu
      const newQty = clamp(current + extraQty, pf.porcion_min, pf.porcion_max, pf.unidad_medida)
      const actualExtraProt = calcProt(pf, newQty) - calcProt(pf, current)
      const actualExtraKcal = calcKcal(pf, newQty) - calcKcal(pf, current)

      cantidades.set(pf.alimento_id, newQty)
      protDeficit -= actualExtraProt

      // If adding protein pushed kcal over budget, compensate by reducing non-protein foods
      kcalTotal = 0
      for (const a of alimentosDelSlot) {
        kcalTotal += calcKcal(a, cantidades.get(a.alimento_id) ?? 0)
      }
      if (kcalTotal > slotBudget.kcal * 1.05 && actualExtraKcal > 0) {
        const nonProtein = alimentosDelSlot
          .filter(a => a.categoria !== 'proteina' && ppuOf(a) < 0.05)
          .filter(a => (cantidades.get(a.alimento_id) ?? 0) > a.porcion_min)
          .sort((a, b) => cpuOf(b) - cpuOf(a)) // reduce highest density first

        let calToReduce = kcalTotal - slotBudget.kcal
        for (const np of nonProtein) {
          if (calToReduce <= 0) break
          const npCurrent = cantidades.get(np.alimento_id) ?? 0
          const npCpu = cpuOf(np)
          if (npCpu <= 0) continue
          const reduceQty = Math.min(npCurrent - np.porcion_min, calToReduce / npCpu)
          const newNpQty = clamp(npCurrent - reduceQty, np.porcion_min, np.porcion_max, np.unidad_medida)
          calToReduce -= calcKcal(np, npCurrent) - calcKcal(np, newNpQty)
          cantidades.set(np.alimento_id, newNpQty)
        }
      }
    }
  }

  return buildResult(alimentosDelSlot, cantidades, slotBudget, warnings)
}

function buildResult(
  alimentos: AlimentoSlot[],
  cantidades: Map<string, number>,
  slotBudget: SlotBudget,
  warnings: string[],
): SlotResult {
  const result: CantidadResult[] = []
  let kcalTotal = 0
  let protTotal = 0

  for (const a of alimentos) {
    const qty = cantidades.get(a.alimento_id) ?? 0
    const kcal = calcKcal(a, qty)
    const prot = calcProt(a, qty)
    kcalTotal += kcal
    protTotal += prot
    result.push({
      alimento_id: a.alimento_id,
      nombre: a.nombre,
      cantidad: qty,
      unidad: a.unidad_medida,
      kcal_aportadas: Math.round(kcal),
      prot_aportadas: Math.round(prot * 10) / 10,
    })
  }

  return {
    cantidades: result,
    kcal_total_slot: Math.round(kcalTotal),
    prot_total_slot: Math.round(protTotal * 10) / 10,
    deficit_kcal: Math.max(0, Math.round(slotBudget.kcal - kcalTotal)),
    warnings,
  }
}
