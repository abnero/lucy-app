// E2E test for Bug #33 — verify greeting logic uses correct criteria
// Run with: npx tsx e2e-bug33.mts

const mod = await import('./src/lib/analisis-calorico.ts')
const analizarCalendario = mod.analizarCalendario

// ═══ TEST 1: All days aligned (dummy account day 7 pattern) ═══
// 7 days all within ±10% cal and ±10g prot
console.log('═══ TEST 1 — All days aligned ═══')
// Calibrated to give ~1950 kcal, ~148g prot per day
const aligned = Array.from({ length: 7 }, (_, i) => ([
  { alimento_id: 'p', nombre: 'Pollo', cantidad: 200, unidad_medida: 'gramos' as const, porcion_base: 150, porcion_min: 120, porcion_max: 200, calorias_por_unidad: 165, proteina_por_unidad: 31, comida: 'almuerzo' as const, dia: i + 1, rol_permitido: [] },
  { alimento_id: 'a', nombre: 'Arroz', cantidad: 200, unidad_medida: 'gramos' as const, porcion_base: 100, porcion_min: 50, porcion_max: 250, calorias_por_unidad: 130, proteina_por_unidad: 2.5, comida: 'almuerzo' as const, dia: i + 1, rol_permitido: [] },
  { alimento_id: 'b', nombre: 'Brocoli', cantidad: 150, unidad_medida: 'gramos' as const, porcion_base: 100, porcion_min: 50, porcion_max: 200, calorias_por_unidad: 35, proteina_por_unidad: 2.8, comida: 'almuerzo' as const, dia: i + 1, rol_permitido: [] },
  { alimento_id: 'g', nombre: 'Aceite', cantidad: 15, unidad_medida: 'gramos' as const, porcion_base: 100, porcion_min: 5, porcion_max: 20, calorias_por_unidad: 884, proteina_por_unidad: 0, comida: 'almuerzo' as const, dia: i + 1, rol_permitido: [] },
  { alimento_id: 's', nombre: 'Salmon', cantidad: 160, unidad_medida: 'gramos' as const, porcion_base: 100, porcion_min: 80, porcion_max: 200, calorias_por_unidad: 208, proteina_por_unidad: 25, comida: 'cena' as const, dia: i + 1, rol_permitido: [] },
  { alimento_id: 'bt', nombre: 'Batata', cantidad: 200, unidad_medida: 'gramos' as const, porcion_base: 100, porcion_min: 100, porcion_max: 300, calorias_por_unidad: 86, proteina_por_unidad: 1.6, comida: 'cena' as const, dia: i + 1, rol_permitido: [] },
  { alimento_id: 'e', nombre: 'Espinaca', cantidad: 100, unidad_medida: 'gramos' as const, porcion_base: 100, porcion_min: 30, porcion_max: 150, calorias_por_unidad: 23, proteina_por_unidad: 2.9, comida: 'cena' as const, dia: i + 1, rol_permitido: [] },
  { alimento_id: 'av', nombre: 'Avena', cantidad: 80, unidad_medida: 'gramos' as const, porcion_base: 40, porcion_min: 30, porcion_max: 100, calorias_por_unidad: 150, proteina_por_unidad: 5, comida: 'desayuno' as const, dia: i + 1, rol_permitido: [] },
  { alimento_id: 'h', nombre: 'Huevo', cantidad: 3, unidad_medida: 'unidad' as const, porcion_base: 2, porcion_min: 1, porcion_max: 4, calorias_por_unidad: 70, proteina_por_unidad: 6, comida: 'desayuno' as const, dia: i + 1, rol_permitido: [] },
  { alimento_id: 'l', nombre: 'Leche', cantidad: 300, unidad_medida: 'ml' as const, porcion_base: 240, porcion_min: 120, porcion_max: 480, calorias_por_unidad: 42, proteina_por_unidad: 3.4, comida: 'desayuno' as const, dia: i + 1, rol_permitido: [] },
])).flat()

// Target matched to actual data: 1755 cal, 129g prot
const r1 = analizarCalendario(aligned, 1755, 129)
console.log(`  dias_problematicos: ${r1.dias_problematicos.length}`)
console.log(`  dias_ok: [${r1.dias_ok.join(',')}]`)
for (const d of r1.dias_problematicos.slice(0, 2)) {
  console.log(`  Day ${d.dia}: problems=[${d.problemas}] cal=${Math.round(d.macros.calorias)} prot=${Math.round(d.macros.proteina)} diff_cal=${d.diferencia_calorias} diff_prot=${d.diferencia_proteina}`)
}
const greeting1 = r1.dias_problematicos.length === 0 ? 'CASO 1 — alineadas' : 'CASO 2 — fuera'
console.log(`  Greeting: ${greeting1}`)
console.log(`  ${r1.dias_problematicos.length === 0 ? '✅' : '❌'} Expected: CASO 1`)
console.log('')

// ═══ TEST 2: Excess protein (Grisel pattern) ═══
console.log('═══ TEST 2 — Excess protein (Grisel pattern) ═══')
// Simulate Grisel: target 106g prot, actual 120-137g on most days
const griselDays = Array.from({ length: 7 }, (_, i) => ([
  { alimento_id: 'p', nombre: 'Pollo', cantidad: 180, unidad_medida: 'gramos' as const, porcion_base: 150, porcion_min: 120, porcion_max: 200, calorias_por_unidad: 165, proteina_por_unidad: 31, comida: 'almuerzo' as const, dia: i + 1, rol_permitido: [] },
  { alimento_id: 'a', nombre: 'Arroz', cantidad: 150, unidad_medida: 'gramos' as const, porcion_base: 100, porcion_min: 50, porcion_max: 250, calorias_por_unidad: 130, proteina_por_unidad: 2.5, comida: 'almuerzo' as const, dia: i + 1, rol_permitido: [] },
  { alimento_id: 's', nombre: 'Salmon', cantidad: 150, unidad_medida: 'gramos' as const, porcion_base: 100, porcion_min: 80, porcion_max: 200, calorias_por_unidad: 208, proteina_por_unidad: 25, comida: 'cena' as const, dia: i + 1, rol_permitido: [] },
  { alimento_id: 'bt', nombre: 'Batata', cantidad: 200, unidad_medida: 'gramos' as const, porcion_base: 100, porcion_min: 100, porcion_max: 300, calorias_por_unidad: 86, proteina_por_unidad: 1.6, comida: 'cena' as const, dia: i + 1, rol_permitido: [] },
  { alimento_id: 'h', nombre: 'Huevo', cantidad: 2, unidad_medida: 'unidad' as const, porcion_base: 2, porcion_min: 1, porcion_max: 4, calorias_por_unidad: 70, proteina_por_unidad: 6, comida: 'desayuno' as const, dia: i + 1, rol_permitido: [] },
  { alimento_id: 'av', nombre: 'Avena', cantidad: 60, unidad_medida: 'gramos' as const, porcion_base: 40, porcion_min: 30, porcion_max: 100, calorias_por_unidad: 150, proteina_por_unidad: 5, comida: 'desayuno' as const, dia: i + 1, rol_permitido: [] },
])).flat()

// Target: 1419 cal, 106g prot. Each day has ~1390 cal (OK) but ~130g prot (excess >10g)
const r2 = analizarCalendario(griselDays, 1419, 106)
// analizarCalendario won't detect excess prot, but we check manually
const dayTotals: Record<number, number> = {}
for (const a of griselDays) {
  const ppu = a.unidad_medida === 'unidad' ? a.proteina_por_unidad : a.proteina_por_unidad / a.porcion_base
  dayTotals[a.dia] = (dayTotals[a.dia] || 0) + ppu * a.cantidad
}
const daysExcessProt = Object.values(dayTotals).filter(p => p > 106 + 10).length
const totalDiasFuera = new Set([
  ...r2.dias_problematicos.map(d => d.dia),
  ...Object.entries(dayTotals).filter(([, p]) => p > 116).map(([d]) => parseInt(d)),
]).size

console.log(`  analizarCalendario dias_problematicos: ${r2.dias_problematicos.length}`)
console.log(`  Excess protein days (manual check): ${daysExcessProt}`)
console.log(`  Total dias fuera (union): ${totalDiasFuera}`)
const greeting2 = totalDiasFuera > 0 ? 'CASO 2 — fuera (honest)' : 'CASO 1 — alineadas (LIE)'
console.log(`  Greeting: ${greeting2}`)
console.log(`  ${totalDiasFuera > 0 ? '✅' : '❌'} Expected: CASO 2 (excess protein detected)`)
console.log('')

// ═══ TEST 3: Calorie deficit ═══
console.log('═══ TEST 3 — Calorie deficit ═══')
// Use aligned data but with higher target so days fall short
const r3 = analizarCalendario(aligned, 2500, 147) // target 2500 but food gives ~1950
console.log(`  dias_problematicos: ${r3.dias_problematicos.length}`)
for (const d of r3.dias_problematicos.slice(0, 3)) {
  console.log(`  Day ${d.dia}: ${d.problemas.join(', ')} (cal diff: ${d.diferencia_calorias})`)
}
const greeting3 = r3.dias_problematicos.length > 0 ? 'CASO 2 — fuera (honest)' : 'CASO 1 — alineadas'
console.log(`  Greeting: ${greeting3}`)
console.log(`  ${r3.dias_problematicos.length > 0 ? '✅' : '❌'} Expected: CASO 2 (calorie deficit)`)
console.log('')

console.log('═══ ALL TESTS COMPLETE ═══')
