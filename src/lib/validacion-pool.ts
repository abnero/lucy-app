// Validación server-side de mínimos/máximos del pool de alimentos del wizard.
// Capa B — complementa la validación UI (Capa A) con enforcement en el servidor.

export interface PoolError {
  categoria: string;
  actual: number;
  minimo: number;
  maximo: number;
  tipo: 'insuficiente' | 'exceso';
}

export interface ValidacionResult {
  valid: boolean;
  errores: PoolError[];
  errorMessage: string;
}

const REGLAS: Record<string, { min: number; max: number; opcional: boolean; label: string }> = {
  desayuno_1:   { min: 3, max: 4, opcional: false, label: 'desayuno 1' },
  desayuno_2:   { min: 0, max: 4, opcional: true,  label: 'desayuno 2' },
  proteina:     { min: 3, max: 7, opcional: false, label: 'proteína' },
  carbohidrato: { min: 1, max: 5, opcional: false, label: 'carbohidrato' },
  fibra:        { min: 3, max: 5, opcional: false, label: 'fibra' },
  grasa:        { min: 3, max: 5, opcional: false, label: 'grasa' },
}

export function validarPoolMinimos(preferencias: { categoria_comida: string }[]): ValidacionResult {
  const counts: Record<string, number> = {}
  for (const p of preferencias) {
    counts[p.categoria_comida] = (counts[p.categoria_comida] || 0) + 1
  }

  const errores: PoolError[] = []

  for (const [cat, regla] of Object.entries(REGLAS)) {
    const actual = counts[cat] || 0
    if (!regla.opcional && actual < regla.min) {
      errores.push({ categoria: cat, actual, minimo: regla.min, maximo: regla.max, tipo: 'insuficiente' })
    }
    if (actual > regla.max) {
      errores.push({ categoria: cat, actual, minimo: regla.min, maximo: regla.max, tipo: 'exceso' })
    }
  }

  if (errores.length === 0) {
    return { valid: true, errores: [], errorMessage: '' }
  }

  // Build human-readable message (Mod 1: different prefix per composition)
  const insuf = errores.filter(e => e.tipo === 'insuficiente')
  const excess = errores.filter(e => e.tipo === 'exceso')

  const parts: string[] = []
  for (const e of insuf) {
    const label = REGLAS[e.categoria]?.label || e.categoria
    parts.push(`tienes ${e.actual} alimentos en ${label} (mínimo ${e.minimo})`)
  }
  for (const e of excess) {
    const label = REGLAS[e.categoria]?.label || e.categoria
    parts.push(`exceso de ${e.actual - e.maximo} en ${label} (máximo ${e.maximo})`)
  }

  let prefix: string
  if (insuf.length > 0 && excess.length > 0) {
    prefix = 'Pool fuera de rango'
  } else if (excess.length > 0) {
    prefix = 'Pool excedido'
  } else {
    prefix = 'Pool insuficiente'
  }

  const errorMessage = `${prefix}: ${parts.join(', ')}.`

  return { valid: false, errores, errorMessage }
}
