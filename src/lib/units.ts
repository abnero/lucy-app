interface Alimento {
  unidad_medida?: string
  unidad_display?: string | null
  factor_conversion?: number | null
}

// Convert decimal to nearest simple fraction (¼, ½, ¾, 1, 1¼, ...)
function toFraction(value: number): string {
  if (value < 0.125) return '⅛'
  const whole = Math.floor(value)
  const frac = value - whole

  let fracStr = ''
  if (frac < 0.125) fracStr = ''
  else if (frac < 0.375) fracStr = '¼'
  else if (frac < 0.625) fracStr = '½'
  else if (frac < 0.875) fracStr = '¾'
  else { return `${whole + 1}` }

  if (whole === 0) return fracStr || '0'
  return fracStr ? `${whole}${fracStr}` : `${whole}`
}

export function toImperial(cantidad: number, alimento: Alimento): string {
  const display = alimento.unidad_display
  const factor = alimento.factor_conversion
  const baseUnit = alimento.unidad_medida || 'gramos'

  // For countable items, just show the count
  if (baseUnit === 'unidad') {
    const n = Math.round(cantidad)
    return `${n} ${n === 1 ? 'unidad' : 'unidades'}`
  }

  // No conversion data → fall back to grams/ml
  if (!display || !factor || factor <= 0) {
    return `${Math.round(cantidad)} ${baseUnit === 'ml' ? 'ml' : 'g'}`
  }

  const displayValue = cantidad / factor
  const gramSuffix = baseUnit === 'ml' ? ` (${Math.round(cantidad)}ml)` : ` (${Math.round(cantidad)}g)`

  switch (display) {
    case 'oz': {
      const rounded = Math.round(displayValue * 10) / 10
      return `${rounded} oz${gramSuffix}`
    }
    case 'fl_oz': {
      const rounded = Math.round(displayValue * 10) / 10
      return `${rounded} fl oz${gramSuffix}`
    }
    case 'cup': {
      return `${toFraction(displayValue)} ${displayValue > 1 ? 'tazas' : 'taza'}${gramSuffix}`
    }
    case 'tbsp': {
      const rounded = Math.max(1, Math.round(displayValue))
      return `${rounded} ${rounded === 1 ? 'cda' : 'cdas'}${gramSuffix}`
    }
    case 'scoop': {
      const rounded = Math.max(1, Math.round(displayValue))
      return `${rounded} scoop${gramSuffix}`
    }
    case 'tajada': {
      const n = Math.max(1, Math.round(displayValue))
      return `${n} ${n === 1 ? 'tajada' : 'tajadas'}${gramSuffix}`
    }
    case 'unidad': {
      const n = Math.round(displayValue)
      return `${n} ${n === 1 ? 'unidad' : 'unidades'}`
    }
    default:
      return `${Math.round(cantidad)} ${baseUnit === 'ml' ? 'ml' : 'g'}`
  }
}
