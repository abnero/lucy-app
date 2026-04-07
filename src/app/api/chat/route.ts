import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

function createAuthenticatedClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )
}

const META_LABELS: Record<string, string> = {
  perder_peso: 'Bajar de peso',
  mantener_peso: 'Mantener peso',
  ganar_masa: 'Ganar masa muscular',
}

const DIAS_NOMBRES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const tools: Anthropic.Tool[] = [
  {
    name: 'cambiar_alimento',
    description: 'Cambia un alimento por otro en el calendario de la usuaria. Busca el nuevo alimento en el catálogo, calcula la cantidad apropiada para mantener macros similares, y actualiza el calendario. Si el cambio es en la cena, también actualiza el almuerzo del día siguiente (Regla 2: almuerzo = cena del día anterior).',
    input_schema: {
      type: 'object' as const,
      properties: {
        dia: { type: 'number', description: 'Día de la semana (1=Lunes, 7=Domingo)' },
        comida: { type: 'string', enum: ['desayuno', 'almuerzo', 'cena'], description: 'Tipo de comida' },
        alimento_actual: { type: 'string', description: 'Nombre exacto del alimento a reemplazar (como aparece en el calendario)' },
        alimento_nuevo: { type: 'string', description: 'Nombre del nuevo alimento (debe existir en el catálogo)' },
      },
      required: ['dia', 'comida', 'alimento_actual', 'alimento_nuevo'],
    },
  },
  {
    name: 'agregar_snack',
    description: 'Añade un snack al calendario de la usuaria. Busca el alimento en el catálogo y lo inserta como snack.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dia: { type: 'string', description: 'Día (1-7) o "todos" para añadir a todos los días' },
        alimento: { type: 'string', description: 'Nombre del alimento para el snack (debe existir en el catálogo)' },
        cantidad: { type: 'number', description: 'Cantidad en la unidad del alimento' },
      },
      required: ['dia', 'alimento', 'cantidad'],
    },
  },
  {
    name: 'calcular_macros_dia',
    description: 'Calcula los macros consumidos y restantes de un día específico. Usa esto cuando la usuaria pida un snack para saber cuántos macros le quedan. Puedes filtrar por comidas ya consumidas (solo desayuno, desayuno+almuerzo, o todas).',
    input_schema: {
      type: 'object' as const,
      properties: {
        dia: { type: 'number', description: 'Día de la semana (1=Lunes, 7=Domingo)' },
        comidas_consumidas: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista de comidas ya consumidas: ["desayuno"], ["desayuno","almuerzo"], o ["desayuno","almuerzo","cena"]',
        },
      },
      required: ['dia', 'comidas_consumidas'],
    },
  },
  {
    name: 'buscar_macros_usda',
    description: 'Busca los macros nutricionales de cualquier alimento en la base de datos USDA. Úsala cuando la usuaria menciona un alimento que no está en el catálogo de Lucy para obtener sus valores nutricionales reales.',
    input_schema: {
      type: 'object' as const,
      properties: {
        alimento: { type: 'string', description: 'Nombre del alimento a buscar (en inglés o español)' },
      },
      required: ['alimento'],
    },
  },
  {
    name: 'buscar_o_crear_alimento',
    description: 'Busca un alimento en el catálogo por nombre. Si no existe, lo crea con los macros provistos. Úsalo ANTES de cambiar_alimento o agregar_snack cuando el alimento pueda no estar en el catálogo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre: { type: 'string', description: 'Nombre del alimento' },
        calorias_por_100g: { type: 'number', description: 'Calorías por 100g' },
        proteina_por_100g: { type: 'number', description: 'Proteína en gramos por 100g' },
        carbohidratos_por_100g: { type: 'number', description: 'Carbohidratos en gramos por 100g' },
        grasa_por_100g: { type: 'number', description: 'Grasa en gramos por 100g' },
        unidad_medida: { type: 'string', enum: ['gramos', 'ml', 'unidad'], description: 'Unidad de medida' },
        fuente: { type: 'string', enum: ['usda', 'usuario'], description: 'Origen de los macros: usda o usuario (empaque)' },
      },
      required: ['nombre', 'calorias_por_100g', 'proteina_por_100g', 'carbohidratos_por_100g', 'grasa_por_100g', 'unidad_medida', 'fuente'],
    },
  },
  {
    name: 'revertir_cambio',
    description: 'Revierte el último cambio realizado en el calendario. Solo funciona si hay un cambio previo guardado en esta conversación.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
]

// State for revert (per-request, passed via the messages context)
interface RevertData {
  type: 'cambiar' | 'snack'
  // For cambiar: original calendar rows that were replaced
  originalRows?: { rowId: string; alimento_id: string; cantidad: number; unidad: string }[]
  // For snack: IDs of inserted snack rows
  insertedIds?: string[]
  userId: string
}

function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const ALIMENTOS_FIELDS = 'id, nombre, calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad, unidad_medida, porcion_base'

async function findAlimento(supabase: SupabaseClient, nombre: string) {
  const normalized = removeAccents(nombre.toLowerCase().trim())

  // Fetch all alimentos and match in JS (91 rows is small enough)
  const { data: all } = await supabase
    .from('alimentos')
    .select(ALIMENTOS_FIELDS)

  if (!all || all.length === 0) return null

  // 1. Exact match (normalized)
  const exact = all.find(a => removeAccents(a.nombre.toLowerCase()) === normalized)
  if (exact) return exact

  // 2. Partial match — input is contained in name
  const partial = all.find(a => removeAccents(a.nombre.toLowerCase()).includes(normalized))
  if (partial) return partial

  // 3. Partial match — name is contained in input
  const reverse = all.find(a => normalized.includes(removeAccents(a.nombre.toLowerCase())))
  if (reverse) return reverse

  // 4. First-word match
  const firstWord = normalized.split(' ')[0]
  if (firstWord.length >= 3) {
    const wordMatch = all.find(a => removeAccents(a.nombre.toLowerCase()).includes(firstWord))
    if (wordMatch) return wordMatch
  }

  return null
}

async function getSimilarAlimentos(supabase: SupabaseClient, nombre: string) {
  const normalized = removeAccents(nombre.toLowerCase().trim())
  const firstWord = normalized.split(' ')[0]

  const { data: all } = await supabase
    .from('alimentos')
    .select('nombre')

  if (!all) return []

  return all
    .filter(a => {
      const n = removeAccents(a.nombre.toLowerCase())
      return n.includes(firstWord) || firstWord.includes(n.split(' ')[0])
    })
    .slice(0, 5)
    .map(a => a.nombre)
}

async function executeCambiarAlimento(
  supabase: SupabaseClient,
  userId: string,
  input: { dia: number; comida: string; alimento_actual: string; alimento_nuevo: string }
): Promise<{ result: string; revertData?: RevertData }> {
  const { dia, comida, alimento_actual, alimento_nuevo } = input

  // Find current alimento in calendar
  const { data: currentEntries } = await supabase
    .from('calendario')
    .select('id, alimento_id, cantidad, unidad, alimento:alimentos(nombre, calorias_por_unidad, proteina_por_unidad)')
    .eq('user_id', userId)
    .eq('dia', dia)
    .eq('comida', comida)

  if (!currentEntries || currentEntries.length === 0) {
    return { result: `No encontré comidas en el ${comida} del ${DIAS_NOMBRES[dia - 1]}.` }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const targetEntry = currentEntries.find((e: any) => {
    const n = Array.isArray(e.alimento) ? e.alimento[0]?.nombre : e.alimento?.nombre
    return n?.toLowerCase().includes(alimento_actual.toLowerCase())
  })

  if (!targetEntry) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const available = currentEntries.map((e: any) => {
      const n = Array.isArray(e.alimento) ? e.alimento[0]?.nombre : e.alimento?.nombre
      return n
    }).filter(Boolean).join(', ')
    return { result: `No encontré "${alimento_actual}" en el ${comida} del ${DIAS_NOMBRES[dia - 1]}. Los alimentos en esa comida son: ${available}.` }
  }

  // Find new alimento in catalog
  const newAlimento = await findAlimento(supabase, alimento_nuevo)
  if (!newAlimento) {
    const suggestions = await getSimilarAlimentos(supabase, alimento_nuevo)
    const sugText = suggestions.length > 0 ? ` Alimentos similares disponibles: ${suggestions.join(', ')}.` : ''
    return { result: `"${alimento_nuevo}" no está en el catálogo de alimentos.${sugText}` }
  }

  // Calculate new quantity to match calories of the original
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oldAlimento = (Array.isArray((targetEntry as any).alimento) ? (targetEntry as any).alimento[0] : (targetEntry as any).alimento)

  // Calculate total calories of the old item
  const oldIsCountable = targetEntry.unidad === 'unidad'
  const oldRatio = oldIsCountable ? targetEntry.cantidad : targetEntry.cantidad / (oldAlimento?.porcion_base || 100)
  const oldCalories = (oldAlimento?.calorias_por_unidad || 100) * oldRatio

  // Calculate quantity of new item to match those calories
  const newIsCountable = newAlimento.unidad_medida === 'unidad'
  let newCantidad: number
  if (newIsCountable) {
    // For countable items: round to whole units, minimum 1
    newCantidad = Math.max(1, Math.round(oldCalories / newAlimento.calorias_por_unidad))
  } else {
    // For weight/volume items: calculate grams/ml
    newCantidad = Math.round((oldCalories / newAlimento.calorias_por_unidad) * (newAlimento.porcion_base || 100))
  }

  // Save original for revert (using row ID for precise targeting)
  const revertData: RevertData = {
    type: 'cambiar',
    originalRows: [{
      rowId: targetEntry.id,
      alimento_id: targetEntry.alimento_id,
      cantidad: targetEntry.cantidad,
      unidad: targetEntry.unidad,
    }],
    userId,
  }

  // Update the calendar entry
  await supabase
    .from('calendario')
    .update({
      alimento_id: newAlimento.id,
      cantidad: newCantidad,
      unidad: newAlimento.unidad_medida,
    })
    .eq('id', targetEntry.id)

  let extraMsg = ''

  // If changing cena, also update next day's almuerzo (Regla 2)
  if (comida === 'cena' && dia < 7) {
    const nextDay = dia + 1
    const { data: almuerzoEntries } = await supabase
      .from('calendario')
      .select('id, alimento_id, cantidad, unidad')
      .eq('user_id', userId)
      .eq('dia', nextDay)
      .eq('comida', 'almuerzo')

    if (almuerzoEntries) {
      // Find matching alimento in next day's almuerzo
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matchingAlmuerzo = almuerzoEntries.find((a: any) => a.alimento_id === targetEntry.alimento_id)
      if (matchingAlmuerzo) {
        revertData.originalRows!.push({
          rowId: matchingAlmuerzo.id,
          alimento_id: matchingAlmuerzo.alimento_id,
          cantidad: matchingAlmuerzo.cantidad,
          unidad: matchingAlmuerzo.unidad,
        })

        await supabase
          .from('calendario')
          .update({
            alimento_id: newAlimento.id,
            cantidad: newCantidad,
            unidad: newAlimento.unidad_medida,
          })
          .eq('id', matchingAlmuerzo.id)

        extraMsg = ` También actualicé el almuerzo del ${DIAS_NOMBRES[nextDay - 1]} (Regla: almuerzo = cena del día anterior).`
      }
    }
  }

  return {
    result: `Cambié ${oldAlimento?.nombre || alimento_actual} por ${newCantidad}${newAlimento.unidad_medida} de ${newAlimento.nombre} en el ${comida} del ${DIAS_NOMBRES[dia - 1]}.${extraMsg} El cambio mantiene tus macros equilibrados.`,
    revertData,
  }
}

async function executeAgregarSnack(
  supabase: SupabaseClient,
  userId: string,
  input: { dia: string; alimento: string; cantidad: number }
): Promise<{ result: string; revertData?: RevertData }> {
  const { dia, alimento, cantidad } = input

  const found = await findAlimento(supabase, alimento)
  if (!found) {
    const suggestions = await getSimilarAlimentos(supabase, alimento)
    const sugText = suggestions.length > 0 ? ` Alimentos similares disponibles: ${suggestions.join(', ')}.` : ''
    return { result: `"${alimento}" no está en el catálogo.${sugText}` }
  }

  // Sanity check for countable units
  let finalCantidad = cantidad
  if (found.unidad_medida === 'unidad' && finalCantidad > 20) {
    finalCantidad = Math.round(finalCantidad / (found.porcion_base || 100))
    if (finalCantidad < 1) finalCantidad = 1
  }

  const dias = dia === 'todos' ? [1, 2, 3, 4, 5, 6, 7] : [parseInt(dia)]
  const rows = dias.map(d => ({
    user_id: userId,
    dia: d,
    comida: 'snack',
    alimento_id: found.id,
    cantidad: finalCantidad,
    unidad: found.unidad_medida,
  }))

  const { data: inserted, error } = await supabase
    .from('calendario')
    .insert(rows)
    .select('id')

  if (error) {
    return { result: `Error al agregar snack: ${error.message}` }
  }

  const revertData: RevertData = {
    type: 'snack',
    insertedIds: inserted?.map(r => r.id) || [],
    userId,
  }

  // If adding to all days, update lista_compras
  if (dia === 'todos') {
    const totalCantidad = cantidad * 7
    // Try upsert - if alimento already in lista, add to it
    const { data: existing } = await supabase
      .from('lista_compras')
      .select('id, cantidad_total')
      .eq('user_id', userId)
      .eq('alimento_id', found.id)
      .single()

    if (existing) {
      await supabase
        .from('lista_compras')
        .update({ cantidad_total: existing.cantidad_total + totalCantidad })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('lista_compras')
        .insert({
          user_id: userId,
          alimento_id: found.id,
          cantidad_total: totalCantidad,
          unidad: found.unidad_medida,
          comprado: false,
        })
    }
  }

  const diasText = dia === 'todos' ? 'todos los días' : DIAS_NOMBRES[parseInt(dia) - 1]
  const cals = Math.round(found.calorias_por_unidad * (cantidad / (found.porcion_base || 100)))
  const listaMsg = dia === 'todos' ? ' Tu lista de compras también se actualizó.' : ''

  return {
    result: `Añadí ${cantidad}${found.unidad_medida} de ${found.nombre} como snack el ${diasText}. Son ~${cals} kcal extra por día.${listaMsg}`,
    revertData,
  }
}

async function executeCalcularMacrosDia(
  supabase: SupabaseClient,
  userId: string,
  input: { dia: number; comidas_consumidas: string[] }
): Promise<string> {
  const { dia, comidas_consumidas } = input

  // Get user macros
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('calorias_objetivo, proteina_objetivo, carbs_objetivo, grasas_objetivo')
    .eq('id', userId)
    .single()

  if (!usuario) return 'No pude encontrar el perfil de la usuaria.'

  // Get calendar items for that day with nutrition info
  const { data: items } = await supabase
    .from('calendario')
    .select('comida, cantidad, alimento:alimentos(nombre, calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad, porcion_base)')
    .eq('user_id', userId)
    .eq('dia', dia)

  if (!items || items.length === 0) {
    return `No hay comidas programadas para el ${DIAS_NOMBRES[dia - 1]}. Macros restantes: ${usuario.calorias_objetivo} kcal, P:${usuario.proteina_objetivo}g, C:${usuario.carbs_objetivo}g, G:${usuario.grasas_objetivo}g.`
  }

  // Calculate consumed macros
  let calConsumed = 0, protConsumed = 0, carbsConsumed = 0, grasasConsumed = 0

  for (const item of items) {
    if (!comidas_consumidas.includes(item.comida)) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = (Array.isArray(item.alimento) ? (item.alimento as any)[0] : item.alimento) as any
    if (!a) continue
    const ratio = item.cantidad / (a.porcion_base || 100)
    calConsumed += a.calorias_por_unidad * ratio
    protConsumed += a.proteina_por_unidad * ratio
    carbsConsumed += a.carbs_por_unidad * ratio
    grasasConsumed += a.grasas_por_unidad * ratio
  }

  const calRemaining = Math.round(usuario.calorias_objetivo - calConsumed)
  const protRemaining = Math.round(usuario.proteina_objetivo - protConsumed)
  const carbsRemaining = Math.round(usuario.carbs_objetivo - carbsConsumed)
  const grasasRemaining = Math.round(usuario.grasas_objetivo - grasasConsumed)

  // Get snack-appropriate foods: fruits, nuts, yogurt, cottage cheese, nut butters
  const { data: allFoods } = await supabase
    .from('alimentos')
    .select('nombre, categoria_comida, calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad, porcion_base, unidad_medida, rol_permitido')
    .order('nombre')

  const isSnackAppropriate = (f: { categoria_comida: string; rol_permitido: string[] | null }) => {
    const roles = f.rol_permitido || []
    const hasBreakfastRole = roles.includes('Desayuno_1') || roles.includes('Desayuno_2')
    // Fruits, oats, bananas, berries (carbs with breakfast role)
    if (f.categoria_comida === 'carbohidrato' && hasBreakfastRole) return true
    // Nuts, nut butters, avocado, cheese (all grasas)
    if (f.categoria_comida === 'grasa') return true
    // Yogurt, cottage cheese, etc (proteins with breakfast role)
    if (f.categoria_comida === 'proteina' && hasBreakfastRole) return true
    return false
  }

  const suggestions: string[] = []
  if (allFoods) {
    for (const f of allFoods) {
      if (!isSnackAppropriate(f)) continue
      const cal = f.calorias_por_unidad
      if (cal <= calRemaining && cal > 0 && cal <= 300) {
        suggestions.push(`${f.nombre} (${Math.round(cal)} kcal, P:${f.proteina_por_unidad}g, C:${f.carbs_por_unidad}g, G:${f.grasas_por_unidad}g por ${f.porcion_base}${f.unidad_medida})`)
      }
    }
  }

  const comidasText = comidas_consumidas.join(', ')
  return `${DIAS_NOMBRES[dia - 1]} — Ya consumió: ${comidasText}.
Macros consumidos: ${Math.round(calConsumed)} kcal, P:${Math.round(protConsumed)}g, C:${Math.round(carbsConsumed)}g, G:${Math.round(grasasConsumed)}g.
Macros restantes: ${calRemaining} kcal, P:${protRemaining}g, C:${carbsRemaining}g, G:${grasasRemaining}g.
Alimentos que caben como snack: ${suggestions.slice(0, 8).join(' | ')}`
}

async function executeBuscarOCrearAlimento(
  supabase: SupabaseClient,
  userId: string,
  input: {
    nombre: string
    calorias_por_100g: number
    proteina_por_100g: number
    carbohidratos_por_100g: number
    grasa_por_100g: number
    unidad_medida: string
    fuente: string
  }
): Promise<string> {
  const { nombre, calorias_por_100g, proteina_por_100g, carbohidratos_por_100g, grasa_por_100g, unidad_medida, fuente } = input

  // Search existing
  const existing = await findAlimento(supabase, nombre)
  if (existing) {
    return `Alimento encontrado: "${existing.nombre}" (ID: ${existing.id}). Ya está en el catálogo. Puedes usarlo con cambiar_alimento o agregar_snack.`
  }

  // Create new
  const { data: created, error } = await supabase
    .from('alimentos')
    .insert({
      nombre,
      categoria_comida: 'otro',
      calorias_por_unidad: calorias_por_100g,
      proteina_por_unidad: proteina_por_100g,
      carbs_por_unidad: carbohidratos_por_100g,
      grasas_por_unidad: grasa_por_100g,
      fibra_por_unidad: 0,
      unidad_medida,
      porcion_base: unidad_medida === 'unidad' ? 1 : 100,
      porcion_min: unidad_medida === 'unidad' ? 1 : 50,
      porcion_max: unidad_medida === 'unidad' ? 10 : 300,
      es_personalizado: true,
      creado_por: userId,
      fuente,
    })
    .select('id')
    .single()

  if (error) {
    return `Error creando alimento: ${error.message}`
  }

  return `Alimento "${nombre}" creado exitosamente (ID: ${created.id}, fuente: ${fuente}). Ahora puedes usarlo con cambiar_alimento o agregar_snack.`
}

async function executeRevertir(
  supabase: SupabaseClient,
  revertData: RevertData | null
): Promise<string> {
  if (!revertData) {
    return 'No hay cambios recientes para revertir.'
  }

  if (revertData.type === 'cambiar' && revertData.originalRows) {
    for (const row of revertData.originalRows) {
      await supabase
        .from('calendario')
        .update({
          alimento_id: row.alimento_id,
          cantidad: row.cantidad,
          unidad: row.unidad,
        })
        .eq('id', row.rowId)
    }
    return 'Revertí el último cambio. Tu calendario está como antes.'
  }

  if (revertData.type === 'snack' && revertData.insertedIds) {
    for (const id of revertData.insertedIds) {
      await supabase.from('calendario').delete().eq('id', id)
    }
    return 'Eliminé el snack que añadí. Tu calendario está como antes.'
  }

  return 'No hay cambios recientes para revertir.'
}

function buildCalendarioTexto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calendario: any[] | null
): string {
  if (!calendario || calendario.length === 0) return '\n(No tiene calendario generado aún)'
  let text = ''
  for (let d = 1; d <= 7; d++) {
    const diaItems = calendario.filter(c => c.dia === d)
    if (diaItems.length === 0) continue
    text += `\n${DIAS_NOMBRES[d - 1]}:\n`
    for (const comida of ['desayuno', 'almuerzo', 'cena', 'snack']) {
      const items = diaItems.filter(c => c.comida === comida)
      if (items.length === 0) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemsText = items.map((i: any) => {
        const nombre = Array.isArray(i.alimento) ? i.alimento[0]?.nombre : i.alimento?.nombre
        return `${nombre} (${i.cantidad} ${i.unidad})`
      }).join(', ')
      text += `  ${comida.charAt(0).toUpperCase() + comida.slice(1)}: ${itemsText}\n`
    }
  }
  return text
}

export async function POST(req: NextRequest) {
  try {
    const { userId, accessToken, messages, lastRevertData, clientTime, clientTimezone } = await req.json()
    if (!userId || !accessToken || !messages) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Parse client time context
    const now = clientTime ? new Date(clientTime) : new Date()
    const tz = clientTimezone || 'America/New_York'
    const localTime = now.toLocaleString('es-ES', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const localHour = parseInt(now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }))
    const dayOfWeek = now.toLocaleString('en-US', { timeZone: tz, weekday: 'long' })

    const DAY_MAP: Record<string, number> = {
      Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7,
    }
    const todayNum = DAY_MAP[dayOfWeek] || 1

    let mealContext: string
    if (localHour < 10) {
      mealContext = 'Probablemente aún no ha comido o está por desayunar.'
    } else if (localHour < 14) {
      mealContext = 'Probablemente ya desayunó. Si pide snack, pregunta si ya desayunó.'
    } else if (localHour < 19) {
      mealContext = 'Probablemente ya desayunó y almorzó. Si pide snack, pregunta si ya almorzó también.'
    } else {
      mealContext = 'Probablemente ya desayunó, almorzó y cenó. Si pide snack nocturno, calcúlalo con las 3 comidas consumidas.'
    }

    const supabase = createAuthenticatedClient(accessToken)

    // Fetch user profile
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('nombre, calorias_objetivo, proteina_objetivo, carbs_objetivo, grasas_objetivo, meta')
      .eq('id', userId)
      .single()

    if (!usuario) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch calendar
    const { data: calendario } = await supabase
      .from('calendario')
      .select('dia, comida, cantidad, unidad, alimento:alimentos(nombre)')
      .eq('user_id', userId)
      .order('dia')
      .order('comida')

    const calendarioTexto = buildCalendarioTexto(calendario)

    // Fetch selected foods
    const { data: preferencias } = await supabase
      .from('preferencias_usuario')
      .select('categoria_comida, alimento:alimentos(nombre)')
      .eq('user_id', userId)

    let alimentosTexto = ''
    if (preferencias && preferencias.length > 0) {
      const byCategory: Record<string, string[]> = {}
      for (const p of preferencias) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a = p.alimento as any
        const nombre = Array.isArray(a) ? a[0]?.nombre : a?.nombre
        if (!nombre) continue
        if (!byCategory[p.categoria_comida]) byCategory[p.categoria_comida] = []
        byCategory[p.categoria_comida].push(nombre)
      }
      alimentosTexto = Object.entries(byCategory)
        .map(([cat, items]) => `${cat}: ${items.join(', ')}`)
        .join('\n')
    }

    const systemPrompt = `Eres Lucy, una asistente experta en nutrición y mejor amiga fitness de ${usuario.nombre}. Tienes acceso a su perfil completo y su calendario metabólico de 7 días. Tu tono es cálido, natural, y profesional sin ser formal — como una amiga experta que se alegra genuinamente de ayudar.

Perfil de la usuaria:
- Nombre: ${usuario.nombre}
- Calorías objetivo: ${usuario.calorias_objetivo} kcal
- Proteína objetivo: ${usuario.proteina_objetivo}g
- Carbs objetivo: ${usuario.carbs_objetivo}g
- Grasas objetivo: ${usuario.grasas_objetivo}g
- Meta: ${META_LABELS[usuario.meta] || usuario.meta}

Fecha y hora actual: ${localTime} (${tz})
Hoy es el día ${todayNum} del calendario (${DIAS_NOMBRES[todayNum - 1]}).
${mealContext}
Cuando la usuaria diga "hoy", usa día ${todayNum}. Para "mañana" usa día ${todayNum < 7 ? todayNum + 1 : 1}.

Calendario actual:${calendarioTexto}

Alimentos seleccionados:
${alimentosTexto || '(No tiene alimentos seleccionados aún)'}

Tienes 6 herramientas disponibles:
- cambiar_alimento: Para cambiar un alimento por otro en el calendario. Usa los nombres EXACTOS como aparecen en el calendario.
- calcular_macros_dia: Para calcular macros consumidos y restantes de un día. SIEMPRE usa esta herramienta ANTES de sugerir un snack.
- agregar_snack: Para añadir un snack al calendario. Usa dia "todos" para snack diario, o un número 1-7 para un día específico.
- buscar_macros_usda: Para buscar macros de cualquier alimento en la base de datos USDA.
- buscar_o_crear_alimento: Para registrar un alimento nuevo que no está en el catálogo. SIEMPRE pide confirmación de macros a la usuaria antes de crear.
- revertir_cambio: Para deshacer el último cambio cuando la usuaria lo pida.

PROTOCOLO PARA SNACKS:
Cuando la usuaria pida un snack, sigue estos pasos EN ORDEN:
1. Pregúntale qué ya se comió hoy: "¿Qué ya te comiste hoy? ¿Solo el desayuno, desayuno y almuerzo, o todas las comidas?"
2. Cuando responda, usa calcular_macros_dia para ver cuántos macros le quedan
3. Con base en los macros restantes, sugiere 2-3 opciones de snack del catálogo que quepan. Indica calorías y cantidad de cada opción.
4. Pregunta: "¿Cuál te gusta? ¿Lo añado a tu plan?"
5. Si confirma, usa agregar_snack con la cantidad correcta
6. Si pide snack para TODOS los días, calcula los macros promedio disponibles después de las 3 comidas principales y sugiere opciones que quepan diariamente. Cuando lo añadas con dia="todos", la lista de compras se actualiza automáticamente.

REGLAS IMPORTANTES:
- Si la usuaria pide un alimento que no está en el catálogo, sigue el protocolo de ALIMENTOS NO RECONOCIDOS (buscar USDA → pedir datos → crear → asignar).
- Después de cada cambio, confirma qué cambiaste con cantidades específicas.
- Si cambias la cena, recuerda que el almuerzo del día siguiente debe ser igual (Regla 2).
- Si la usuaria dice "reviértelo", "deshaz", "quítalo", o similar, usa revertir_cambio.
- NO agregues un snack sin antes calcular los macros restantes.
ALIMENTOS NO RECONOCIDOS:
Cuando la usuaria mencione un alimento que no está en el catálogo:
1. NUNCA uses un alimento similar como sustituto silencioso
2. Busca el alimento en USDA con buscar_macros_usda
3. SI USDA lo encuentra: presenta los valores y pregunta "Encontré [nombre] con estos valores por 100g: X kcal, Xg proteína, Xg carbos, Xg grasa. ¿Son correctos o tienes los valores del empaque?"
   - Si confirma → usa buscar_o_crear_alimento con fuente "usda"
   - Si da valores distintos → usa buscar_o_crear_alimento con fuente "usuario"
4. SI USDA NO lo encuentra: dile a la usuaria "No encontré [nombre] en mi base de datos. ¿Me puedes dar la información nutricional del empaque? Necesito: calorías, proteína, carbs y grasas por porción, y el tamaño de la porción."
   - Cuando la usuaria dé los datos → usa buscar_o_crear_alimento con fuente "usuario"
5. Después de crear el alimento, asígnalo al calendario con cambiar_alimento o agregar_snack normalmente
IMPORTANTE: Siempre aclara si los valores vienen de USDA (producto genérico) o del empaque (más preciso para esa marca).

Responde siempre en español. Sé concisa y práctica.`

    // Load conversation history from Supabase (last 30 messages)
    const { data: history } = await supabase
      .from('conversaciones')
      .select('role, content')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)

    const historyMessages = (history || []).reverse().map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // Build API messages: history + current session messages
    // Deduplicate: only add current messages that aren't already in history
    const currentMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    }))

    // Use history as base, then append only the latest user message
    const lastUserMsg = currentMessages[currentMessages.length - 1]
    const apiMessages = [...historyMessages]
    if (lastUserMsg && lastUserMsg.role === 'user') {
      // Check if this message is already in history (avoid duplicates)
      const isDuplicate = historyMessages.length > 0 &&
        historyMessages[historyMessages.length - 1]?.content === lastUserMsg.content &&
        historyMessages[historyMessages.length - 1]?.role === 'user'
      if (!isDuplicate) {
        apiMessages.push(lastUserMsg)
      }
    }

    // Tool use loop — handles multiple tool calls per response
    let currentRevertData: RevertData | null = lastRevertData || null
    let finalResponse = ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let loopMessages: any[] = [...apiMessages]
    let iterations = 0

    const executeTool = async (name: string, input: Record<string, unknown>): Promise<string> => {
      try {
        if (name === 'cambiar_alimento') {
          const { result, revertData } = await executeCambiarAlimento(supabase, userId, {
            dia: input.dia as number,
            comida: input.comida as string,
            alimento_actual: input.alimento_actual as string,
            alimento_nuevo: input.alimento_nuevo as string,
          })
          if (revertData) currentRevertData = revertData
          return result
        } else if (name === 'agregar_snack') {
          const { result, revertData } = await executeAgregarSnack(supabase, userId, {
            dia: input.dia as string,
            alimento: input.alimento as string,
            cantidad: input.cantidad as number,
          })
          if (revertData) currentRevertData = revertData
          return result
        } else if (name === 'calcular_macros_dia') {
          return await executeCalcularMacrosDia(supabase, userId, {
            dia: input.dia as number,
            comidas_consumidas: input.comidas_consumidas as string[],
          })
        } else if (name === 'buscar_o_crear_alimento') {
          return await executeBuscarOCrearAlimento(supabase, userId, {
            nombre: input.nombre as string,
            calorias_por_100g: input.calorias_por_100g as number,
            proteina_por_100g: input.proteina_por_100g as number,
            carbohidratos_por_100g: input.carbohidratos_por_100g as number,
            grasa_por_100g: input.grasa_por_100g as number,
            unidad_medida: input.unidad_medida as string,
            fuente: input.fuente as string,
          })
        } else if (name === 'buscar_macros_usda') {
          const usdaRes = await fetch(new URL('/api/usda-search', req.url).toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: input.alimento }),
          })
          const usdaData = await usdaRes.json()
          if (usdaData.error) return `USDA: ${usdaData.error}`
          const m = usdaData.por_100g
          return `${usdaData.nombre} (por 100g): ${m.calorias} kcal, Proteína: ${m.proteina}g, Carbs: ${m.carbs}g, Grasas: ${m.grasas}g, Fibra: ${m.fibra}g`
        } else if (name === 'revertir_cambio') {
          const result = await executeRevertir(supabase, currentRevertData)
          currentRevertData = null
          return result
        }
        return 'Herramienta no reconocida.'
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido'
        console.error(`Tool "${name}" failed:`, msg)
        return `ERROR: No pude ejecutar esta acción (${msg}). Dile a la usuaria que hubo un problema y pregúntale si quiere intentar de nuevo.`
      }
    }

    while (iterations < 8) {
      iterations++

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages: loopMessages,
      })

      // Collect all tool_use blocks
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')
      const textBlock = response.content.find(b => b.type === 'text')

      if (toolUseBlocks.length === 0) {
        finalResponse = textBlock?.type === 'text' ? textBlock.text : ''
        break
      }

      // Execute ALL tool calls and build results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolResults: any[] = []
      for (const block of toolUseBlocks) {
        if (block.type === 'tool_use') {
          const result = await executeTool(block.name, block.input as Record<string, unknown>)
          toolResults.push({
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: result,
          })
        }
      }

      loopMessages = [
        ...loopMessages,
        { role: 'assistant' as const, content: response.content },
        { role: 'user' as const, content: toolResults },
      ]
    }

    // If we exhausted iterations, get the last text
    if (!finalResponse && loopMessages.length > apiMessages.length) {
      const lastResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: loopMessages,
      })
      const textBlock = lastResponse.content.find(b => b.type === 'text')
      finalResponse = textBlock?.type === 'text' ? textBlock.text : 'Listo, hice los cambios.'
    }

    // Save messages to conversaciones
    const lastMsg = messages[messages.length - 1]
    if (lastMsg && finalResponse) {
      await supabase.from('conversaciones').insert([
        { user_id: userId, role: 'user', content: lastMsg.content },
        { user_id: userId, role: 'assistant', content: finalResponse },
      ])
    }

    return NextResponse.json({
      response: finalResponse,
      revertData: currentRevertData,
    })
  } catch (err) {
    console.error('chat error:', err)
    const errMessage = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: errMessage }, { status: 500 })
  }
}
