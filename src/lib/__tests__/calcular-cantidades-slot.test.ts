import { describe, it, expect } from 'vitest'
import { calcularCantidadesParaSlot, type AlimentoSlot, type SlotBudget, type SlotShares } from '../calcular-cantidades-slot'

// ═══ Real catalog values from Supabase (29 abr 2026) ═══
const FOODS: Record<string, AlimentoSlot> = {
  pechuga: { alimento_id: 'pechuga', nombre: 'Pechuga de Pollo', categoria: 'proteina', calorias_por_unidad: 165, proteina_por_unidad: 31, porcion_base: 150, porcion_min: 120, porcion_max: 200, unidad_medida: 'gramos' },
  salmon: { alimento_id: 'salmon', nombre: 'Salmon', categoria: 'proteina', calorias_por_unidad: 208, proteina_por_unidad: 25, porcion_base: 100, porcion_min: 80, porcion_max: 200, unidad_medida: 'gramos' },
  mahi: { alimento_id: 'mahi', nombre: 'Mahi Mahi', categoria: 'proteina', calorias_por_unidad: 109, proteina_por_unidad: 24, porcion_base: 150, porcion_min: 120, porcion_max: 200, unidad_medida: 'gramos' },
  pavo: { alimento_id: 'pavo', nombre: 'Pavo Molido 97%', categoria: 'proteina', calorias_por_unidad: 148, proteina_por_unidad: 29, porcion_base: 150, porcion_min: 120, porcion_max: 200, unidad_medida: 'gramos' },
  chuleta: { alimento_id: 'chuleta', nombre: 'Chuleta de Cerdo', categoria: 'proteina', calorias_por_unidad: 172, proteina_por_unidad: 26, porcion_base: 150, porcion_min: 120, porcion_max: 200, unidad_medida: 'gramos' },
  tilapia: { alimento_id: 'tilapia', nombre: 'Tilapia', categoria: 'proteina', calorias_por_unidad: 128, proteina_por_unidad: 26, porcion_base: 150, porcion_min: 120, porcion_max: 200, unidad_medida: 'gramos' },
  arrozInt: { alimento_id: 'arrozInt', nombre: 'Arroz Integral', categoria: 'carbohidrato', calorias_por_unidad: 111, proteina_por_unidad: 2.6, porcion_base: 100, porcion_min: 50, porcion_max: 250, unidad_medida: 'gramos' },
  avena: { alimento_id: 'avena', nombre: 'Avena', categoria: 'carbohidrato', calorias_por_unidad: 150, proteina_por_unidad: 5, porcion_base: 40, porcion_min: 30, porcion_max: 100, unidad_medida: 'gramos' },
  batata: { alimento_id: 'batata', nombre: 'Batata', categoria: 'carbohidrato', calorias_por_unidad: 86, proteina_por_unidad: 1.6, porcion_base: 100, porcion_min: 100, porcion_max: 300, unidad_medida: 'gramos' },
  brocoli: { alimento_id: 'brocoli', nombre: 'Brocoli', categoria: 'fibra', calorias_por_unidad: 35, proteina_por_unidad: 2.8, porcion_base: 100, porcion_min: 50, porcion_max: 200, unidad_medida: 'gramos' },
  espinaca: { alimento_id: 'espinaca', nombre: 'Espinaca', categoria: 'fibra', calorias_por_unidad: 23, proteina_por_unidad: 2.9, porcion_base: 100, porcion_min: 30, porcion_max: 150, unidad_medida: 'gramos' },
  aguacate: { alimento_id: 'aguacate', nombre: 'Aguacate', categoria: 'grasa', calorias_por_unidad: 160, proteina_por_unidad: 2, porcion_base: 100, porcion_min: 30, porcion_max: 100, unidad_medida: 'gramos' },
  aceite: { alimento_id: 'aceite', nombre: 'Aceite de oliva', categoria: 'grasa', calorias_por_unidad: 884, proteina_por_unidad: 0, porcion_base: 100, porcion_min: 5, porcion_max: 20, unidad_medida: 'gramos' },
}

const MAIN_SHARES: SlotShares = { proteina: 0.40, carbohidrato: 0.35, fibra: 0.10, grasa: 0.15 }

// Target 1960 kcal
const ALMUERZO_BUDGET: SlotBudget = { kcal: 1960 * 0.40, prot: 147 * 0.35 } // 784 kcal, 51.45g prot
const CENA_BUDGET: SlotBudget = { kcal: 1960 * 0.30, prot: 147 * 0.35 } // 588 kcal, 51.45g prot

const stdSlot = (protein: AlimentoSlot) => [protein, FOODS.arrozInt, FOODS.brocoli, FOODS.aguacate]

describe('calcularCantidadesParaSlot', () => {
  // Test 1 — Dense protein in almuerzo
  it('proteína densa en almuerzo entrega cantidad razonable', () => {
    const r = calcularCantidadesParaSlot(stdSlot(FOODS.pechuga), ALMUERZO_BUDGET, MAIN_SHARES)
    const pechuga = r.cantidades.find(c => c.alimento_id === 'pechuga')!
    expect(pechuga.cantidad).toBeGreaterThanOrEqual(FOODS.pechuga.porcion_min)
    expect(pechuga.cantidad).toBeLessThanOrEqual(FOODS.pechuga.porcion_max)
    // Per-slot ±10% tolerance (product tolerance — ±5% is per-day across all meals)
    expect(r.kcal_total_slot).toBeGreaterThanOrEqual(ALMUERZO_BUDGET.kcal * 0.90)
    expect(r.kcal_total_slot).toBeLessThanOrEqual(ALMUERZO_BUDGET.kcal * 1.10)
    // May have compensation warning if protein hit porcion_max
    // (Pechuga at max=200 gives 220 kcal, budget expects 313 → compensation needed)
  })

  // Test 2 — Same protein in cena delivers LESS than almuerzo
  it('misma proteína en cena entrega MENOS cantidad que en almuerzo', () => {
    const rAlm = calcularCantidadesParaSlot(stdSlot(FOODS.pechuga), ALMUERZO_BUDGET, MAIN_SHARES)
    const rCena = calcularCantidadesParaSlot(stdSlot(FOODS.pechuga), CENA_BUDGET, MAIN_SHARES)
    const pAlm = rAlm.cantidades.find(c => c.alimento_id === 'pechuga')!
    const pCena = rCena.cantidades.find(c => c.alimento_id === 'pechuga')!
    // Cena budget (30%) is smaller than almuerzo (40%), so cena pechuga should be <= almuerzo
    // Both may hit porcion_max if budget is large enough
    expect(pCena.cantidad).toBeLessThanOrEqual(pAlm.cantidad)
    expect(rCena.kcal_total_slot).toBeGreaterThanOrEqual(CENA_BUDGET.kcal * 0.90)
    expect(rCena.kcal_total_slot).toBeLessThanOrEqual(CENA_BUDGET.kcal * 1.10)
  })

  // Test 3 — Lean protein activates compensation
  it('proteína magra en almuerzo activa compensación', () => {
    const rDense = calcularCantidadesParaSlot(stdSlot(FOODS.pechuga), ALMUERZO_BUDGET, MAIN_SHARES)
    const rLean = calcularCantidadesParaSlot(stdSlot(FOODS.mahi), ALMUERZO_BUDGET, MAIN_SHARES)
    const mahiQty = rLean.cantidades.find(c => c.alimento_id === 'mahi')!
    expect(mahiQty.cantidad).toBe(FOODS.mahi.porcion_max) // maxed out
    // Compensation: arroz or aguacate should be higher than in dense case
    const arrozLean = rLean.cantidades.find(c => c.alimento_id === 'arrozInt')!.cantidad
    const arrozDense = rDense.cantidades.find(c => c.alimento_id === 'arrozInt')!.cantidad
    expect(arrozLean).toBeGreaterThanOrEqual(arrozDense) // compensated up
    // Mahi Mahi at max=200 gives only 145 kcal (budget expects 313 for protein)
    // Compensation can only partially close the gap — structural limitation
    // Total kcal may be <90% of budget — check for warning instead
    expect(rLean.warnings.length).toBeGreaterThan(0)
  })

  // Test 4 — Structurally impossible pool
  it('pool estructuralmente imposible retorna warning', () => {
    // All lean proteins + low-max carb
    const tinyCarb: AlimentoSlot = { ...FOODS.avena, porcion_max: 40 } // very limited
    const r = calcularCantidadesParaSlot(
      [FOODS.mahi, tinyCarb, FOODS.espinaca, FOODS.aceite],
      ALMUERZO_BUDGET,
      MAIN_SHARES,
    )
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(r.warnings.some(w => w.includes('insuficiente'))).toBe(true)
    expect(r.deficit_kcal).toBeGreaterThan(0)
  })

  // Test 5 — Single food per category gets full share
  it('único alimento por categoría recibe todo el share', () => {
    const r = calcularCantidadesParaSlot(stdSlot(FOODS.pechuga), ALMUERZO_BUDGET, MAIN_SHARES)
    for (const c of r.cantidades) {
      const food = stdSlot(FOODS.pechuga).find(f => f.alimento_id === c.alimento_id)!
      const expectedShare = MAIN_SHARES[food.categoria] ?? 0.25
      const expectedKcal = ALMUERZO_BUDGET.kcal * expectedShare
      // Within ±40% of share (loose because of porcion_max clamping + compensation redistribution)
      // Compensation can push non-protein categories above their share when protein is capped
      expect(c.kcal_aportadas).toBeGreaterThanOrEqual(expectedKcal * 0.6)
      expect(c.kcal_aportadas).toBeLessThanOrEqual(expectedKcal * 1.4)
    }
  })

  // Test 6 — Multiple foods same category distributed proportionally
  it('múltiples alimentos misma categoría se distribuyen proporcionalmente', () => {
    const slot = [FOODS.pechuga, FOODS.arrozInt, FOODS.avena, FOODS.batata, FOODS.brocoli, FOODS.aguacate]
    const r = calcularCantidadesParaSlot(slot, ALMUERZO_BUDGET, MAIN_SHARES)
    const carbKcal = r.cantidades
      .filter(c => ['arrozInt', 'avena', 'batata'].includes(c.alimento_id))
      .reduce((s, c) => s + c.kcal_aportadas, 0)
    const expectedCarbKcal = ALMUERZO_BUDGET.kcal * 0.35
    // With compensation active, carbs may absorb protein deficit → can be higher than 35% share
    expect(carbKcal).toBeGreaterThanOrEqual(expectedCarbKcal * 0.7)
    expect(carbKcal).toBeLessThanOrEqual(expectedCarbKcal * 1.5)
    // None exceeds max
    for (const c of r.cantidades) {
      const food = slot.find(f => f.alimento_id === c.alimento_id)!
      expect(c.cantidad).toBeLessThanOrEqual(food.porcion_max)
    }
  })

  // Test 7 — Food with high porcion_min vs small slot
  it('alimento con porcion_min alto vs slot pequeño', () => {
    const smallBudget: SlotBudget = { kcal: 400, prot: 30 }
    // Batata min=100 → 86 kcal, that's 21.5% of a 400 kcal budget (share=35% = 140 kcal target)
    const r = calcularCantidadesParaSlot(
      [FOODS.pechuga, FOODS.batata, FOODS.brocoli, FOODS.aceite],
      smallBudget,
      MAIN_SHARES,
    )
    const batataR = r.cantidades.find(c => c.alimento_id === 'batata')!
    expect(batataR.cantidad).toBeGreaterThanOrEqual(FOODS.batata.porcion_min) // respects min
  })

  // Test 8 — Different budgets scale quantities proportionally
  it('regeneración: cambiar target escala cantidades proporcionalmente', () => {
    const budget1: SlotBudget = { kcal: 784, prot: 51.45 }
    const budget2: SlotBudget = { kcal: 880, prot: 57.75 } // ~12% more
    const r1 = calcularCantidadesParaSlot(stdSlot(FOODS.pechuga), budget1, MAIN_SHARES)
    const r2 = calcularCantidadesParaSlot(stdSlot(FOODS.pechuga), budget2, MAIN_SHARES)
    // Total kcal should scale up (higher budget → higher total)
    // May not be perfectly proportional due to porcion_max clamping
    expect(r2.kcal_total_slot).toBeGreaterThanOrEqual(r1.kcal_total_slot)
  })

  // Test 9 — porcion_max clamp active
  it('edge case: porcion_max < cantidad calculada', () => {
    // Give huge budget to force protein past max
    const hugeBudget: SlotBudget = { kcal: 2000, prot: 150 }
    const r = calcularCantidadesParaSlot(stdSlot(FOODS.pechuga), hugeBudget, MAIN_SHARES)
    const pechuga = r.cantidades.find(c => c.alimento_id === 'pechuga')!
    expect(pechuga.cantidad).toBe(FOODS.pechuga.porcion_max) // clamped
    expect(r.deficit_kcal).toBeGreaterThan(0) // can't reach 2000 kcal with these foods
  })

  // Test 10 — Function is pure (no side effects)
  it('función es pura (sin side effects)', () => {
    const slot = stdSlot(FOODS.pechuga)
    const inputCopy = JSON.parse(JSON.stringify(slot))
    const r1 = calcularCantidadesParaSlot(slot, ALMUERZO_BUDGET, MAIN_SHARES)
    const r2 = calcularCantidadesParaSlot(slot, ALMUERZO_BUDGET, MAIN_SHARES)
    // Outputs identical
    expect(r1.kcal_total_slot).toBe(r2.kcal_total_slot)
    expect(r1.prot_total_slot).toBe(r2.prot_total_slot)
    for (let i = 0; i < r1.cantidades.length; i++) {
      expect(r1.cantidades[i].cantidad).toBe(r2.cantidades[i].cantidad)
    }
    // Inputs not mutated
    expect(JSON.stringify(slot)).toBe(JSON.stringify(inputCopy))
  })
})
