import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { analizarCalendario, type AlimentoCalendario } from '@/lib/analisis-calorico'
import { calcularCantidadParaAlimento, calcularCantidadIsoCalorica, calcularCantidadParaSnack } from '@/lib/calcular-cantidad'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

function createAuthenticatedClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )
}

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Sync preferencias_usuario when Lucy changes foods via chat
async function syncPreferencia(action: 'add' | 'remove', userId: string, alimentoId: string, categoriaComida?: string) {
  const sb = getServiceSupabase()
  try {
    if (action === 'add' && categoriaComida) {
      const { data: exists } = await sb.from('preferencias_usuario').select('id').eq('user_id', userId).eq('alimento_id', alimentoId).single()
      if (!exists) {
        await sb.from('preferencias_usuario').insert({ user_id: userId, alimento_id: alimentoId, categoria_comida: categoriaComida })
      }
    } else if (action === 'remove') {
      // Only remove if alimento doesn't appear in any other calendar day
      const { count } = await sb.from('calendario').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('alimento_id', alimentoId)
      if ((count ?? 0) === 0) {
        await sb.from('preferencias_usuario').delete().eq('user_id', userId).eq('alimento_id', alimentoId)
      }
    }
  } catch (err) {
    console.error('[syncPreferencia] Error:', action, alimentoId, err instanceof Error ? err.message : err)
  }
}

// Map comida type to preferencia categoria
function inferCategoria(comida: string, alimentoCategoria: string): string {
  if (comida === 'desayuno') return 'desayuno_1'
  if (alimentoCategoria === 'proteina') return 'proteina'
  if (alimentoCategoria === 'carbohidrato') return 'carbohidrato'
  if (alimentoCategoria === 'vegetal') return 'fibra'
  if (alimentoCategoria === 'grasa') return 'grasa'
  return 'carbohidrato'
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
    description: 'Reemplaza un alimento por otro en el calendario. Lucy calcula la cantidad automáticamente según los macros de la usuaria. NO pases cantidad — se calcula internamente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dia: { type: 'number', description: 'Día de la semana (1=Lunes, 7=Domingo)' },
        comida: { type: 'string', enum: ['desayuno', 'almuerzo', 'cena'], description: 'Tipo de comida' },
        alimento_actual: { type: 'string', description: 'Nombre del alimento a reemplazar' },
        alimento_nuevo: { type: 'string', description: 'Nombre del nuevo alimento' },
      },
      required: ['dia', 'comida', 'alimento_actual', 'alimento_nuevo'],
    },
  },
  {
    name: 'agregar_snack',
    description: 'Añade un snack al calendario. Lucy calcula la cantidad automáticamente según los macros restantes del día. NO pases cantidad — se calcula internamente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dia: { type: 'string', description: 'Día (1-7) o "todos" para añadir a todos los días' },
        alimento: { type: 'string', description: 'Nombre del alimento para el snack' },
        ingredientes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              alimento: { type: 'string' },
            },
            required: ['alimento'],
          },
          description: 'Lista de ingredientes para snack compuesto (alternativa a alimento individual)',
        },
      },
      required: ['dia'],
    },
  },
  {
    name: 'calcular_macros_dia',
    description: 'Calcula los macros totales del plan para un día específico (desayuno+almuerzo+cena+snacks). Usa esto cuando la usuaria pregunte calorías, macros o proteína de un día, o antes de sugerir snacks.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dia: { type: 'number', description: 'Día de la semana (1=Lunes, 7=Domingo)' },
      },
      required: ['dia'],
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
    description: 'Busca un alimento en el catálogo por nombre. Si no existe, lo crea con los macros provistos. Úsalo ANTES de cambiar_alimento o agregar_snack cuando el alimento pueda no estar en el catálogo. Para alimentos contables (huevos, tortillas), usa unidad_medida "unidad" y pon los macros POR 1 UNIDAD.',
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
    name: 'agregar_ingrediente_a_comida',
    description: 'Añade un ingrediente nuevo a una comida existente (desayuno/almuerzo/cena). Lucy calcula la cantidad automáticamente según el presupuesto calórico de la comida y compensa reduciendo otros alimentos. NO pases cantidad — se calcula internamente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dia: { type: 'number', description: 'Día de la semana (1=Lunes, 7=Domingo)' },
        comida: { type: 'string', enum: ['desayuno', 'almuerzo', 'cena'], description: 'Tipo de comida' },
        alimento: { type: 'string', description: 'Nombre del alimento a añadir (debe existir en el catálogo)' },
      },
      required: ['dia', 'comida', 'alimento'],
    },
  },
  {
    name: 'reemplazar_comida_completa',
    description: 'Reemplaza TODOS los alimentos de una comida con una lista nueva de ingredientes. Úsalo cuando la usuaria quiera cambiar una comida entera por una receta o combinación diferente. Calcula cantidades para que los macros quepan en el presupuesto de esa comida.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dia: { type: 'number', description: 'Día de la semana (1=Lunes, 7=Domingo)' },
        comida: { type: 'string', enum: ['desayuno', 'almuerzo', 'cena'], description: 'Tipo de comida' },
        ingredientes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista de nombres de ingredientes nuevos',
        },
      },
      required: ['dia', 'comida', 'ingredientes'],
    },
  },
  {
    name: 'eliminar_ingrediente_de_comida',
    description: 'Elimina un ingrediente de una comida del calendario. Si retorna "NO EJECUTAR", DEBES preguntar a la usuaria antes de llamar de nuevo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dia: { type: 'number', description: 'Día de la semana (1=Lunes, 7=Domingo)' },
        comida: { type: 'string', enum: ['desayuno', 'almuerzo', 'cena', 'snack'], description: 'Tipo de comida' },
        alimento: { type: 'string', description: 'Nombre del alimento a eliminar' },
        row_id: { type: 'string', description: 'ID específico de la fila a eliminar (para cuando hay múltiples del mismo alimento)' },
        forzar: { type: 'boolean', description: 'true para eliminar sin advertencias (cuando la usuaria ya confirmó)' },
      },
      required: ['dia', 'comida', 'alimento'],
    },
  },
  {
    name: 'ajustar_porcion_y_compensar',
    description: 'Sube la porción de un alimento que YA ESTÁ en la comida y opcionalmente baja o elimina otro alimento de la misma comida para compensar. Úsalo cuando la usuaria pide "más X" o "X en vez de Y" y X ya está presente. Lucy calcula las cantidades. NO pases cantidad — se calcula internamente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dia: { type: 'number', description: 'Día de la semana (1=Lunes, 7=Domingo)' },
        comida: { type: 'string', enum: ['desayuno', 'almuerzo', 'cena'], description: 'Tipo de comida' },
        alimento_subir: { type: 'string', description: 'Nombre del alimento cuya porción se debe subir (debe estar en la comida)' },
        alimento_bajar: { type: 'string', description: 'Nombre del alimento a reducir o eliminar para compensar (opcional)' },
      },
      required: ['dia', 'comida', 'alimento_subir'],
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

const ALIMENTOS_FIELDS = 'id, nombre, categoria_comida, calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad, unidad_medida, porcion_base, porcion_min, porcion_max, unidad_display, factor_conversion, es_personalizado, creado_por, rol_permitido, fuente'

async function findAlimento(supabase: SupabaseClient, nombre: string, userId?: string) {
  const normalized = removeAccents(nombre.toLowerCase().trim())

  // Fetch all alimentos and match in JS (91 rows is small enough)
  const { data: rawAll } = await supabase
    .from('alimentos')
    .select(ALIMENTOS_FIELDS)

  // Filter: only catalog foods (es_personalizado=false/null) OR foods created by this user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = (rawAll || []).filter((a: any) => !a.es_personalizado || a.creado_por === userId)

  if (!all || all.length === 0) return null

  // 1. Exact match (normalized)
  const exact = all.find(a => removeAccents(a.nombre.toLowerCase()) === normalized)
  if (exact) return exact

  // 2. Partial match — input is contained in name (prefer shortest/most specific name)
  const partials = all
    .filter(a => removeAccents(a.nombre.toLowerCase()).includes(normalized))
    .sort((a, b) => a.nombre.length - b.nombre.length)
  if (partials.length > 0) return partials[0]

  // 3. Partial match — name is contained in input (prefer longest match)
  const reverses = all
    .filter(a => normalized.includes(removeAccents(a.nombre.toLowerCase())))
    .sort((a, b) => b.nombre.length - a.nombre.length)
  if (reverses.length > 0) return reverses[0]

  // 4. First-word match (prefer shortest name)
  const firstWord = normalized.split(' ')[0]
  if (firstWord.length >= 3) {
    const wordMatches = all
      .filter(a => removeAccents(a.nombre.toLowerCase()).includes(firstWord))
      .sort((a, b) => a.nombre.length - b.nombre.length)
    if (wordMatches.length > 0) return wordMatches[0]
  }

  // 5. Any significant word match (for synonyms like "mantequilla de mani" → "Crema de mani")
  const words = normalized.split(' ').filter(w => w.length >= 4)
  for (const word of words) {
    const match = all
      .filter(a => removeAccents(a.nombre.toLowerCase()).includes(word))
      .sort((a, b) => a.nombre.length - b.nombre.length)
    if (match.length > 0) return match[0]
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

// ═══ Shared: calculate quantity from meal calorie budget ═══
// MEAL_PCT and calcularCantidadDesdePresupuesto moved to src/lib/calcular-cantidad.ts (Bug #32/#34)

async function executeCambiarAlimento(
  supabase: SupabaseClient,
  userId: string,
  input: { dia: number; comida: string; alimento_actual: string; alimento_nuevo: string }
): Promise<{ result: string; revertData?: RevertData }> {
  const { dia, comida, alimento_actual, alimento_nuevo } = input

  // Find current alimento in calendar
  const { data: currentEntries } = await supabase
    .from('calendario')
    .select('id, alimento_id, cantidad, unidad, alimento:alimentos(nombre, categoria_comida, calorias_por_unidad, proteina_por_unidad, porcion_base)')
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

  const newAlimento = await findAlimento(supabase, alimento_nuevo, userId)
  if (!newAlimento) {
    const suggestions = await getSimilarAlimentos(supabase, alimento_nuevo)
    const sugText = suggestions.length > 0 ? ` Alimentos similares disponibles: ${suggestions.join(', ')}.` : ''
    return { result: `"${alimento_nuevo}" no está en el catálogo de alimentos.${sugText}` }
  }

  // Always calculate quantity — Lucy decides, never the user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oldAlimento = (Array.isArray((targetEntry as any).alimento) ? (targetEntry as any).alimento[0] : (targetEntry as any).alimento)

  // Bug #32: Validate same-category swap
  const oldFoodCat = oldAlimento?.categoria_comida || 'otro'
  const newFoodCat = newAlimento.categoria_comida || 'otro'
  if (oldFoodCat !== newFoodCat) {
    // Cross-category swap — reject with suggestions
    const suggestions = await getSimilarAlimentos(supabase, alimento_nuevo)
    const sameCatSuggestions = suggestions.length > 0 ? ` Alternativas de ${oldFoodCat}: ${suggestions.slice(0, 3).join(', ')}.` : ''
    return { result: `No puedo cambiar ${oldAlimento?.nombre || alimento_actual} (${oldFoodCat}) por ${newAlimento.nombre} (${newFoodCat}) — eso rompería tus macros.${sameCatSuggestions} ¿Te interesa una alternativa dentro de la misma categoría?` }
  }

  // Iso-caloric swap (same category)
  const oldIsCountable = targetEntry.unidad === 'unidad'
  const oldRatio = oldIsCountable ? targetEntry.cantidad : targetEntry.cantidad / (oldAlimento?.porcion_base || 100)
  const oldCalories = (oldAlimento?.calorias_por_unidad || 100) * oldRatio

  const { cantidad: newCantidad } = calcularCantidadIsoCalorica(newAlimento, oldCalories)

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

  // Update the calendar entry (mark as chat personalization since alimento changed)
  const { error: updateError } = await supabase
    .from('calendario')
    .update({
      alimento_id: newAlimento.id,
      cantidad: newCantidad,
      unidad: newAlimento.unidad_medida,
      origen: 'chat',
    })
    .eq('id', targetEntry.id)

  if (updateError) {
    console.error('[cambiar_alimento] UPDATE error:', updateError.message)
    return { result: `No pude actualizar el calendario: ${updateError.message}. Intenta de nuevo.` }
  }

  // Verify persistence
  const { data: verify } = await supabase
    .from('calendario')
    .select('alimento_id')
    .eq('id', targetEntry.id)
    .single()

  if (!verify || verify.alimento_id !== newAlimento.id) {
    console.error('[cambiar_alimento] VERIFICATION FAILED: expected', newAlimento.id, 'got', verify?.alimento_id)
    return { result: 'El cambio no se guardó correctamente. Intenta de nuevo.' }
  }

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

        // NOTA: Este UPDATE es compensación automática de macros (no intención explícita del usuario).
        // Por eso NO actualiza 'origen'. Si en el futuro se añade un tool donde el usuario pide
        // cambio de cantidad directo (ej: "dame 150g en vez de 100g"), ese tool SÍ debe marcar origen='chat'.
        const { error: nextDayError } = await supabase
          .from('calendario')
          .update({
            alimento_id: newAlimento.id,
            cantidad: newCantidad,
            unidad: newAlimento.unidad_medida,
          })
          .eq('id', matchingAlmuerzo.id)

        if (nextDayError) {
          console.error('[cambiar_alimento] Next-day almuerzo update failed:', nextDayError.message)
        } else {
          extraMsg = ` También actualicé el almuerzo del ${DIAS_NOMBRES[nextDay - 1]} (Regla: almuerzo = cena del día anterior).`
        }
      }
    }
  }

  // Sync preferencias: add new, remove old if no longer in calendar
  const oldCat = inferCategoria(comida, oldAlimento?.categoria_comida || 'carbohidrato')
  await syncPreferencia('add', userId, newAlimento.id, oldCat)
  await syncPreferencia('remove', userId, targetEntry.alimento_id)

  return {
    result: `Cambié ${oldAlimento?.nombre || alimento_actual} por ${newCantidad}${newAlimento.unidad_medida} de ${newAlimento.nombre} en el ${comida} del ${DIAS_NOMBRES[dia - 1]}.${extraMsg} El cambio mantiene tus macros equilibrados.`,
    revertData,
  }
}

async function executeAgregarSnack(
  supabase: SupabaseClient,
  userId: string,
  input: { dia: string; alimento?: string; ingredientes?: { alimento: string }[] }
): Promise<{ result: string; revertData?: RevertData }> {
  const { dia } = input
  console.log('[agregar_snack] Input:', JSON.stringify(input))

  // Build list of food names to add
  const foodNames: string[] = []
  if (input.ingredientes && input.ingredientes.length > 0) {
    foodNames.push(...input.ingredientes.map(i => i.alimento))
  } else if (input.alimento) {
    foodNames.push(input.alimento)
  } else {
    return { result: 'Necesito al menos un alimento para el snack.' }
  }

  // Resolve all items
  const resolvedFoods: NonNullable<Awaited<ReturnType<typeof findAlimento>>>[] = []
  const notFound: string[] = []

  for (const name of foodNames) {
    const found = await findAlimento(supabase, name, userId)
    if (!found) {
      notFound.push(name)
      continue
    }
    resolvedFoods.push(found)
  }

  if (notFound.length > 0) {
    return { result: `No encontré: ${notFound.join(', ')}. Usa buscar_o_crear_alimento para registrarlos primero.` }
  }

  // Get user objectives for budget calculation
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('calorias_objetivo')
    .eq('id', userId)
    .single()

  if (!usuario) return { result: 'No se encontró el perfil de la usuaria.' }

  const dias = dia === 'todos' ? [1, 2, 3, 4, 5, 6, 7] : [parseInt(dia)]

  // Calculate snack budget per day: remaining calories after meals
  // Use first day as reference for budget calculation
  const refDay = dias[0]
  const { data: dayItems } = await supabase
    .from('calendario')
    .select('cantidad, comida, alimento:alimentos(calorias_por_unidad, porcion_base, unidad_medida)')
    .eq('user_id', userId)
    .eq('dia', refDay)

  let mealsKcal = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const item of (dayItems || []) as any[]) {
    if (item.comida === 'snack') continue
    const a = Array.isArray(item.alimento) ? item.alimento[0] : item.alimento
    if (!a) continue
    const ratio = a.unidad_medida === 'unidad' ? item.cantidad : item.cantidad / (a.porcion_base || 100)
    mealsKcal += a.calorias_por_unidad * ratio
  }

  const snackBudget = Math.max(50, usuario.calorias_objetivo - mealsKcal)
  const budgetPerFood = snackBudget / resolvedFoods.length

  // Calculate quantity for each food from budget (Bug #32: use centralized calc with porcion_max clamp)
  const resolved: { food: typeof resolvedFoods[0]; cantidad: number }[] = []
  for (const food of resolvedFoods) {
    const { cantidad, cabe } = calcularCantidadParaSnack(food, budgetPerFood)
    if (!cabe) {
      return { result: `${food.nombre} no cuadra con tus macros del día sin pasarte. ¿Lo cambio por otro alimento o lo movemos a otro día?` }
    }
    resolved.push({ food, cantidad })
  }

  // Bug #35: Check for duplicate snacks before inserting
  const allRows: { user_id: string; dia: number; comida: string; alimento_id: string; cantidad: number; unidad: string; origen: string }[] = []
  const skippedDuplicates: { nombre: string; dia: number }[] = []

  for (const { food, cantidad } of resolved) {
    for (const d of dias) {
      // Check if this exact snack already exists for this day
      const { data: existing } = await supabase
        .from('calendario')
        .select('id')
        .eq('user_id', userId)
        .eq('dia', d)
        .eq('comida', 'snack')
        .eq('alimento_id', food.id)
        .limit(1)

      if (existing && existing.length > 0) {
        skippedDuplicates.push({ nombre: food.nombre, dia: d })
        continue
      }
      allRows.push({ user_id: userId, dia: d, comida: 'snack', alimento_id: food.id, cantidad, unidad: food.unidad_medida, origen: 'snack_chat' })
    }
  }

  // If ALL rows were duplicates, return early
  if (allRows.length === 0) {
    if (skippedDuplicates.length === 1) {
      const dup = skippedDuplicates[0]
      return { result: `${dup.nombre} ya está como snack el ${DIAS_NOMBRES[dup.dia - 1]}. Si quieres cambiarlo por otro, usa cambiar_alimento.` }
    }
    const names = Array.from(new Set(skippedDuplicates.map(d => d.nombre))).join(', ')
    return { result: `${names} ya está(n) como snack en esos días. Si quieres cambiarlos, usa cambiar_alimento.` }
  }

  console.log(`[agregar_snack] Inserting ${allRows.length} rows for dias=[${dias.join(',')}] (skipped ${skippedDuplicates.length} duplicates)`)
  const { data: inserted, error } = await supabase.from('calendario').insert(allRows).select('id')
  if (error) {
    console.error('[agregar_snack] Insert error:', error.message, error.details, error.hint)
    return { result: `Error al agregar snack: ${error.message}` }
  }
  console.log(`[agregar_snack] Inserted ${inserted?.length || 0} rows successfully`)

  const revertData: RevertData = { type: 'snack', insertedIds: inserted?.map(r => r.id) || [], userId }

  // Update lista_compras (only count actually inserted days per food)
  for (const { food, cantidad } of resolved) {
    if (!food) continue
    const insertedDaysForFood = allRows.filter(r => r.alimento_id === food.id).length
    if (insertedDaysForFood === 0) continue
    const total = cantidad * insertedDaysForFood
    const { data: existing } = await supabase.from('lista_compras').select('id, cantidad_total').eq('user_id', userId).eq('alimento_id', food.id).single()
    if (existing) {
      await supabase.from('lista_compras').update({ cantidad_total: existing.cantidad_total + total }).eq('id', existing.id)
    } else {
      await supabase.from('lista_compras').insert({ user_id: userId, alimento_id: food.id, cantidad_total: total, unidad: food.unidad_medida, comprado: false })
    }
  }

  // Build response — only mention actually inserted foods/days
  const insertedDias = Array.from(new Set(allRows.map(r => r.dia)))
  const diasText = insertedDias.length === 7 ? 'todos los días' : insertedDias.map(d => DIAS_NOMBRES[d - 1]).join(', ')
  let totalCals = 0
  const details: string[] = []
  const insertedFoodIds = new Set(allRows.map(r => r.alimento_id))
  for (const { food, cantidad } of resolved) {
    if (!food || !insertedFoodIds.has(food.id)) continue
    const ratio = food.unidad_medida === 'unidad' ? cantidad : cantidad / (food.porcion_base || 100)
    totalCals += food.calorias_por_unidad * ratio
    details.push(`${cantidad}${food.unidad_medida} de ${food.nombre}`)
  }
  const listaMsg = dia === 'todos' ? ' Tu lista de compras también se actualizó.' : ''
  const dupMsg = skippedDuplicates.length > 0
    ? ` (${Array.from(new Set(skippedDuplicates.map(d => d.nombre))).join(', ')} ya existía como snack en ${skippedDuplicates.length === 1 ? DIAS_NOMBRES[skippedDuplicates[0].dia - 1] : 'algunos días'} — no se duplicó)`
    : ''

  return {
    result: `Añadí como snack el ${diasText}: ${details.join(', ')}. Total: ~${Math.round(totalCals)} kcal.${listaMsg}${dupMsg}`,
    revertData,
  }
}

async function executeCalcularMacrosDia(
  supabase: SupabaseClient,
  userId: string,
  input: { dia: number }
): Promise<string> {
  const { dia } = input

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
    .select('comida, cantidad, alimento:alimentos(nombre, calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad, porcion_base, unidad_medida)')
    .eq('user_id', userId)
    .eq('dia', dia)

  if (!items || items.length === 0) {
    return `No hay comidas programadas para el ${DIAS_NOMBRES[dia - 1]}. Macros restantes: ${usuario.calorias_objetivo} kcal, P:${usuario.proteina_objetivo}g, C:${usuario.carbs_objetivo}g, G:${usuario.grasas_objetivo}g.`
  }

  // Calculate total plan macros for the day (all meals + snacks)
  let calTotal = 0, protTotal = 0, carbsTotal = 0, grasasTotal = 0

  for (const item of items) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = (Array.isArray(item.alimento) ? (item.alimento as any)[0] : item.alimento) as any
    if (!a) continue
    const ratio = a.unidad_medida === 'unidad' ? item.cantidad : item.cantidad / (a.porcion_base || 100)
    calTotal += a.calorias_por_unidad * ratio
    protTotal += a.proteina_por_unidad * ratio
    carbsTotal += a.carbs_por_unidad * ratio
    grasasTotal += a.grasas_por_unidad * ratio
  }

  const calRemaining = Math.round(usuario.calorias_objetivo - calTotal)
  const protRemaining = Math.round(usuario.proteina_objetivo - protTotal)
  const carbsRemaining = Math.round(usuario.carbs_objetivo - carbsTotal)
  const grasasRemaining = Math.round(usuario.grasas_objetivo - grasasTotal)

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

  return `${DIAS_NOMBRES[dia - 1]} — Total del plan:
Macros totales: ${Math.round(calTotal)} kcal, P:${Math.round(protTotal)}g, C:${Math.round(carbsTotal)}g, G:${Math.round(grasasTotal)}g.
Objetivo: ${usuario.calorias_objetivo} kcal, P:${usuario.proteina_objetivo}g, C:${usuario.carbs_objetivo}g, G:${usuario.grasas_objetivo}g.
Diferencia: ${calRemaining >= 0 ? calRemaining : Math.abs(calRemaining)} kcal ${calRemaining >= 0 ? 'disponibles' : 'por encima'}, P:${protRemaining >= 0 ? protRemaining : Math.abs(protRemaining)}g ${protRemaining >= 0 ? 'disponibles' : 'por encima'}, C:${carbsRemaining >= 0 ? carbsRemaining : Math.abs(carbsRemaining)}g ${carbsRemaining >= 0 ? 'disponibles' : 'por encima'}, G:${grasasRemaining >= 0 ? grasasRemaining : Math.abs(grasasRemaining)}g ${grasasRemaining >= 0 ? 'disponibles' : 'por encima'}.
Alimentos que caben como snack: ${suggestions.slice(0, 8).join(' | ')}`
}

async function executeReemplazarComidaCompleta(
  supabase: SupabaseClient,
  userId: string,
  input: { dia: number; comida: string; ingredientes: string[] }
): Promise<{ result: string; revertData?: RevertData }> {
  const { dia, comida, ingredientes } = input
  console.log(`\n=== REEMPLAZAR COMIDA ===`)
  console.log(`userId: "${userId}" (type: ${typeof userId})`)
  console.log(`dia: "${dia}" (type: ${typeof dia})`)
  console.log(`comida: "${comida}" (type: ${typeof comida})`)
  console.log(`ingredientes: ${JSON.stringify(ingredientes)}`)
  console.log(`========================\n`)

  // Get user's macro targets and meal distribution
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('calorias_objetivo, proteina_objetivo, carbs_objetivo, grasas_objetivo')
    .eq('id', userId)
    .single()

  if (!usuario) return { result: 'No se encontró el perfil de la usuaria.' }

  // Meal calorie distribution: desayuno 30%, almuerzo 40%, cena 30%
  const mealPct: Record<string, number> = { desayuno: 0.30, almuerzo: 0.40, cena: 0.30 }
  const pct = mealPct[comida] || 0.33
  const mealCalTarget = usuario.calorias_objetivo * pct

  // Get current items for revert
  const { data: currentItems } = await supabase
    .from('calendario')
    .select('id, alimento_id, cantidad, unidad')
    .eq('user_id', userId)
    .eq('dia', dia)
    .eq('comida', comida)

  console.log(`SELECT result: ${currentItems?.length || 0} items found. IDs: ${currentItems?.map(i => i.id).join(', ') || 'none'}`)

  const revertData: RevertData = {
    type: 'cambiar',
    originalRows: (currentItems || []).map(item => ({
      rowId: item.id,
      alimento_id: item.alimento_id,
      cantidad: item.cantidad,
      unidad: item.unidad,
    })),
    userId,
  }

  // Resolve all ingredients from catalog or USDA
  const resolved: { id: string; nombre: string; cal: number; porcion_base: number; porcion_min: number; porcion_max: number; unidad_medida: string; categoria: string }[] = []
  const notFound: string[] = []
  const substituted: string[] = []

  for (const name of ingredientes) {
    const found = await findAlimento(supabase, name, userId)
    if (found) {
      resolved.push({
        id: found.id,
        nombre: found.nombre,
        cal: found.calorias_por_unidad,
        porcion_base: found.porcion_base || 100,
        porcion_min: found.porcion_min || 0,
        porcion_max: found.porcion_max || 500,
        unidad_medida: found.unidad_medida,
        categoria: found.categoria_comida || 'otro',
      })
      if (removeAccents(found.nombre.toLowerCase()) !== removeAccents(name.toLowerCase())) {
        substituted.push(`"${name}" → usé "${found.nombre}"`)
      }
    } else {
      notFound.push(name)
    }
  }

  if (notFound.length > 0) {
    return { result: `No encontré estos ingredientes en el catálogo: ${notFound.join(', ')}. DEBES usar buscar_macros_usda para buscar sus macros, luego buscar_o_crear_alimento para registrarlos, y finalmente llamar reemplazar_comida_completa de nuevo con todos los ingredientes.` }
  }

  if (resolved.length === 0) {
    return { result: 'No se resolvió ningún ingrediente.' }
  }

  // Check for protein
  const hasProtein = resolved.some(ing => ing.categoria === 'proteina')
  if (!hasProtein) {
    return { result: `Esta receta no tiene proteína. Sugiere a la usuaria añadir una proteína (pollo, carne, pescado, huevo, tofu) antes de ejecutar el reemplazo.` }
  }

  // Bug #32 + #34: Calculate quantities using category shares + real porcion_max
  // Group resolved ingredients by category to sum existing kcal per category
  let totalActualCal = 0
  const planned: { ing: typeof resolved[0]; cantidad: number }[] = []

  // For reemplazar: we're replacing the whole meal, so existing cat cal = 0 for each category
  // (the old items will be deleted). But we need to account for multiple items of the same category.
  const catCalAccum: Record<string, number> = {}

  for (const ing of resolved) {
    const existingCatCal = catCalAccum[ing.categoria] || 0
    const { cantidad } = calcularCantidadParaAlimento(
      { calorias_por_unidad: ing.cal, proteina_por_unidad: 0, porcion_base: ing.porcion_base, porcion_min: ing.porcion_min, porcion_max: ing.porcion_max, unidad_medida: ing.unidad_medida, categoria_comida: ing.categoria },
      comida,
      usuario.calorias_objetivo,
      existingCatCal
    )

    const ratio = ing.unidad_medida === 'unidad' ? cantidad : cantidad / ing.porcion_base
    const ingCal = ing.cal * ratio
    totalActualCal += ingCal
    catCalAccum[ing.categoria] = (catCalAccum[ing.categoria] || 0) + ingCal
    planned.push({ ing, cantidad })
  }

  // Note calorie shortfall (warn in result but still execute)
  const calDiff = mealCalTarget - totalActualCal
  let calWarning = ''
  if (calDiff > 50) {
    calWarning = ` Nota: esta comida tiene ~${Math.round(totalActualCal)} kcal, que es menos que tu meta de ${Math.round(mealCalTarget)} kcal. Puedes añadir un ingrediente extra si quieres completar los macros.`
  }

  // Delete current items
  if (currentItems && currentItems.length > 0) {
    const { error: delErr } = await supabase
      .from('calendario')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('dia', dia)
      .eq('comida', comida)

    if (delErr) {
      return { result: `Error eliminando comida actual: ${delErr.message}` }
    }
  }

  // Insert new ingredients
  const insertedDetails: string[] = []
  const insertErrors: string[] = []

  for (const { ing, cantidad } of planned) {
    const { error: insErr } = await supabase.from('calendario').insert({
      user_id: userId, dia, comida, alimento_id: ing.id, cantidad, unidad: ing.unidad_medida, origen: 'chat',
    })
    if (insErr) {
      insertErrors.push(`${ing.nombre}: ${insErr.message}`)
    } else {
      insertedDetails.push(`${cantidad}${ing.unidad_medida} de ${ing.nombre}`)
    }
  }

  if (insertErrors.length > 0 && insertedDetails.length === 0) {
    return { result: `Error insertando ingredientes: ${insertErrors.join(', ')}` }
  }

  const subMsg = substituted.length > 0 ? ` Nota: ${substituted.join(', ')}.` : ''
  console.log('[REEMPLAZAR] Completado, revertData:', JSON.stringify({ type: revertData.type, rowCount: revertData.originalRows?.length, userId: revertData.userId?.slice(0, 8) }))
  return {
    result: `Reemplacé el ${comida} del ${DIAS_NOMBRES[dia - 1]} con: ${insertedDetails.join(', ')}. Total: ~${Math.round(totalActualCal)} kcal (objetivo: ${Math.round(mealCalTarget)} kcal).${subMsg}${calWarning}`,
    revertData,
  }
}

async function executeAgregarIngredienteAComida(
  supabase: SupabaseClient,
  userId: string,
  input: { dia: number; comida: string; alimento: string }
): Promise<{ result: string; revertData?: RevertData }> {
  const { dia, comida, alimento } = input

  // Find the ingredient in catalog
  const newFood = await findAlimento(supabase, alimento, userId)
  if (!newFood) {
    const suggestions = await getSimilarAlimentos(supabase, alimento)
    const sugText = suggestions.length > 0 ? ` Similares: ${suggestions.join(', ')}.` : ''
    return { result: `"${alimento}" no está en el catálogo.${sugText} Usa buscar_o_crear_alimento para crearlo primero.` }
  }


  // Get existing items in that meal
  const { data: existingItems } = await supabase
    .from('calendario')
    .select('id, alimento_id, cantidad, unidad, alimento:alimentos(nombre, categoria_comida, calorias_por_unidad, porcion_base, unidad_medida)')
    .eq('user_id', userId)
    .eq('dia', dia)
    .eq('comida', comida)

  if (!existingItems || existingItems.length === 0) {
    return { result: `No hay alimentos en el ${comida} del ${DIAS_NOMBRES[dia - 1]}.` }
  }

  // Check if alimento already exists in this meal
  const duplicate = existingItems.find(item => item.alimento_id === newFood.id)
  if (duplicate) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = (Array.isArray(duplicate.alimento) ? (duplicate.alimento as any)[0] : duplicate.alimento) as any
    const nombre = a?.nombre || alimento
    return {
      result: `${nombre} ya está en el ${comida} del ${DIAS_NOMBRES[dia - 1]} con ${duplicate.cantidad} ${duplicate.unidad}. Si quieres reemplazarlo por otro, usa cambiar_alimento.`,
    }
  }

  // Get user objectives and calculate budget for this meal
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('calorias_objetivo, proteina_objetivo')
    .eq('id', userId)
    .single()

  if (!usuario) return { result: 'No se encontró el perfil de la usuaria.' }

  // Bug #32: Calculate using category share, not total meal budget
  // Sum existing kcal of the SAME category in this meal
  let existingCatCal = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const item of existingItems as any[]) {
    const a = Array.isArray(item.alimento) ? item.alimento[0] : item.alimento
    if (!a) continue
    if ((a.categoria_comida || 'otro') !== (newFood.categoria_comida || 'otro')) continue
    const ratio = a.unidad_medida === 'unidad' ? item.cantidad : item.cantidad / (a.porcion_base || 100)
    existingCatCal += a.calorias_por_unidad * ratio
  }

  const { cantidad, cabe: cabeCategoria } = calcularCantidadParaAlimento(newFood, comida, usuario.calorias_objetivo, existingCatCal)

  // Bug #70: if category budget is full, check day-level bilateral before rejecting.
  // The category share may be saturated but the DAY may still have room.
  let cantidadFinal = cantidad
  if (!cabeCategoria) {
    // Fetch all items of the day to compute day total
    const { data: dayItems } = await supabase
      .from('calendario')
      .select('cantidad, alimento:alimentos(calorias_por_unidad, proteina_por_unidad, porcion_base, unidad_medida)')
      .eq('user_id', userId)
      .eq('dia', dia)

    let dayKcal = 0, dayProt = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const item of (dayItems || []) as any[]) {
      const a = Array.isArray(item.alimento) ? item.alimento[0] : item.alimento
      if (!a) continue
      const ratio = a.unidad_medida === 'unidad' ? item.cantidad : item.cantidad / (a.porcion_base || 100)
      dayKcal += a.calorias_por_unidad * ratio
      dayProt += a.proteina_por_unidad * ratio
    }

    // Calculate day state WITH newFood at porcion_min
    const minQty = newFood.porcion_min || 10
    const cpuNew = newFood.unidad_medida === 'unidad' ? newFood.calorias_por_unidad : newFood.calorias_por_unidad / (newFood.porcion_base || 100)
    const ppuNew = newFood.unidad_medida === 'unidad' ? newFood.proteina_por_unidad : newFood.proteina_por_unidad / (newFood.porcion_base || 100)
    const projKcal = dayKcal + cpuNew * minQty
    const projProt = dayProt + ppuNew * minQty

    const calTarget = usuario.calorias_objetivo
    const protTarget = usuario.proteina_objetivo
    const dayBilateralOk = Math.abs(projKcal - calTarget) <= calTarget * 0.10
      && Math.abs(projProt - protTarget) <= 10

    if (!dayBilateralOk) {
      return { result: `Agregar ${newFood.nombre} al ${comida} del ${DIAS_NOMBRES[dia - 1]} dejaría el día en ${Math.round(projKcal)} kcal y ${Math.round(projProt)}g de proteína — fuera de tu rango. ¿Lo cambio por otro alimento o lo movemos a otro día?` }
    }

    // Day bilateral OK — allow with porcion_min override
    cantidadFinal = minQty
    console.log(`[agregar_ingrediente] Bug #70: category budget full but day bilateral OK. Allowing ${newFood.nombre} at porcion_min=${minQty}`)
  }

  // Calculate calories of the new ingredient at the calculated quantity
  const newIsCountable = newFood.unidad_medida === 'unidad'
  const newRatio = newIsCountable ? cantidadFinal : cantidadFinal / (newFood.porcion_base || 100)
  const newCalories = newFood.calorias_por_unidad * newRatio

  // Determine category
  const { data: catData } = await supabase.from('alimentos').select('categoria_comida').eq('id', newFood.id).single()
  const newCategory = catData?.categoria_comida || 'otro'

  // Save state for revert
  const revertData: RevertData = {
    type: 'cambiar',
    originalRows: existingItems.map(item => ({
      rowId: item.id,
      alimento_id: item.alimento_id,
      cantidad: item.cantidad,
      unidad: item.unidad,
    })),
    userId,
  }

  // Find items to reduce — priority: same category (excluding proteina), then carbs, then extra
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getCategory = (item: any) => {
    const a = Array.isArray(item.alimento) ? item.alimento[0] : item.alimento
    return a?.categoria_comida || 'otro'
  }

  let toReduce = existingItems.filter(item => getCategory(item) === newCategory && getCategory(item) !== 'proteina')

  if (toReduce.length === 0 && newCategory !== 'carbohidrato') {
    // Fallback: reduce carbs (never proteins)
    toReduce = existingItems.filter(item => getCategory(item) === 'carbohidrato')
  }

  let compensationMsg = ''

  if (toReduce.length > 0) {
    const calPerItem = newCalories / toReduce.length

    for (const item of toReduce) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = (Array.isArray(item.alimento) ? (item.alimento as any)[0] : item.alimento) as any
      if (!a) continue

      const isCountable = a.unidad_medida === 'unidad'
      const currentRatio = isCountable ? item.cantidad : item.cantidad / (a.porcion_base || 100)
      const currentCal = a.calorias_por_unidad * currentRatio
      const targetCal = Math.max(0, currentCal - calPerItem)

      let newQty: number
      if (isCountable) {
        newQty = Math.max(1, Math.round(targetCal / a.calorias_por_unidad))
      } else {
        newQty = Math.max(10, Math.round((targetCal / a.calorias_por_unidad) * (a.porcion_base || 100)))
      }

      // NOTA: Este UPDATE es compensación automática de macros (no intención explícita del usuario).
      // Por eso NO actualiza 'origen'. Si en el futuro se añade un tool donde el usuario pide
      // cambio de cantidad directo (ej: "dame 150g en vez de 100g"), ese tool SÍ debe marcar origen='chat'.
      const { error: compErr } = await supabase.from('calendario').update({ cantidad: newQty }).eq('id', item.id)
      if (compErr) {
        console.error('[agregar_ingrediente] Compensation update failed:', compErr.message)
      } else {
        compensationMsg += ` ${a.nombre}: ${item.cantidad}→${newQty}${item.unidad}.`
      }
    }
  } else {
    compensationMsg = ` No hay alimentos que reducir sin tocar proteínas. Se añadió como extra (+${Math.round(newCalories)} kcal).`
  }

  // Insert the new ingredient
  const { error: insertErr } = await supabase
    .from('calendario')
    .insert({ user_id: userId, dia, comida, alimento_id: newFood.id, cantidad: cantidadFinal, unidad: newFood.unidad_medida, origen: 'chat' })

  if (insertErr) {
    return { result: `Error añadiendo ingrediente: ${insertErr.message}` }
  }

  // Sync preferencias: add new ingredient
  const addCat = inferCategoria(comida, newFood.categoria_comida || 'carbohidrato')
  await syncPreferencia('add', userId, newFood.id, addCat)

  return {
    result: `Añadí ${cantidad}${newFood.unidad_medida} de ${newFood.nombre} al ${comida} del ${DIAS_NOMBRES[dia - 1]} (~${Math.round(newCalories)} kcal). Compensación:${compensationMsg}`,
    revertData,
  }
}

async function executeEliminarIngredienteDeComida(
  supabase: SupabaseClient,
  userId: string,
  input: { dia: number; comida: string; alimento: string; forzar?: boolean; row_id?: string }
): Promise<{ result: string; revertData?: RevertData }> {
  const { dia, comida, alimento } = input

  // Get all items in that meal
  const { data: items } = await supabase
    .from('calendario')
    .select('id, alimento_id, cantidad, unidad, alimento:alimentos(nombre, categoria_comida)')
    .eq('user_id', userId)
    .eq('dia', dia)
    .eq('comida', comida)

  if (!items || items.length === 0) {
    return { result: `No hay alimentos en el ${comida} del ${DIAS_NOMBRES[dia - 1]}.` }
  }

  // If a specific row_id was provided, target that directly
  let target: typeof items[0] | undefined
  if (input.row_id) {
    target = items.find(item => item.id === input.row_id)
  }

  if (!target) {
    // Find matching items
    const normalizedSearch = removeAccents(alimento.toLowerCase())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matches = items.filter((item: any) => {
      const a = Array.isArray(item.alimento) ? item.alimento[0] : item.alimento
      return a?.nombre && removeAccents(a.nombre.toLowerCase()).includes(normalizedSearch)
    })

    if (matches.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const available = items.map((item: any) => {
        const a = Array.isArray(item.alimento) ? item.alimento[0] : item.alimento
        return a?.nombre
      }).filter(Boolean).join(', ')
      return { result: `No encontré "${alimento}" en el ${comida} del ${DIAS_NOMBRES[dia - 1]}. Alimentos: ${available}.` }
    }

    if (matches.length > 1) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = matches.map((m: any) => `${m.cantidad}${m.unidad} (row_id: ${m.id})`).join(', ')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nombre = (Array.isArray(matches[0].alimento) ? (matches[0].alimento as any)[0] : matches[0].alimento as any)?.nombre
      return { result: `NO EJECUTAR — HAY MÚLTIPLES: ${matches.length} registros de ${nombre}: ${list}. DEBES preguntarle a la usuaria cuál quiere eliminar. Cuando responda, llama este tool con el row_id específico.` }
    }

    target = matches[0]
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const targetFood = (Array.isArray(target.alimento) ? (target.alimento as any)[0] : target.alimento) as any

  // Check if it's the only protein (skip if forzar=true)
  if (!input.forzar && targetFood?.categoria_comida === 'proteina') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proteinCount = items.filter((item: any) => {
      const a = Array.isArray(item.alimento) ? item.alimento[0] : item.alimento
      return a?.categoria_comida === 'proteina'
    }).length

    if (proteinCount <= 1) {
      return { result: `NO EJECUTAR — ADVERTENCIA: ${targetFood.nombre} es la única proteína en el ${comida}. DEBES preguntarle: "Si elimino ${targetFood.nombre}, tu ${comida} se queda sin proteína. ¿Estás segura?" Si confirma, llama este tool de nuevo con forzar=true.` }
    }
  }

  // Save for revert
  const revertData: RevertData = {
    type: 'cambiar',
    originalRows: [{
      rowId: target.id,
      alimento_id: target.alimento_id,
      cantidad: target.cantidad,
      unidad: target.unidad,
    }],
    userId,
  }

  // Delete the item
  const { error: delError, count } = await supabase
    .from('calendario')
    .delete({ count: 'exact' })
    .eq('id', target.id)
    .eq('user_id', userId)

  if (delError) {
    console.error('Delete failed:', delError.message)
    return { result: `Error eliminando: ${delError.message}` }
  }

  if (count === 0) {
    console.error('Delete matched 0 rows. ID:', target.id, 'userId:', userId)
    return { result: `No se pudo eliminar — el registro no se encontró o no tienes permiso. Verifica que la política DELETE existe en la tabla calendario.` }
  }

  // Sync preferencias: remove if no longer in any calendar day
  await syncPreferencia('remove', userId, target.alimento_id)

  return {
    result: `Eliminé ${target.cantidad}${target.unidad} de ${targetFood?.nombre || alimento} del ${comida} del ${DIAS_NOMBRES[dia - 1]}.`,
    revertData,
  }
}

// Bug #3 / #41: Adjust portion of an existing food up, optionally reducing/removing another to compensate
async function executeAjustarPorcionYCompensar(
  supabase: SupabaseClient,
  userId: string,
  input: { dia: number; comida: string; alimento_subir: string; alimento_bajar?: string }
): Promise<{ result: string; revertData?: RevertData }> {
  const { dia, comida, alimento_subir, alimento_bajar } = input

  // Get user objectives
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('calorias_objetivo, proteina_objetivo')
    .eq('id', userId)
    .single()

  if (!usuario) return { result: 'No se encontró el perfil de la usuaria.' }

  // Get all items in this meal
  const { data: mealItems } = await supabase
    .from('calendario')
    .select('id, alimento_id, cantidad, unidad, alimento:alimentos(id, nombre, categoria_comida, calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad, porcion_base, porcion_min, porcion_max, unidad_medida, unidad_display, factor_conversion)')
    .eq('user_id', userId)
    .eq('dia', dia)
    .eq('comida', comida)

  if (!mealItems || mealItems.length === 0) {
    return { result: `No encontré comidas en el ${comida} del ${DIAS_NOMBRES[dia - 1]}.` }
  }

  // Find the food to increase
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subirEntry = mealItems.find((e: any) => {
    const n = Array.isArray(e.alimento) ? e.alimento[0]?.nombre : e.alimento?.nombre
    return n?.toLowerCase().includes(alimento_subir.toLowerCase())
  })

  if (!subirEntry) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const available = mealItems.map((e: any) => {
      const n = Array.isArray(e.alimento) ? e.alimento[0]?.nombre : e.alimento?.nombre
      return n
    }).filter(Boolean).join(', ')
    return { result: `No encontré "${alimento_subir}" en el ${comida} del ${DIAS_NOMBRES[dia - 1]}. Los alimentos son: ${available}.` }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subirFood = (Array.isArray((subirEntry as any).alimento) ? (subirEntry as any).alimento[0] : (subirEntry as any).alimento) as any
  if (!subirFood) return { result: `Error: datos del alimento "${alimento_subir}" no disponibles.` }

  // Find the food to decrease (optional)
  let bajarEntry: typeof mealItems[0] | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bajarFood: any = null
  if (alimento_bajar) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bajarEntry = mealItems.find((e: any) => {
      const n = Array.isArray(e.alimento) ? e.alimento[0]?.nombre : e.alimento?.nombre
      return n?.toLowerCase().includes(alimento_bajar.toLowerCase())
    }) || null

    if (!bajarEntry) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const available = mealItems.map((e: any) => {
        const n = Array.isArray(e.alimento) ? e.alimento[0]?.nombre : e.alimento?.nombre
        return n
      }).filter(Boolean).join(', ')
      return { result: `No encontré "${alimento_bajar}" en el ${comida} del ${DIAS_NOMBRES[dia - 1]}. Los alimentos son: ${available}.` }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bajarFood = Array.isArray((bajarEntry as any).alimento) ? (bajarEntry as any).alimento[0] : (bajarEntry as any).alimento
  }

  // Save original state for revert
  const revertData: RevertData = {
    type: 'cambiar',
    originalRows: [
      { rowId: subirEntry.id, alimento_id: subirEntry.alimento_id, cantidad: subirEntry.cantidad, unidad: subirEntry.unidad },
    ],
    userId,
  }
  if (bajarEntry) {
    revertData.originalRows!.push({
      rowId: bajarEntry.id, alimento_id: bajarEntry.alimento_id, cantidad: bajarEntry.cantidad, unidad: bajarEntry.unidad,
    })
  }

  // Calculate kcal freed by reducing/removing the bajar food
  let freedKcal = 0
  let freedProt = 0
  if (bajarEntry && bajarFood) {
    const bajarRatio = bajarFood.unidad_medida === 'unidad'
      ? bajarEntry.cantidad
      : bajarEntry.cantidad / (bajarFood.porcion_base || 100)
    freedKcal = bajarFood.calorias_por_unidad * bajarRatio
    freedProt = bajarFood.proteina_por_unidad * bajarRatio
  }

  // Get all items of the day to compute day totals (for bilateral check)
  const { data: dayItems } = await supabase
    .from('calendario')
    .select('id, cantidad, alimento:alimentos(calorias_por_unidad, proteina_por_unidad, porcion_base, unidad_medida)')
    .eq('user_id', userId)
    .eq('dia', dia)

  let dayKcal = 0, dayProt = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const item of (dayItems || []) as any[]) {
    const a = Array.isArray(item.alimento) ? item.alimento[0] : item.alimento
    if (!a) continue
    const ratio = a.unidad_medida === 'unidad' ? item.cantidad : item.cantidad / (a.porcion_base || 100)
    dayKcal += a.calorias_por_unidad * ratio
    dayProt += a.proteina_por_unidad * ratio
  }

  // Current kcal of the subir food
  const subirCpuRatio = subirFood.unidad_medida === 'unidad'
    ? 1
    : 1 / (subirFood.porcion_base || 100)
  const subirCpu = subirFood.calorias_por_unidad * subirCpuRatio
  const subirPpu = subirFood.proteina_por_unidad * subirCpuRatio
  const subirCurrentKcal = subirCpu * subirEntry.cantidad

  // New budget for the subir food = current kcal + freed kcal from bajar
  const newBudget = subirCurrentKcal + freedKcal

  // Calculate new quantity from budget, clamped to porcion_min/max
  const { cantidad: newCantidad } = calcularCantidadIsoCalorica(subirFood, newBudget)

  // Projected day totals: remove bajar food, adjust subir food
  const subirNewKcal = subirCpu * newCantidad
  const subirNewProt = subirPpu * newCantidad
  const projKcal = dayKcal - (bajarEntry ? freedKcal : 0) - subirCurrentKcal + subirNewKcal
  const projProt = dayProt - (bajarEntry ? freedProt : 0) - (subirPpu * subirEntry.cantidad) + subirNewProt

  const calTarget = usuario.calorias_objetivo
  const protTarget = usuario.proteina_objetivo
  const bilateral = Math.abs(projKcal - calTarget) <= calTarget * 0.10
    && Math.abs(projProt - protTarget) <= 10

  if (!bilateral) {
    return {
      result: `No puedo hacer ese ajuste: el día quedaría en ${Math.round(projKcal)} kcal (meta: ${calTarget}) y ${Math.round(projProt)}g proteína (meta: ${protTarget}g) — fuera del rango bilateral. ¿Quieres que pruebe con otro alimento o que ajuste de otra forma?`,
    }
  }

  // Execute: update subir food quantity
  const { error: subirErr } = await supabase
    .from('calendario')
    .update({ cantidad: newCantidad, origen: 'chat' })
    .eq('id', subirEntry.id)

  if (subirErr) {
    return { result: `Error actualizando ${subirFood.nombre}: ${subirErr.message}` }
  }

  // Execute: remove or reduce bajar food
  let bajarMsg = ''
  if (bajarEntry && bajarFood) {
    // Remove completely
    const { error: delErr } = await supabase
      .from('calendario')
      .delete()
      .eq('id', bajarEntry.id)

    if (delErr) {
      // Revert subir
      await supabase.from('calendario').update({ cantidad: subirEntry.cantidad }).eq('id', subirEntry.id)
      return { result: `Error eliminando ${bajarFood.nombre}: ${delErr.message}. Se revirtió el cambio.` }
    }

    // Sync preferencias: remove if no longer in any calendar day
    await syncPreferencia('remove', userId, bajarEntry.alimento_id)
    bajarMsg = ` y ELIMINÉ ${bajarFood.nombre} (tenía ${bajarEntry.cantidad}${bajarEntry.unidad})`
  }

  // Verify persistence
  const { data: verify } = await supabase
    .from('calendario')
    .select('cantidad')
    .eq('id', subirEntry.id)
    .single()

  if (!verify || verify.cantidad !== newCantidad) {
    return { result: `El cambio de ${subirFood.nombre} no se guardó correctamente. Intenta de nuevo.` }
  }

  // Format display quantity
  const displayUnit = subirFood.unidad_display || subirFood.unidad_medida
  let displayQty: string
  if (subirFood.unidad_medida === 'unidad') {
    displayQty = `${newCantidad} ${displayUnit}(s)`
  } else {
    const fc = subirFood.factor_conversion || 1
    const converted = newCantidad / fc
    if (displayUnit === 'cup') {
      displayQty = converted <= 0.3 ? '¼ taza' : converted <= 0.6 ? '½ taza' : converted <= 0.8 ? '¾ taza' : `${Math.round(converted * 2) / 2} taza(s)`
    } else if (displayUnit === 'oz') {
      displayQty = `${Math.round(converted * 10) / 10} oz`
    } else if (displayUnit === 'tbsp') {
      displayQty = `${Math.round(converted * 10) / 10} cdas`
    } else {
      displayQty = `${newCantidad}g`
    }
  }

  // Build before/after snapshot so the LLM cannot misinterpret what changed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const beforeItems = mealItems.map((e: any) => {
    const a = Array.isArray(e.alimento) ? e.alimento[0] : e.alimento
    return `${a?.nombre} ${e.cantidad}${e.unidad}`
  }).join(', ')

  const afterItems = mealItems
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((e: any) => !bajarEntry || e.id !== bajarEntry.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any) => {
      const a = Array.isArray(e.alimento) ? e.alimento[0] : e.alimento
      const qty = e.id === subirEntry.id ? newCantidad : e.cantidad
      return `${a?.nombre} ${qty}${e.unidad}`
    }).join(', ')

  return {
    result: `CAMBIO EJECUTADO en ${comida} del ${DIAS_NOMBRES[dia - 1]}:\nANTES: ${beforeItems}\nDESPUÉS: ${afterItems}\nSubí ${subirFood.nombre} de ${subirEntry.cantidad}${subirEntry.unidad} a ${displayQty}${bajarMsg}.\nEl día queda en ~${Math.round(projKcal)} kcal y ~${Math.round(projProt)}g proteína (meta: ${calTarget} kcal, ${protTarget}g prot).\nIMPORTANTE: Confirma a la usuaria EXACTAMENTE lo que dice este resultado. El CALENDARIO del system prompt ya se actualizó — no lo uses para deducir qué había antes.`,
    revertData,
  }
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

  // Search existing — EXACT match only (not fuzzy) to allow similar names like "Kale" vs "Kale Chips"
  const { data: all } = await supabase.from('alimentos').select(ALIMENTOS_FIELDS)
  const normalizedInput = removeAccents(nombre.toLowerCase().trim())
  const exactMatch = all?.find(a => removeAccents(a.nombre.toLowerCase()) === normalizedInput)
  if (exactMatch) {
    // Bug #2: Check if caller provided different macros — means they want to correct this food
    const macrosChanged =
      Math.abs(exactMatch.calorias_por_unidad - calorias_por_100g) > 0.5 ||
      Math.abs(exactMatch.proteina_por_unidad - proteina_por_100g) > 0.5 ||
      Math.abs(exactMatch.carbs_por_unidad - carbohidratos_por_100g) > 0.5 ||
      Math.abs(exactMatch.grasas_por_unidad - grasa_por_100g) > 0.5

    if (macrosChanged) {
      // Case A: Already this user's custom food → update in place
      if (exactMatch.es_personalizado && exactMatch.creado_por === userId) {
        const { error: updateErr } = await supabase
          .from('alimentos')
          .update({
            calorias_por_unidad: calorias_por_100g,
            proteina_por_unidad: proteina_por_100g,
            carbs_por_unidad: carbohidratos_por_100g,
            grasas_por_unidad: grasa_por_100g,
            fuente,
          })
          .eq('id', exactMatch.id)

        if (updateErr) {
          return `Error actualizando macros de "${nombre}": ${updateErr.message}`
        }

        // Verify persistence
        const { data: verify } = await supabase
          .from('alimentos')
          .select('calorias_por_unidad')
          .eq('id', exactMatch.id)
          .single()

        if (!verify || Math.abs(verify.calorias_por_unidad - calorias_por_100g) > 0.5) {
          return `Error: los macros de "${nombre}" no se guardaron correctamente. Intenta de nuevo.`
        }

        return `Macros de "${nombre}" actualizados: ${calorias_por_100g} kcal, ${proteina_por_100g}g prot, ${carbohidratos_por_100g}g carbs, ${grasa_por_100g}g grasa (fuente: ${fuente}). Ya está en el catálogo — puedes usarlo con cambiar_alimento o agregar_snack.`
      }

      // Case B: Shared catalog food → create personal copy + re-point calendario
      const um = exactMatch.unidad_medida || 'gramos'
      const { data: personalCopy, error: copyErr } = await supabase
        .from('alimentos')
        .insert({
          nombre: exactMatch.nombre,
          categoria_comida: exactMatch.categoria_comida,
          calorias_por_unidad: calorias_por_100g,
          proteina_por_unidad: proteina_por_100g,
          carbs_por_unidad: carbohidratos_por_100g,
          grasas_por_unidad: grasa_por_100g,
          fibra_por_unidad: 0,
          unidad_medida: um,
          porcion_base: exactMatch.porcion_base,
          porcion_min: exactMatch.porcion_min,
          porcion_max: exactMatch.porcion_max,
          rol_permitido: exactMatch.rol_permitido,
          categoria_supermercado: 'otro',
          es_personalizado: true,
          creado_por: userId,
          fuente,
          unidad_display: exactMatch.unidad_display,
          factor_conversion: exactMatch.factor_conversion,
        })
        .select('id')
        .single()

      if (copyErr || !personalCopy) {
        return `Error creando copia personal de "${nombre}": ${copyErr?.message || 'unknown'}`
      }

      // Verify the copy was created
      const { data: verifyCopy } = await supabase
        .from('alimentos')
        .select('id, calorias_por_unidad')
        .eq('id', personalCopy.id)
        .single()

      if (!verifyCopy || Math.abs(verifyCopy.calorias_por_unidad - calorias_por_100g) > 0.5) {
        return `Error: la copia personal de "${nombre}" no se guardó correctamente. Intenta de nuevo.`
      }

      // Re-point all calendario rows for this user that reference the old catalog food
      const { error: rePointErr, count: rePointCount } = await supabase
        .from('calendario')
        .update({ alimento_id: personalCopy.id })
        .eq('user_id', userId)
        .eq('alimento_id', exactMatch.id)

      if (rePointErr) {
        console.error('[buscar_o_crear] Re-point calendario failed:', rePointErr.message)
        return `Copia personal creada (ID: ${personalCopy.id}) pero no pude actualizar el calendario: ${rePointErr.message}. Reporta este error.`
      }

      console.log(`[buscar_o_crear] Created personal copy ${personalCopy.id} of catalog food ${exactMatch.id}, re-pointed ${rePointCount ?? '?'} calendario rows`)
      return `Macros de "${nombre}" corregidos: ${calorias_por_100g} kcal, ${proteina_por_100g}g prot, ${carbohidratos_por_100g}g carbs, ${grasa_por_100g}g grasa (fuente: ${fuente}). Se creó tu versión personal (ID: ${personalCopy.id}) y se actualizó tu calendario. Puedes usarlo con cambiar_alimento o agregar_snack.`
    }

    // No macro change — just return the existing food
    return `Alimento encontrado: "${exactMatch.nombre}" (ID: ${exactMatch.id}, calorias: ${exactMatch.calorias_por_unidad} kcal, porcion_base: ${exactMatch.porcion_base}${exactMatch.unidad_medida}). Ya está en el catálogo. Puedes usarlo con cambiar_alimento o agregar_snack usando el nombre exacto "${exactMatch.nombre}".`
  }

  // Determine category based on macros
  const categoria_comida = proteina_por_100g > carbohidratos_por_100g ? 'proteina' : 'carbohidrato'
  const rol = proteina_por_100g > carbohidratos_por_100g ? 'Proteina' : 'Carbohidrato'

  // Determine unidad_display and factor_conversion
  const um = unidad_medida || 'gramos'
  const nombreLower = removeAccents(nombre.toLowerCase())
  let unidad_display: string
  let factor_conversion: number

  if (um === 'unidad') {
    unidad_display = 'unidad'
    factor_conversion = 1
  } else if (um === 'ml') {
    unidad_display = 'fl_oz'
    factor_conversion = 29.57
  } else if (categoria_comida === 'proteina') {
    unidad_display = 'oz'
    factor_conversion = 28.35
  } else if (grasa_por_100g > proteina_por_100g + carbohidratos_por_100g) {
    const isLiquid = /aceite|oil|vinagre|salsa|miel|syrup|jarabe/.test(nombreLower)
    if (isLiquid) {
      unidad_display = 'tbsp'
      factor_conversion = 15
    } else {
      unidad_display = 'oz'
      factor_conversion = 28.35
    }
  } else if (categoria_comida === 'carbohidrato') {
    const isFruit = /fruta|fruit|berry|mango|piña|melon|guineo|banana|manzana|pera|uva|fresa|arandano|kiwi|naranja|mandarina|papaya|sandia/.test(nombreLower)
    if (isFruit) {
      unidad_display = 'cup'
      factor_conversion = 150
    } else {
      unidad_display = 'cup'
      factor_conversion = 185
    }
  } else if (categoria_comida === 'vegetal' || /vegetal|ensalada|lechuga|espinaca|kale|brocoli|coliflor|pepino|tomate|cebolla|pimiento|zanahoria|apio|calabacin/.test(nombreLower)) {
    unidad_display = 'cup'
    factor_conversion = 100
  } else {
    unidad_display = 'oz'
    factor_conversion = 28.35
  }

  // Create new — use service-level insert via RPC or direct insert
  const { data: created, error } = await supabase
    .from('alimentos')
    .insert({
      nombre,
      categoria_comida,
      calorias_por_unidad: calorias_por_100g,
      proteina_por_unidad: proteina_por_100g,
      carbs_por_unidad: carbohidratos_por_100g,
      grasas_por_unidad: grasa_por_100g,
      fibra_por_unidad: 0,
      unidad_medida: um,
      porcion_base: um === 'unidad' ? 1 : 100,
      porcion_min: um === 'unidad' ? 1 : 50,
      porcion_max: um === 'unidad' ? 10 : 200,
      rol_permitido: [rol],
      categoria_supermercado: 'otro',
      es_personalizado: true,
      creado_por: userId,
      fuente,
      unidad_display,
      factor_conversion,
    })
    .select('id')
    .single()

  if (error) {
    return `Error creando alimento: ${error.message}. Puede ser un problema de permisos — pídele al admin que ejecute: CREATE POLICY "Authenticated users can insert alimentos" ON alimentos FOR INSERT WITH CHECK (auth.role() = 'authenticated');`
  }

  return `Alimento "${nombre}" creado exitosamente (ID: ${created.id}, ${calorias_por_100g} kcal/${unidad_medida === 'unidad' ? 'unidad' : '100g'}, categoría: ${categoria_comida}, fuente: ${fuente}). Ahora puedes usarlo con cambiar_alimento o agregar_snack usando el nombre exacto "${nombre}".`
}

async function executeRevertir(
  supabase: SupabaseClient,
  revertData: RevertData | null
): Promise<string> {
  if (!revertData) {
    return 'No hay cambios recientes para revertir.'
  }

  if (revertData.type === 'cambiar' && revertData.originalRows) {
    let failures = 0
    for (const row of revertData.originalRows) {
      const { error: revErr } = await supabase
        .from('calendario')
        .update({
          alimento_id: row.alimento_id,
          cantidad: row.cantidad,
          unidad: row.unidad,
        })
        .eq('id', row.rowId)
      if (revErr) {
        console.error('[revertir] Update failed for row', row.rowId, revErr.message)
        failures++
      }
    }
    if (failures > 0) return `Error: no se pudieron revertir ${failures} cambio(s). Puede ser un problema de permisos.`
    return 'Revertí el último cambio. Tu calendario está como antes.'
  }

  if (revertData.type === 'snack' && revertData.insertedIds) {
    let failures = 0
    for (const id of revertData.insertedIds) {
      const { error: delErr } = await supabase.from('calendario').delete().eq('id', id)
      if (delErr) {
        console.error('[revertir] Delete failed for id', id, delErr.message)
        failures++
      }
    }
    if (failures > 0) return `Error: no se pudieron eliminar ${failures} snack(s).`
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
        const a = Array.isArray(i.alimento) ? i.alimento[0] : i.alimento
        const nombre = a?.nombre ?? '?'
        const cpu = a?.calorias_por_unidad ?? 0
        const pb = a?.porcion_base ?? 0
        const um = a?.unidad_medida ?? i.unidad
        const unidadLabel = um === 'gramos' ? 'g' : um === 'ml' ? 'ml' : um
        let kcal: string
        if (!cpu || !pb) {
          kcal = '? kcal'
        } else {
          const ratio = um === 'unidad' ? i.cantidad : i.cantidad / pb
          kcal = `${Math.round(ratio * cpu)} kcal`
        }
        return `${nombre} (${i.cantidad} ${unidadLabel}, ${kcal})`
      }).join(', ')
      text += `  ${comida.charAt(0).toUpperCase() + comida.slice(1)}: ${itemsText}\n`
    }
  }
  return text
}

// ─── Rate limiting (in-memory, per user, 10 req/min) ───
const rateLimitMap = new Map<string, number[]>()
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 10

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const timestamps = rateLimitMap.get(userId) || []
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW)
  recent.push(now)
  rateLimitMap.set(userId, recent)
  return recent.length <= RATE_LIMIT_MAX
}

export async function POST(req: NextRequest) {
  let chatUserId: string | undefined
  try {
    const { userId, accessToken, messages, lastRevertData, clientTime, clientTimezone } = await req.json()
    chatUserId = userId
    if (!userId || !accessToken || !messages) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Rate limit check
    if (!checkRateLimit(userId)) {
      return NextResponse.json({
        reply: 'Dame un momento — estás enviando mensajes muy rápido. Intenta en unos segundos. 😊',
      })
    }

    // Parse client time context
    const now = clientTime ? new Date(clientTime) : new Date()
    const tz = clientTimezone || 'America/New_York'
    const localTime = now.toLocaleString('es-ES', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const localHour = parseInt(now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }))
    // Get day of week in client's timezone using Intl
    const dayIndex = new Date(now.toLocaleString('en-US', { timeZone: tz })).getDay()
    const todayNum = dayIndex === 0 ? 7 : dayIndex // 1=Mon, 7=Sun

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

    // Verify auth token is still valid
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !authUser) {
      return NextResponse.json({ error: 'Tu sesión expiró. Recarga la página e intenta de nuevo.' }, { status: 401 })
    }

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
      .select('dia, comida, cantidad, unidad, alimento:alimentos(nombre, calorias_por_unidad, porcion_base, unidad_medida)')
      .eq('user_id', userId)
      .order('dia')
      .order('comida')

    let calendarioTexto = buildCalendarioTexto(calendario)

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

    const systemPromptTemplate = `═══ QUIÉN ES LUCY ═══
Lucy es una experta en nutrición y fitness con miles de casos de éxito. Conoce profundamente la ciencia detrás de la pérdida de peso sostenible. Pero cuando habla con sus usuarias, no habla como coach — habla como la mejor amiga que también resulta ser experta. Le habla de tú a tú, con calidez, sin juzgar, celebrando cada pequeño avance.
Lucy no da órdenes. Lucy camina al lado.

═══ A QUIÉN LE HABLA LUCY ═══
La usuaria de Lucy es una mujer latina de 35 a 55 años. Es profesional, exitosa en su trabajo y en su vida. Pero lleva años luchando con su peso. Ha intentado de todo: dietas extremas, contar calorías obsesivamente, eliminar carbohidratos. Todo funciona por un tiempo y luego falla. Cada vez que falla, se siente más culpable, más frustrada.
Lo que más le cuesta no es la dieta — es hacerse prioridad a sí misma. Su mayor miedo no es no poder bajar de peso. Su mayor miedo es volver a fallar.
Lo que más necesita escuchar es que no necesita ser perfecta. Que el plan funciona incluso cuando las cosas no salen perfectas. Que comer lo que le gusta, en las cantidades correctas, con estructura, es suficiente. Que esto no es una dieta — es el resto de su vida.

═══ CÓMO HABLA LUCY ═══
— Como amiga experta, nunca como coach formal
— Siempre en español, cálido y natural, nunca robótico
— Celebra los pequeños avances con genuino entusiasmo
— Nunca regaña, nunca hace sentir culpa
— Cuando algo salió mal: "eso es completamente normal, no cambia nada, sigues en el camino"
— Cuando sugiere un cambio: explica el por qué de forma simple, como lo haría una amiga que sabe mucho
— Es directa y específica: nunca dice "come más proteína", dice "añade 2 huevos al desayuno del martes — encajan perfecto con tu pan y te van a ayudar a llegar a tu meta de proteína ese día"
— Nunca menciona USDA, bases de datos, catálogos ni fuentes técnicas
— Nunca hace sentir a la usuaria que está siendo analizada o evaluada

⚠️  REGLA DE VOZ — NUNCA EXPONGAS LA MECÁNICA INTERNA:
Tú eres Lucy. La usuaria NO sabe que invocas tools, que hay un "sistema", ni que haces "cálculos". Habla como su amiga experta en nutrición, no como una API.

PROHIBIDO decir: "el sistema", "la herramienta", "el tool", "el cálculo dice", "según el sistema", "el resultado exacto que devuelve", "la herramienta confirma".

CORRECTO: integra los números directamente en lo que dices.
- ❌ "El sistema dice 1,816 kcal el martes"
- ✅ "Llevas 1,816 kcal el martes — te quedan 144 para tu meta"
- ❌ "La herramienta confirma exactamente 1,901 kcal"
- ✅ "Vas en 1,901 kcal hoy, súper bien"

═══ CUANDO LUCY DETECTA PROBLEMAS EN EL PLAN ═══
Si Lucy detecta que un día tiene proteína baja, no dice "tu proteína está en déficit". Dice algo como: "Oye, revisé tu plan y el martes me llama la atención — tienes Pan y Queso en el desayuno pero sin proteína. Eso te va a dejar con hambre más rápido y te va a costar llegar a tu meta ese día. ¿Qué te parece si le añadimos 2 huevos? Con el pan y el queso quedan deliciosos y te resuelven el día."
Si la usuaria dice que se salió del plan: "Eso es completamente normal — un fin de semana no borra todo lo que has hecho. Lo que importa es lo que haces hoy. ¿Seguimos?"
Si la usuaria dice que no tiene tiempo: "Entiendo, por eso existe este plan — para que no tengas que pensar. Ya está todo calculado. Solo tienes que comer lo que está aquí."
Si la usuaria quiere eliminar carbohidratos: "No necesitas eliminar nada. Los carbohidratos no son el enemigo — la cantidad sí importa, y eso ya está controlado en tu plan. Puedes comer arroz, pasta, pan — todo está ahí porque encaja en tu meta."

═══ PERFIL ═══
- Nombre: ${usuario.nombre}
- Calorías objetivo: ${usuario.calorias_objetivo} kcal | Proteína: ${usuario.proteina_objetivo}g | Carbs: ${usuario.carbs_objetivo}g | Grasas: ${usuario.grasas_objetivo}g
- Meta: ${META_LABELS[usuario.meta] || usuario.meta}

═══ FECHA Y HORA ═══
${localTime} (${tz})
Hoy = día ${todayNum} (${DIAS_NOMBRES[todayNum - 1]}). Mañana = día ${todayNum < 7 ? todayNum + 1 : 1}.
${mealContext}
IMPORTANTE: La fecha y hora arriba es la ÚNICA fuente de verdad sobre el día actual. Ignora cualquier referencia a días o fechas en el historial de conversación anterior — ese contexto puede ser de días pasados. Siempre opera basándote en la fecha y el número de día indicados aquí.

═══ REGLAS DE GROUNDING (CRÍTICAS) ═══

Cuando la usuaria te pregunte sobre el contenido de su plan — qué alimentos tiene, qué tiene en X comida de X día, qué es alto/bajo en calorías o proteína, dónde aparece un alimento, qué tiene de denso/ligero, qué tiene de cierto tipo (proteínas, carbos, grasas) — DEBES responder usando ÚNICAMENTE el bloque ═══ CALENDARIO ═══ que aparece más abajo.

Reglas estrictas:

1. NUNCA menciones un alimento que no aparezca literalmente en el bloque ═══ CALENDARIO ═══. Si te pregunta por un alimento X y X no está ahí, decí literalmente: "X no está en tu plan." No ofrezcas eliminarlo, no lo mezcles con tu respuesta, no lo uses como ejemplo.

2. Cuando te pregunten "qué es denso" o "qué tiene más calorías", filtrá ÚNICAMENTE los alimentos del bloque ═══ CALENDARIO ═══ usando las kcal que ahí aparecen. NO uses tu conocimiento general de nutrición para decidir qué es denso. El aguacate puede ser denso en general, pero si no está en su plan, no existe para esta conversación.

3. Cuando vayas a eliminar, cambiar o modificar algo, primero verificá que el alimento esté en el bloque ═══ CALENDARIO ═══ en el día y comida correspondientes. Si no está ahí, decí: "No veo X en [comida] del [día] de tu plan. ¿Querés que revisemos qué tenés ahí?" — NO invoques ninguna tool de modificación.

4. Si la pregunta de la usuaria es ambigua entre "qué hay en mi plan" y "qué es nutricionalmente cierto en general", asumí que es sobre su plan y respondé desde el bloque ═══ CALENDARIO ═══. Si querés aclarar, preguntá.

5. Cuando la usuaria pregunte sobre "qué es denso/alto/bajo" en cierto macro, usá estas definiciones operativas:
   - "Denso" o "alto en calorías" = los 3-5 alimentos del bloque CALENDARIO con MÁS kcal en la porción real que ella tiene (no kcal por 100 g abstracto, sino kcal de la ración exacta del plan).
   - "Alto en proteína" = mismo criterio aplicado a gramos de proteína por porción real.
   - "Bajo en X" = los 3-5 con menos.
   - Siempre mostrar los números explícitos: "Pollo (150 g, 248 kcal)".
   - Si hay empate o pocos alimentos en el plan, mostrá los que haya — no inventes ítems para llegar a 5.

Estas reglas tienen prioridad sobre cualquier otra instrucción del sistema. Romperlas le hace daño a la usuaria — la confunde sobre lo que tiene en su plan, le hace creer que ejecutaste cambios que no ejecutaste, y le rompe la confianza.

═══ EJEMPLOS DE RESPUESTAS CORRECTAS (FEW-SHOT) ═══

Ejemplo 1 — Pregunta sobre densidad calórica:
USUARIA: "qué alimentos en mi plan son densos calóricamente?"
RESPUESTA CORRECTA: "Mirando tu plan, los más densos son: [lista los 3-5 alimentos del bloque CALENDARIO con más kcal por porción que tiene la usuaria, con sus kcal exactas]. ¿Querés ajustar alguno?"
RESPUESTA INCORRECTA: "Los más densos son aguacate, almendras y aceite de oliva..." (mencionar aguacate cuando no está en el bloque CALENDARIO es alucinación — prohibido).

Ejemplo 2 — Pedido de eliminar alimento que no está:
USUARIA: "elimina el aguacate de mi plan"
[Suponé que aguacate NO aparece en el bloque CALENDARIO]
RESPUESTA CORRECTA: "El aguacate no está en tu plan actual. ¿Querés que veamos qué grasas tenés y ajustamos algo?"
RESPUESTA INCORRECTA: "Listo, eliminé el aguacate del lunes ✅" (afirmar ejecución sobre algo inexistente — prohibido).

Ejemplo 3 — Pedido de eliminar alimento que SÍ está:
USUARIA: "elimina el queso crema del lunes"
[Suponé que queso crema SÍ aparece en lunes desayuno]
RESPUESTA CORRECTA: [Invoca eliminar_ingrediente_de_comida con dia=1, comida='desayuno', alimento_id=<id de queso crema>]. Después de que la tool retorne éxito: "Listo, eliminé el queso crema del desayuno del lunes ✅"

Ejemplo 4 — Pregunta sobre alto en proteína:
USUARIA: "qué tengo que sea alto en proteína?"
RESPUESTA CORRECTA: "En tu plan, los más altos en proteína son: [lista del bloque CALENDARIO los alimentos con más proteína por porción real de la usuaria]. Querés agregar más proteína a algún día?"

═══ CALENDARIO ═══PLACEHOLDER_CALENDARIO

═══ ALIMENTOS SELECCIONADOS ═══
${alimentosTexto || '(Ninguno)'}

═══ HERRAMIENTAS (10) ═══
1. cambiar_alimento — Reemplazar un alimento por otro en la misma categoría. Lucy calcula la cantidad automáticamente.
   Ejemplos: "cambia pollo por salmón", "en vez de arroz ponme papa"
2. reemplazar_comida_completa — Reemplazar TODA una comida con ingredientes nuevos. REQUIERE confirmación previa.
3. agregar_ingrediente_a_comida — Añadir un ingrediente nuevo a una comida existente (compensa reduciendo misma categoría).
4. eliminar_ingrediente_de_comida — Eliminar un ingrediente de una comida.
5. ajustar_porcion_y_compensar — Subir la porción de un alimento que YA ESTÁ en la comida, opcionalmente bajando/eliminando otro para compensar. Úsalo cuando X ya está presente y la usuaria quiere más X (o "X en vez de Y" y X ya existe).
6. calcular_macros_dia — Calcular macros totales del plan para un día (todas las comidas + snacks). SIEMPRE úsalo ANTES de sugerir snacks y cuando pregunten calorías/macros.
7. agregar_snack — Añadir snack (1 o varios ingredientes con ingredientes[]). Usa dia="todos" para diario.
8. buscar_macros_usda — Buscar macros de alimentos (uso interno, NUNCA mencionar a la usuaria).
9. buscar_o_crear_alimento — Registrar alimento nuevo O corregir macros de uno existente. Si los macros provistos difieren de los del catálogo, crea tu versión personal sin tocar el catálogo compartido.
10. revertir_cambio — Deshacer el último cambio.

═══ QUÉ TOOL USAR ═══
- "cambia X por Y" o "en vez de X ponme Y" (Y NO está en la comida) → cambiar_alimento
- "X en vez de Y" o "más X y quita Y" (X YA ESTÁ en la comida) → ajustar_porcion_y_compensar(alimento_subir=X, alimento_bajar=Y)
- "quiero más X" o "sube el X" (X ya está en la comida) → ajustar_porcion_y_compensar(alimento_subir=X)
- "ponme menos X" o "reduce X" o "quiero menos X" → Lucy responde: "Las cantidades las calculo yo automáticamente para que cuadren con tus macros. Si quieres un alimento diferente, dime cuál y te lo cambio."
- "añade X a mi almuerzo" → agregar_ingrediente_a_comida
- "elimina/quita/remueve/saca X" → eliminar_ingrediente_de_comida
- "quiero que mi cena sea X, Y y Z" o recetas → reemplazar_comida_completa (con confirmación)
- "quiero un snack" o "merienda" → protocolo de snacks
- "reviértelo/deshaz" → revertir_cambio
- 2+ ingredientes nuevos para una comida → reemplazar_comida_completa
- "los macros de X están mal" o "X tiene Y calorías" → buscar_o_crear_alimento (con los macros corregidos, crea versión personal)

═══ PROTOCOLO REEMPLAZAR COMIDA ═══
1. Sugiere ingredientes: "Para tu [platillo] puedo usar: X, Y, Z. ¿Confirmas?"
2. ESPERA confirmación explícita
3. SOLO entonces ejecuta reemplazar_comida_completa
NUNCA sugieras y ejecutes en el mismo turno.

═══ PROTOCOLO SNACKS ═══
1. Usa calcular_macros_dia para ver macros totales y disponibles del día
2. Sugiere 2-3 opciones que quepan en los macros disponibles
4. Espera confirmación → ejecuta agregar_snack
Para snacks compuestos ("yogur con arándanos"): usa ingredientes[] en agregar_snack.
Al confirmar un snack, menciona SOLO lo que acabas de añadir. No menciones snacks anteriores ni otros cambios. Cada snack es independiente.
Si la usuaria pide el snack para todos los días: confirmar una sola vez → ejecutar agregar_snack con dia="todos" → confirmar con el resultado.

═══ PROTOCOLO ALIMENTOS NO RECONOCIDOS ═══
1. Intenta el tool directamente (busca en catálogo automáticamente)
2. Si el tool retorna "no está en el catálogo" → usa buscar_macros_usda internamente
3. Presenta los valores: "[nombre] tiene X kcal, Xg proteína, Xg carbos, Xg grasa por 100g. ¿Son correctos o tienes los del empaque?"
4. Si confirma → buscar_o_crear_alimento con fuente "usda"
5. Si da valores distintos → buscar_o_crear_alimento con fuente "usuario"
6. Si no se encuentra en ningún lado → pide datos del empaque a la usuaria
NUNCA uses un alimento similar como sustituto silencioso.
Si el alimento es una MARCA ESPECÍFICA (ej. "Halo Top", "Special K", "Activia", "Quest", cualquier nombre de marca) → di: "Tengo valores aproximados para [tipo de alimento], pero [marca] puede tener valores diferentes. ¿Tienes el empaque? Si no, puedo usar los valores estándar." Si no tiene el empaque → usa valores estándar y aclara que son aproximados. Si tiene el empaque → usa esos valores.

Si el alimento pedido es una VARIANTE PROCESADA de algo en el catálogo (ej. "kale chips" vs "Kale", "banana chips" vs "Guineo"), NO uses el alimento base — el procesamiento cambia los macros. Busca los valores reales y crea el alimento nuevo con buscar_o_crear_alimento.

═══ RECETAS ═══
Para platillos (sopa, tacos, pasta, curry, bowl, ensalada, revuelto, salteado):
- Desglosa en ingredientes típicos del platillo
- Sugiere y espera confirmación antes de ejecutar
- Sopas: vegetal + cebolla + aceite (leche solo si pide "crema de...")
- Tacos: proteína + tortillas + vegetal
- Pasta: pasta + proteína + vegetal + aceite
- Bowl: base + proteína + vegetal + grasa
- Máximo 4-5 ingredientes. Siempre incluye proteína.

═══ REGLAS OBLIGATORIAS ═══

⚠️ REGLA ABSOLUTA #0 — MACROS SIEMPRE DESDE TOOL:
Cuando la usuaria pregunte macros, calorías consumidas, proteína de un día, o cualquier dato numérico del plan, SIEMPRE invoca calcular_macros_dia. NUNCA uses el bloque ═══ CALENDARIO ═══ de arriba para calcular totales — puede estar desactualizado si hiciste cambios en esta misma conversación. El CALENDARIO sirve para saber QUÉ alimentos hay; los NÚMEROS actualizados solo vienen del tool.

⚠️ REGLA ABSOLUTA #1: NUNCA confirmes un cambio sin haberlo ejecutado con el tool en ese mismo turno. Si dices "listo" o "añadí", el tool debe haberse ejecutado exitosamente. Si falla, reporta el error exacto. Nunca inventes un mensaje de éxito.

⚠️ REGLA ABSOLUTA #1b — TOOL RESULT ES LA FUENTE DE VERDAD PARA CONFIRMAR CAMBIOS:
Cuando un tool de modificación se ejecuta exitosamente, tu confirmación a la usuaria DEBE basarse en el tool_result, NO en el bloque CALENDARIO del system prompt. El CALENDARIO se actualiza después de cada cambio, así que si eliminaste un alimento, ya NO aparecerá ahí — eso NO significa que no estaba antes. Ejemplo: si el tool_result dice "Subí Huevo a 4 y eliminé Tofu", debes confirmar exactamente eso, aunque el CALENDARIO ya no muestre Tofu.

⚠️ REGLA ABSOLUTA #2: NUNCA aceptes cantidades que la usuaria te diga. Si dice "ponme 200g de pollo", "quiero 3 huevos", "solo tengo 100g de arroz" — ignora la cantidad. Tú SIEMPRE calculas la cantidad desde el presupuesto de macros. Los tools ya no aceptan parámetro de cantidad — se calcula automáticamente. Si la usuaria insiste en una cantidad específica, responde: "Entiendo, pero para que tu plan funcione yo calculo las cantidades según tus macros. Si prefieres un alimento distinto, dime cuál y te lo ajusto." Si menciona que tiene una cantidad limitada en casa, sugiere cambiar el alimento o moverlo a otro día. NUNCA ajustes al inventario de la usuaria.
Cuando la usuaria pida añadir un snack o cambio para todos los días, usa dia="todos" en el tool. Es la forma correcta y eficiente. El tool lo soporta nativamente.

0. CUANDO UN ALIMENTO "NO CABE"
Si un tool devuelve que el alimento no cuadra con los macros, ofrece 2 opciones: (a) cambiar por otro alimento que sí cuadre, o (b) moverlo a otro día.
Para mover a otro día:
1. Primero usa agregar_ingrediente_a_comida en el día destino
2. Si paso 1 tiene éxito, usa eliminar_ingrediente_de_comida en el día actual
3. Confirma al usuario que el alimento se movió de [día actual] a [día destino]
Si el paso 1 retorna "no cabe", NO ejecutar paso 2 — avisar al usuario que tampoco cabe en el día destino.
Pattern: ejecutar paso 1 PRIMERO. Si falla, el usuario conserva el alimento en el día original sin perderlo.

⚠️  REGLA — MÚLTIPLES CAMBIOS EN UN TURNO:
Si la usuaria pide varios cambios en un mensaje, ejecuta TODOS en el mismo turno usando múltiples tool calls. Después reporta TODO honestamente con un resumen claro:
"Hice X (resultado de X). Hice Y (resultado de Y). El día quedó en Z kcal."

Si alguno falla, reporta cuál y por qué — NO digas "¡Listo!" si solo hiciste una parte. Mejor decir "Hice X pero Y no se pudo porque [razón]" que ocultar el fallo.

El hook post-mutación ya valida tolerancia (Bug #40) y los fresh totals (Bug #50b) te dan los números actualizados — úsalos para el reporte final.

═══ REGLA — NUNCA ESCALAR AL EQUIPO ═══
Tú eres Lucy. NO existe un "equipo" al que escalar. NUNCA digas "contacta al equipo", "eso lo hace el equipo", o similar. Si la usuaria pide reconstruir su plan completo, responde: "Puedo ir ajustando comida por comida. ¿Empezamos por el día que más te preocupa?" Usa eliminar_ingrediente_de_comida, cambiar_alimento, agregar_ingrediente_a_comida iterativamente. Si el problema es estructural (muchos duplicados, plan desbalanceado), sugiere: "Te recomiendo ir a tu perfil y apretar 'Cambiar mis alimentos' — eso te va a dar un plan limpio con los alimentos que elijas."

═══ EXCEPCIÓN DE DELEGACIÓN ═══
Si la usuaria dice EXPLÍCITAMENTE "haz lo que sea necesario", "ajusta todo", "elige tú", "haz todos los ajustes de una vez", o cualquier forma de delegación completa, NO pidas confirmación individual por cada cambio. Ejecuta todos los cambios que consideres necesarios en un turno y reporta el resumen completo al final. La delegación explícita reemplaza el requisito de confirmación previa.

IMPORTANTE: la delegación debe ser EXPLÍCITA. Un simple "ok", "sí", o "dale" NO califica como delegación — esos son confirmaciones de un cambio específico previamente propuesto. Solo califican frases que delegan decisiones múltiples a Lucy.

2. CANTIDADES RAZONABLES
Máximos: vegetales 300g, proteínas 250g, carbs 200g, grasas 30g. Mínimo 10g para sólidos.
Si la comida queda por debajo del presupuesto calórico, sugiere añadir algo en vez de inflar cantidades.

3. PRIORIDAD PROTEÍNA
NUNCA reducir proteína para compensar otro ingrediente. Ajustar carbs o grasas primero.
Advertir antes de eliminar la única proteína de una comida.

4. CONFIRMAR DÍA
Siempre confirma el día exacto: "Voy a modificar tu [comida] del [DÍA]. ¿Confirmas?"
Si no especificó el día, pregunta. NUNCA asumas un día.

5. NOMBRES EXACTOS DEL CATÁLOGO
Usa nombres tal como aparecen en el catálogo. NUNCA inventes nombres.
Si hay variantes, pregunta: "¿Pasta regular o Pasta Integral?", "¿Pechuga de Pollo, Muslos o Caderas?"
Sinónimos: "mantequilla de maní"→"Crema de mani", "blueberries"→"Arándanos", "banana"→"Guineo (Banano)", "camote"→"Batata", "pechuga"→"Pechuga de Pollo", "caderas"→"Caderas de Pollo", "muslos"→"Muslos de Pollo", "chuleta"→"Chuleta de Cerdo", "filete"→"Filet Mignon o Beef Steak (preguntar cuál si no está en el plan)"
POLLO GENÉRICO: Cuando la usuaria diga "pollo" sin especificar corte, NO asumas cuál es. Revisa qué cortes tiene en su plan actual y usa ese. Si no tiene ninguno, pregunta: "¿Cuál corte de pollo prefieres? Tenemos Pechuga de Pollo, Caderas de Pollo o Muslos de Pollo en el catálogo."

6. NUNCA MENCIONAR FUENTES TÉCNICAS
NUNCA digas "USDA", "base de datos", "catálogo", "busqué en". Tú simplemente SABES la información.

7. SWAPS DENTRO DE LA MISMA CATEGORÍA
Cuando la usuaria pida cambiar un alimento por otro, el nuevo DEBE ser de la misma categoría (proteína→proteína, carb→carb, grasa→grasa, vegetal→vegetal). Si pide un cambio cross-categoría (ej. "cambia el aceite por mango"), la tool lo rechazará. En ese caso, explícale que no puedes hacer ese cambio porque descuadra sus macros, y ofrécele alternativas dentro de la misma categoría del alimento original.

═══ UNIDADES IMPERIALES ═══
Siempre habla en unidades imperiales con la usuaria. Usa oz para proteínas y tubérculos, cups para granos, vegetales y frutas, tbsp para aceites y semillas, fl oz para bebidas empacadas. Cuando la usuaria pida un cambio en cualquier unidad (gramos, tazas, oz, libras), convierte internamente a gramos usando factor_conversion antes de ejecutar el tool. Confirma siempre en la unidad imperial correspondiente al alimento.

═══ CANTIDADES EN TOOLS ═══
Los tools de modificación del calendario (cambiar_alimento, agregar_snack, agregar_ingrediente_a_comida) ya NO aceptan parámetro de cantidad. La cantidad se calcula automáticamente desde el presupuesto de macros. Solo pasa el nombre del alimento y el día/comida. Cuando confirmes al usuario qué se hizo, usa la cantidad que el tool devolvió en su resultado.

═══ COMUNICAR CANTIDADES CORRECTAMENTE ═══
Cuando Lucy añade, cambia o ajusta un alimento via tool, SIEMPRE debe confirmarle a la usuaria la cantidad exacta que insertó usando la unidad display del alimento (tazas, oz, cdas, unidades), no en gramos.
El tool_result del tool incluye los datos del alimento. Úsalos para convertir:
- Si unidad_display = 'cup': cantidad_display = cantidad_gramos / factor_conversion → expresar en fracciones (½, ¼, 1, 1½, etc.)
- Si unidad_display = 'oz': cantidad_display = cantidad_gramos / 28.35
- Si unidad_display = 'tbsp': cantidad_display = cantidad_gramos / factor_conversion
- Si unidad_display = 'unidad': mostrar el número entero directamente
Ejemplos correctos:
✅ "Añadí ½ taza de espinacas a tu cena del lunes y bajé la pasta un poco para mantener tus calorías."
✅ "Cambié el salmón de 6 oz a 5 oz para ajustar las calorías."
✅ "Añadí 2 cdas de crema de maní a tu desayuno."
Ejemplos incorrectos:
❌ "Añadí 100g de espinacas" — nunca usar gramos en la confirmación
❌ "Añadí 1 cup de espinacas" cuando en realidad se insertaron 100g (½ cup) — nunca mentir sobre la cantidad
La cantidad que Lucy comunica DEBE coincidir exactamente con lo que insertó en el sistema. Si insertó 100g de espinacas (½ taza), debe decir "½ taza", no "1 taza".

═══ PORCIONES ESTÁNDAR (cuando no se especifica) ═══
Tortillas: 45g/unidad | Pan: 30g/rebanada | Huevo: 1 unidad | Frutas: 120g | Arroz/pasta: 150g | Carnes: 120g | Quesos: 30g | Frutos secos: 28g | Aceites: 10g

═══ REGLAS DEL CALENDARIO ═══
- Si cambias la cena, el almuerzo del día siguiente debe ser igual
- Después de cada cambio, confirma qué cambiaste con cantidades exactas`

    // Bug #50a: systemPrompt uses a placeholder for CALENDARIO so it can be rebuilt with fresh data
    let systemPrompt = systemPromptTemplate.replace('PLACEHOLDER_CALENDARIO', calendarioTexto)

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
      console.log(`[TOOL CALL] ${name}`, JSON.stringify(input).slice(0, 200))
      const logResult = (r: string) => { console.log(`[TOOL RESULT] ${name}:`, r.slice(0, 150)); return r }
      try {
        if (name === 'cambiar_alimento') {
          const { result, revertData } = await executeCambiarAlimento(supabase, userId, {
            dia: input.dia as number,
            comida: input.comida as string,
            alimento_actual: input.alimento_actual as string,
            alimento_nuevo: input.alimento_nuevo as string,
          })
          if (revertData) currentRevertData = revertData
          return logResult(result)
        } else if (name === 'agregar_snack') {
          const { result, revertData } = await executeAgregarSnack(supabase, userId, {
            dia: input.dia as string,
            alimento: input.alimento as string | undefined,
            ingredientes: input.ingredientes as { alimento: string }[] | undefined,
          })
          if (revertData) currentRevertData = revertData
          return logResult(result)
        } else if (name === 'calcular_macros_dia') {
          return await executeCalcularMacrosDia(supabase, userId, {
            dia: input.dia as number,
          })
        } else if (name === 'reemplazar_comida_completa') {
          const { result, revertData } = await executeReemplazarComidaCompleta(supabase, userId, {
            dia: input.dia as number,
            comida: input.comida as string,
            ingredientes: input.ingredientes as string[],
          })
          if (revertData) currentRevertData = revertData
          return result
        } else if (name === 'agregar_ingrediente_a_comida') {
          const { result, revertData } = await executeAgregarIngredienteAComida(supabase, userId, {
            dia: input.dia as number,
            comida: input.comida as string,
            alimento: input.alimento as string,
          })
          if (revertData) currentRevertData = revertData
          return result
        } else if (name === 'eliminar_ingrediente_de_comida') {
          const { result, revertData } = await executeEliminarIngredienteDeComida(supabase, userId, {
            dia: input.dia as number,
            comida: input.comida as string,
            alimento: input.alimento as string,
            row_id: input.row_id as string | undefined,
            forzar: input.forzar as boolean | undefined,
          })
          if (revertData) currentRevertData = revertData
          return result
        } else if (name === 'ajustar_porcion_y_compensar') {
          const { result, revertData } = await executeAjustarPorcionYCompensar(supabase, userId, {
            dia: input.dia as number,
            comida: input.comida as string,
            alimento_subir: input.alimento_subir as string,
            alimento_bajar: input.alimento_bajar as string | undefined,
          })
          if (revertData) currentRevertData = revertData
          return result
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
        const noToolResult = 'Herramienta no reconocida.'
        console.log(`[TOOL RESULT] ${name}:`, noToolResult)
        return noToolResult
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido'
        console.error(`[TOOL ERROR] ${name}:`, msg)
        return `ERROR: No pude ejecutar esta acción (${msg}). Dile a la usuaria que hubo un problema y pregúntale si quiere intentar de nuevo.`
      }
    }

    // Detect if user is requesting a calendar change — force tool use
    const lastUserText = (messages[messages.length - 1]?.content || '').toLowerCase()
    // Force tool use for direct actions (not recipes — those need confirmation first)
    const forceToolUse = /ponme|pon .+ en mi|cambia .+ (por|a )|reduce |aumenta |más .+ (y |en vez)|sube .+ (el|la|los|las)|añade .+ a mi|elimina |quita |remueve |saca |quiero un snack|rebanada|en vez de/.test(lastUserText)

    // Detect brand names — inject instruction to ask for packaging
    const knownBrands = ['halo top', 'special k', 'activia', 'chobani', 'dannon', 'yoplait', 'quest', 'kind bar', 'rxbar', 'larabar', 'clif bar', 'premier protein', 'muscle milk', 'ensure', 'slim fast', 'fairlife', 'oikos', 'fage', 'siggi', 'nature valley', 'fiber one', 'think thin', 'atkins', 'built bar', 'carve']
    const detectedBrand = knownBrands.find(brand => lastUserText.includes(brand))
    if (detectedBrand) {
      apiMessages.push({
        role: 'user' as const,
        content: `INSTRUCCIÓN: "${detectedBrand}" es una marca específica. ANTES de buscar valores, pregúntale: "Tengo valores aproximados, pero ${detectedBrand} puede tener valores diferentes. ¿Tienes el empaque a la mano?" Espera respuesta.`,
      })
    }

    const toolCallsThisTurn: string[] = []
    let lastUsage: Anthropic.Messages.Usage | null = null

    while (iterations < 8) {
      iterations++

      // Bug #66: retry 1x on transient Anthropic API errors (529 overloaded, timeout, network)
      let response: Anthropic.Messages.Message
      try {
        response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: [{
            type: 'text' as const,
            text: systemPrompt,
            // 5min ephemeral cache. Anthropic redujo default de 1h a 5min en marzo 2026.
            // Si en el futuro mueven el default otra vez, este código sigue siendo correcto.
            cache_control: { type: 'ephemeral' as const },
          }],
          tools,
          tool_choice: forceToolUse && iterations === 1 ? { type: 'any' as const } : { type: 'auto' as const },
          messages: loopMessages,
        })
      } catch (apiErr) {
        const isTransient = apiErr instanceof Error && (
          ('status' in apiErr && ((apiErr as { status: number }).status === 529 || (apiErr as { status: number }).status === 503))
          || apiErr.message.includes('timeout')
          || apiErr.message.includes('ECONNRESET')
          || apiErr.message.includes('fetch failed')
        )
        if (!isTransient) throw apiErr
        console.warn(`[chat] Transient API error (${apiErr.message}), retrying in 1s...`)
        await new Promise(r => setTimeout(r, 1000))
        response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: [{
            type: 'text' as const,
            text: systemPrompt,
            // 5min ephemeral cache. Anthropic redujo default de 1h a 5min en marzo 2026.
            // Si en el futuro mueven el default otra vez, este código sigue siendo correcto.
            cache_control: { type: 'ephemeral' as const },
          }],
          tools,
          tool_choice: forceToolUse && iterations === 1 ? { type: 'any' as const } : { type: 'auto' as const },
          messages: loopMessages,
        })
      }

      lastUsage = response.usage

      // Collect all tool_use blocks
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')
      const textBlock = response.content.find(b => b.type === 'text')

      console.log(`[Chat] Iteration ${iterations}: stop_reason=${response.stop_reason}, tools=${toolUseBlocks.map(b => b.type === 'tool_use' ? b.name : '').join(',') || 'none'}, text=${textBlock?.type === 'text' ? textBlock.text.slice(0, 100) : 'none'}`)

      if (toolUseBlocks.length === 0) {
        finalResponse = textBlock?.type === 'text' ? textBlock.text : ''
        break
      }

      // Execute ALL tool calls and build results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolResults: any[] = []
      for (const block of toolUseBlocks) {
        if (block.type === 'tool_use') {
          toolCallsThisTurn.push(block.name)
          const result = await executeTool(block.name, block.input as Record<string, unknown>)
          toolResults.push({
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: result,
          })
        }
      }

      // ═══ Post-tool tolerance hook (Bug #40) ═══
      // After calendar-mutating tools, check if affected day(s) went out of tolerance.
      // If so, append warning to the last tool result so Claude can inform the user.
      const MUTATING_TOOLS = new Set(['cambiar_alimento', 'agregar_snack', 'reemplazar_comida_completa', 'agregar_ingrediente_a_comida', 'eliminar_ingrediente_de_comida', 'ajustar_porcion_y_compensar', 'revertir_cambio'])
      const mutatingCalls = toolUseBlocks.filter(b => b.type === 'tool_use' && MUTATING_TOOLS.has(b.name))

      if (mutatingCalls.length > 0 && usuario) {
        try {
          // Determine affected days from tool args
          const affectedDays = new Set<number>()
          for (const block of mutatingCalls) {
            if (block.type !== 'tool_use') continue
            const input = block.input as Record<string, unknown>
            if (block.name === 'revertir_cambio') {
              // Don't know which day was reverted — check all
              for (let d = 1; d <= 7; d++) affectedDays.add(d)
            } else if (block.name === 'agregar_snack' && input.dia === 'todos') {
              for (let d = 1; d <= 7; d++) affectedDays.add(d)
            } else {
              const dia = typeof input.dia === 'string' ? parseInt(input.dia) : input.dia as number
              if (dia >= 1 && dia <= 7) affectedDays.add(dia)
            }
          }

          // Only proceed if we have days to check and no tool returned an error
          const lastResult = toolResults[toolResults.length - 1]
          const lastResultStr = typeof lastResult?.content === 'string' ? lastResult.content : ''
          const toolFailed = lastResultStr.toLowerCase().includes('error') || lastResultStr.toLowerCase().includes('no encontr')

          if (affectedDays.size > 0 && !toolFailed) {
            // Refetch calendar for affected days
            const daysArray = Array.from(affectedDays)
            const { data: postCalendar } = await supabase
              .from('calendario')
              .select('dia, cantidad, alimento:alimentos(id, nombre, calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad, porcion_base, porcion_min, porcion_max, unidad_medida, rol_permitido)')
              .eq('user_id', userId)
              .in('dia', daysArray)

            type PostCalendarAlimento = {
              id: string; nombre: string; calorias_por_unidad: number; proteina_por_unidad: number;
              carbs_por_unidad: number; grasas_por_unidad: number; porcion_base: number;
              porcion_min: number; porcion_max: number; unidad_medida: 'gramos' | 'ml' | 'unidad'; rol_permitido: string[];
            }
            type PostCalendarRow = {
              dia: number; cantidad: number;
              alimento: PostCalendarAlimento | PostCalendarAlimento[] | null;
            }

            if (postCalendar && postCalendar.length > 0) {
              const rows = postCalendar as unknown as PostCalendarRow[]
              const unwrapAlimento = (row: PostCalendarRow): PostCalendarAlimento | null =>
                Array.isArray(row.alimento) ? row.alimento[0] ?? null : row.alimento

              const alimentosPost: AlimentoCalendario[] = rows.map((row) => {
                const a = unwrapAlimento(row)
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

              const analisis = analizarCalendario(alimentosPost, usuario.calorias_objetivo, usuario.proteina_objetivo)

              // Bug #50: Compute fresh day totals from postCalendar so Claude never uses stale data
              const dayTotals: Map<number, { kcal: number; prot: number; carbs: number; grasas: number }> = new Map()
              for (const row of rows) {
                const a = unwrapAlimento(row)
                if (!a) continue
                const ratio = a.unidad_medida === 'unidad' ? row.cantidad : row.cantidad / (a.porcion_base || 100)
                const prev = dayTotals.get(row.dia) || { kcal: 0, prot: 0, carbs: 0, grasas: 0 }
                prev.kcal += (a.calorias_por_unidad || 0) * ratio
                prev.prot += (a.proteina_por_unidad || 0) * ratio
                prev.carbs += (a.carbs_por_unidad || 0) * ratio
                prev.grasas += (a.grasas_por_unidad || 0) * ratio
                dayTotals.set(row.dia, prev)
              }

              const freshTotalsLines: string[] = []
              for (const d of daysArray.sort((a, b) => a - b)) {
                const t = dayTotals.get(d) || { kcal: 0, prot: 0, carbs: 0, grasas: 0 }
                freshTotalsLines.push(
                  `📊 TOTALES_FRESCOS día ${d} (${DIAS_NOMBRES[d - 1]}): ${Math.round(t.kcal)} kcal, P:${Math.round(t.prot)}g, C:${Math.round(t.carbs)}g, G:${Math.round(t.grasas)}g (objetivo: ${usuario.calorias_objetivo} kcal, P:${usuario.proteina_objetivo}g)`
                )
              }

              // Build warnings for days that are out of tolerance
              const warnings: string[] = []
              for (const dp of analisis.dias_problematicos) {
                if (!affectedDays.has(dp.dia)) continue
                const calPct = Math.round((dp.diferencia_calorias / dp.objetivo_calorias) * 100)
                warnings.push(
                  `⚠️ AVISO_POST_MOD día ${dp.dia}: kcal ${Math.round(dp.macros.calorias)} vs target ${dp.objetivo_calorias} (Δ ${dp.diferencia_calorias > 0 ? '+' : ''}${dp.diferencia_calorias}, ${calPct > 0 ? '+' : ''}${calPct}%); prot ${Math.round(dp.macros.proteina)}g vs target ${dp.objetivo_proteina}g (Δ ${dp.diferencia_proteina > 0 ? '+' : ''}${Math.round(dp.diferencia_proteina)}g). Comunícale a la usuaria que el día quedó fuera de tolerancia y ofrécele caminos para ajustar (modificar otra comida, agregar/quitar snack, cambiar alimento). NO sugieras cantidades específicas — vos decidís siempre las cantidades.`
                )
                console.log(JSON.stringify({ event: 'post_tool_warning', tool: mutatingCalls.map(b => b.type === 'tool_use' ? b.name : '').join(','), dia: dp.dia, diff_cal: dp.diferencia_calorias, diff_prot: Math.round(dp.diferencia_proteina) }))
              }

              // Log OK days
              for (const dia of analisis.dias_ok) {
                if (!affectedDays.has(dia)) continue
                console.log(JSON.stringify({ event: 'post_tool_ok', tool: mutatingCalls.map(b => b.type === 'tool_use' ? b.name : '').join(','), dia }))
              }

              // Append fresh totals + warnings to last tool result
              const postToolFooter = [...freshTotalsLines, ...warnings].join('\n')
              if (postToolFooter && toolResults.length > 0) {
                const lastIdx = toolResults.length - 1
                toolResults[lastIdx] = {
                  ...toolResults[lastIdx],
                  content: toolResults[lastIdx].content + '\n\n' + postToolFooter,
                }
              }
            }
          }
        } catch (hookErr) {
          // Hook must never break the chat flow
          console.error('[post-tool-hook] Error:', hookErr)
        }

        // Bug #50a: Rebuild systemPrompt with fresh calendario after mutations
        try {
          const { data: freshCalendario } = await supabase
            .from('calendario')
            .select('dia, comida, cantidad, unidad, alimento:alimentos(nombre, calorias_por_unidad, porcion_base, unidad_medida)')
            .eq('user_id', userId)
            .order('dia')
            .order('comida')
          calendarioTexto = buildCalendarioTexto(freshCalendario)
          systemPrompt = systemPromptTemplate.replace('PLACEHOLDER_CALENDARIO', calendarioTexto)
          console.log('[post-mutation] Rebuilt systemPrompt with fresh calendario')
        } catch (rebuildErr) {
          console.error('[post-mutation] Failed to rebuild calendario:', rebuildErr)
        }
      }

      loopMessages = [
        ...loopMessages,
        { role: 'assistant' as const, content: response.content },
        { role: 'user' as const, content: toolResults },
      ]
    }

    // If we exhausted iterations, get the last text — NEVER lie about changes
    if (!finalResponse && loopMessages.length > apiMessages.length) {
      const lastResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: [{
          type: 'text' as const,
          text: systemPrompt,
          // 5min ephemeral cache. Anthropic redujo default de 1h a 5min en marzo 2026.
          // Si en el futuro mueven el default otra vez, este código sigue siendo correcto.
          cache_control: { type: 'ephemeral' as const },
        }],
        messages: loopMessages,
      })
      lastUsage = lastResponse.usage
      const textBlock = lastResponse.content.find(b => b.type === 'text')
      finalResponse = textBlock?.type === 'text'
        ? textBlock.text
        : 'Ay, perdóname — me enredé un poco procesando tu pedido. ¿Me repites qué cambio querías hacer? 💜'
    }

    // Build meta for telemetry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let meta: Record<string, any> | null = null

    // Bug A: fallback fired because loop exhausted
    if (finalResponse === 'Ay, perdóname — me enredé un poco procesando tu pedido. ¿Me repites qué cambio querías hacer? 💜') {
      meta = {
        bug_type: 'fallback_loop_exhausted',
        iterations_used: iterations,
        last_tool_calls: toolCallsThisTurn.slice(-5),
      }
      console.error(`[Chat][Bug30] Loop exhausted for user ${userId}. Iterations: ${iterations}. Tools: ${toolCallsThisTurn.join(',')}`)
    }

    // Bug #31 detector — suspected_lie (heurística mejorada 28 abr 2026)
    //
    // LIMITACIONES CONOCIDAS:
    // 1. NO detecta cross-turn lies (afirmar al turno N basado en mentira del turno N-1).
    //    Ejemplo: caso Vivianne aguacate (5 turnos de "eliminé X" sin ejecutar).
    //    Detector solo ve el mensaje individual, no patrón en cascada.
    // 2. NO detecta si Lucy invoca tool, tool falla con error, y Lucy igual dice "Listo ✅".
    //    Para cubrir requeriría trackear toolCallsSuccessful vs toolCallsFailed.
    // 3. Heurística calibrada con 10 casos históricos. Sample chico — pueden existir
    //    patrones no vistos. Revisar tasa de FP/FN periódicamente.
    //
    // Heurística:
    // - Action triggers ('listo', 'hecho', etc.) marcan candidato.
    // - ✅ aislado NO marca; solo cuenta si va con verbo de acción explícito.
    // - 4 filtros de exclusión descartan contextos no-acción.
    if (!meta && finalResponse) {
      const lower = finalResponse.toLowerCase()

      // 1. Action-claiming trigger phrases
      const actionTriggers = ['listo', 'hecho', 'cambios hechos', 'modificado', 'aplicado', 'actualizado']
      const matched = actionTriggers.filter(p => lower.includes(p))

      // 2. ✅ solo cuenta si viene acompañado de verbo de acción explícito
      const hasCheckmark = finalResponse.includes('✅')
      const actionVerbs = ['eliminé', 'cambié', 'añadí', 'agregué', 'reemplacé', 'ajusté', 'actualicé', 'modifiqué']
      const hasActionVerb = actionVerbs.some(v => lower.includes(v))
      if (hasCheckmark && hasActionVerb) matched.push('✅+verb')

      if (matched.length > 0 && toolCallsThisTurn.length === 0) {
        // 3. Filtros de exclusión — contextos no-acción
        const isQuestion = finalResponse.includes('?')
        const isIntention = /(déjame|voy a|necesito|antes de)/i.test(finalResponse)
        const isExistingState = /(ya está|ya tiene|ya tienes|ya lo tiene|ya quedó|dejamos)/i.test(finalResponse)
        const isProposal = /(te propongo|te recomiendo|qué te parece|quieres que)/i.test(finalResponse)

        const excluded = isQuestion || isIntention || isExistingState || isProposal

        if (!excluded) {
          meta = {
            bug_type: 'suspected_lie',
            trigger_phrases: matched,
            tools_called_this_turn: 0,
            content_preview: finalResponse.slice(0, 200),
          }
          console.warn(`[Chat][Bug31] Suspected lie for user ${userId}. Triggers: ${matched.join(',')}. No tools called.`)
        }
      }
    }

    // Token logging — capture usage from last API response
    if (lastUsage) {
      const tokens = {
        input: lastUsage.input_tokens,
        output: lastUsage.output_tokens,
        cache_creation: (lastUsage as unknown as Record<string, unknown>).cache_creation_input_tokens as number || 0,
        cache_read: (lastUsage as unknown as Record<string, unknown>).cache_read_input_tokens as number || 0,
        model: 'claude-sonnet-4-6',
        timestamp: new Date().toISOString(),
      }
      meta = meta ? { ...meta, tokens } : { tokens }
      console.log(`[Chat][Tokens] user=${userId} input=${tokens.input} output=${tokens.output} cache_create=${tokens.cache_creation} cache_read=${tokens.cache_read}`)
    }

    // Save messages to conversaciones
    const lastMsg = messages[messages.length - 1]
    if (lastMsg && finalResponse) {
      await supabase.from('conversaciones').insert([
        { user_id: userId, role: 'user', content: lastMsg.content },
        { user_id: userId, role: 'assistant', content: finalResponse, ...(meta ? { meta } : {}) },
      ])
    }

    return NextResponse.json({
      response: finalResponse,
      revertData: currentRevertData,
    })
  } catch (err) {
    // Bug #66: structured error logging for Vercel logs
    const errMessage = err instanceof Error ? err.message : 'Error interno'
    const errorType = err instanceof Error && 'status' in err ? 'API_ERROR'
      : err instanceof TypeError ? 'PARSE_ERROR'
      : err instanceof Error && errMessage.includes('supabase') ? 'DB_ERROR'
      : 'UNKNOWN'
    console.error(JSON.stringify({
      event: 'chat_error',
      error_type: errorType,
      message: errMessage,
      user_id: chatUserId || 'unknown',
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' | ') : undefined,
    }))
    return NextResponse.json({ error: errMessage }, { status: 500 })
  }
}
