// E2E analysis script — queries calendar + alimentos for 4 dummies, computes tolerance
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://anbpsybyipvbczzuqkjw.supabase.co',
  process.env.SERVICE_KEY
)

const DUMMIES = [
  { label: 'A', id: '62ca1118-e989-4d8b-ac35-ea411ae7c71f' },
  { label: 'B', id: '9df2b9e7-276b-4e4b-89e8-fbd891feee57' },
  { label: 'C', id: 'b6f61bfb-8427-4825-ab03-f71ca3d7259d' },
  { label: 'D', id: '8c978067-eecb-4f34-ac6d-b21fd7948358' },
]

function calcCal(a) {
  if (a.unidad_medida === 'unidad') return a.cantidad * a.calorias_por_unidad
  return (a.cantidad * a.calorias_por_unidad) / a.porcion_base
}
function calcProt(a) {
  if (a.unidad_medida === 'unidad') return a.cantidad * a.proteina_por_unidad
  return (a.cantidad * a.proteina_por_unidad) / a.porcion_base
}

async function analyzeDummy(dummy) {
  // Get user objectives
  const { data: user } = await supabase
    .from('usuarios')
    .select('nombre, calorias_objetivo, proteina_objetivo')
    .eq('id', dummy.id)
    .single()

  if (!user) { console.log(`Dummy ${dummy.label}: USER NOT FOUND`); return null }

  // Get calendar with joined alimento data
  const { data: rows, error } = await supabase
    .from('calendario')
    .select(`
      dia, comida, cantidad,
      alimento:alimentos (
        id, nombre, calorias_por_unidad, proteina_por_unidad,
        unidad_medida, porcion_base
      )
    `)
    .eq('user_id', dummy.id)
    .order('dia')
    .order('comida')

  if (error) { console.log(`Dummy ${dummy.label} ERROR:`, error.message); return null }
  if (!rows || rows.length === 0) { console.log(`Dummy ${dummy.label}: NO CALENDAR`); return null }

  const objCal = user.calorias_objetivo
  const objProt = user.proteina_objetivo
  const tolCal = objCal * 0.10
  const tolProt = 10

  const days = {}
  for (const r of rows) {
    const a = r.alimento
    if (!a) continue
    if (!days[r.dia]) days[r.dia] = { kcal: 0, prot: 0 }
    const item = { cantidad: r.cantidad, unidad_medida: a.unidad_medida, calorias_por_unidad: a.calorias_por_unidad, proteina_por_unidad: a.proteina_por_unidad, porcion_base: a.porcion_base }
    days[r.dia].kcal += calcCal(item)
    days[r.dia].prot += calcProt(item)
  }

  const results = []
  let okCount = 0
  for (let d = 1; d <= 7; d++) {
    const day = days[d] || { kcal: 0, prot: 0 }
    const diffCal = day.kcal - objCal
    const pctCal = ((diffCal / objCal) * 100)
    const diffProt = day.prot - objProt
    const calOk = Math.abs(diffCal) <= tolCal
    const protOk = diffProt >= -tolProt
    const status = (calOk && protOk) ? 'OK' : 'FAIL'
    if (status === 'OK') okCount++
    results.push({ dia: d, kcal: Math.round(day.kcal), pctCal: pctCal.toFixed(1), prot: Math.round(day.prot * 10) / 10, deltaProt: (diffProt).toFixed(1), status })
  }

  return { label: dummy.label, name: user.nombre, objCal, objProt, results, okCount }
}

async function main() {
  const analyses = await Promise.all(DUMMIES.map(d => analyzeDummy(d)))

  let totalOk = 0
  let totalDays = 0

  for (const a of analyses) {
    if (!a) continue
    console.log(`\n═══ DUMMY ${a.label} — ${a.name} (obj: ${a.objCal} kcal, ${a.objProt}g prot) ═══`)
    console.log('Día  │ kcal   │ %kcal  │ prot   │ Δprot  │ status')
    console.log('─────┼────────┼────────┼────────┼────────┼───────')
    for (const r of a.results) {
      console.log(
        `  ${r.dia}  │ ${String(r.kcal).padStart(5)}  │ ${r.pctCal.padStart(5)}% │ ${String(r.prot).padStart(5)}g │ ${r.deltaProt.padStart(5)}g │ ${r.status}`
      )
    }
    console.log(`─────┴────────┴────────┴────────┴────────┴───────`)
    console.log(`  → ${a.okCount}/7 OK`)
    totalOk += a.okCount
    totalDays += 7
  }

  console.log(`\n═══════════════════════════════════════════`)
  console.log(`TOTAL COMBINADO: ${totalOk}/${totalDays} días OK (${((totalOk/totalDays)*100).toFixed(0)}%)`)
  console.log(`═══════════════════════════════════════════`)
}

main().catch(console.error)
