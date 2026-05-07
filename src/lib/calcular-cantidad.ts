// src/lib/calcular-cantidad.ts
// Bug #32 + #34: Centralized quantity calculation for chat tools.
// Uses CAT_SHARE (same as generar-plan) to distribute meal budget by category.
// Clamps to [porcion_min, porcion_max] of the specific food.

export const MEAL_PCT: Record<string, number> = {
  desayuno: 0.30,
  almuerzo: 0.40,
  cena: 0.30,
}

// Shares by alimentos.categoria_comida (NOT preferencias.categoria_comida)
export const CAT_SHARE: Record<string, number> = {
  proteina: 0.40,
  carbohidrato: 0.35,
  grasa: 0.15,
  vegetal: 0.10,
  otro: 0.10,
}

export interface FoodForCalc {
  calorias_por_unidad: number
  proteina_por_unidad: number
  porcion_base: number
  porcion_min: number
  porcion_max: number
  unidad_medida: string
  categoria_comida: string
}

/**
 * Calculate quantity for a new food being added to a meal, respecting:
 * - Category share of the meal budget
 * - Existing items of the same category already in that meal
 * - porcion_min / porcion_max of the food
 *
 * @param food - The food being added
 * @param comida - 'desayuno' | 'almuerzo' | 'cena'
 * @param calTarget - User's calorias_objetivo
 * @param existingCatCal - Total kcal already in this meal for the SAME category
 * @returns { cantidad, cabe }
 */
export function calcularCantidadParaAlimento(
  food: FoodForCalc,
  comida: string,
  calTarget: number,
  existingCatCal: number,
): { cantidad: number; cabe: boolean } {
  const mealPct = MEAL_PCT[comida] || 0.33
  const mealBudget = calTarget * mealPct
  const catShare = CAT_SHARE[food.categoria_comida] || 0.25
  const catBudget = mealBudget * catShare
  const remainingBudget = Math.max(0, catBudget - existingCatCal)

  return calcFromBudget(food, remainingBudget)
}

/**
 * Calculate quantity for a snack. Snack budget = calTarget - allMealsCal,
 * then divided by number of snack foods being added.
 */
export function calcularCantidadParaSnack(
  food: FoodForCalc,
  snackBudgetPerFood: number,
): { cantidad: number; cabe: boolean } {
  return calcFromBudget(food, snackBudgetPerFood)
}

/**
 * Calculate iso-caloric swap quantity (same category swap).
 * New food gets the same kcal as the old food had.
 * Clamps to [porcion_min, porcion_max].
 */
export function calcularCantidadIsoCalorica(
  foodNuevo: FoodForCalc,
  oldCalories: number,
): { cantidad: number; cabe: boolean } {
  return calcFromBudget(foodNuevo, oldCalories)
}

/**
 * Core calculation: given a kcal budget, compute quantity and clamp.
 */
function calcFromBudget(
  food: FoodForCalc,
  budgetKcal: number,
): { cantidad: number; cabe: boolean } {
  const cpu = food.unidad_medida === 'unidad'
    ? food.calorias_por_unidad
    : food.calorias_por_unidad / (food.porcion_base || 100)

  if (cpu <= 0) return { cantidad: getMin(food), cabe: true }

  let qty: number
  if (food.unidad_medida === 'unidad') {
    qty = Math.max(1, Math.round(budgetKcal / cpu))
  } else {
    qty = Math.round(budgetKcal / cpu)
  }

  // Clamp to [porcion_min, porcion_max]
  const min = getMin(food)
  const max = getMax(food)
  qty = Math.max(min, Math.min(max, qty))

  // "No cabe" if budget is too small for porcion_min (no implicit override)
  const minCal = cpu * min
  const cabe = budgetKcal >= minCal

  return { cantidad: qty, cabe }
}

function getMin(food: FoodForCalc): number {
  if (food.porcion_min && food.porcion_min > 0) return food.porcion_min
  return food.unidad_medida === 'unidad' ? 1 : 10
}

function getMax(food: FoodForCalc): number {
  if (food.porcion_max && food.porcion_max > 0) return food.porcion_max
  return food.unidad_medida === 'unidad' ? 10 : 500
}
