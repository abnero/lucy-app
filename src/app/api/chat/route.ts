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
  const oldCalories = (oldAlimento?.calorias_por_unidad || 100) * (targetEntry.cantidad / (newAlimento.porcion_base || 100))
  const newCantidad = Math.round((oldCalories / newAlimento.calorias_por_unidad) * (newAlimento.porcion_base || 100))

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

  const dias = dia === 'todos' ? [1, 2, 3, 4, 5, 6, 7] : [parseInt(dia)]
  const rows = dias.map(d => ({
    user_id: userId,
    dia: d,
    comida: 'snack',
    alimento_id: found.id,
    cantidad,
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

  const diasText = dia === 'todos' ? 'todos los días' : DIAS_NOMBRES[parseInt(dia) - 1]
  const cals = Math.round(found.calorias_por_unidad * (cantidad / (found.porcion_base || 100)))

  return {
    result: `Añadí ${cantidad}${found.unidad_medida} de ${found.nombre} como snack el ${diasText}. Son ~${cals} kcal extra.`,
    revertData,
  }
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
    const { userId, accessToken, messages, lastRevertData } = await req.json()
    if (!userId || !accessToken || !messages) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

Calendario actual:${calendarioTexto}

Alimentos seleccionados:
${alimentosTexto || '(No tiene alimentos seleccionados aún)'}

Tienes 3 herramientas disponibles:
- cambiar_alimento: Para cambiar un alimento por otro en el calendario. Usa los nombres EXACTOS como aparecen en el calendario.
- agregar_snack: Para añadir un snack al calendario.
- revertir_cambio: Para deshacer el último cambio cuando la usuaria lo pida.

REGLAS IMPORTANTES:
- Solo usa alimentos que existan en el catálogo. Si la usuaria pide algo que no existe, sugiere alternativas.
- Después de cada cambio, confirma qué cambiaste con cantidades específicas.
- Si cambias la cena, recuerda que el almuerzo del día siguiente debe ser igual (Regla 2).
- Si la usuaria dice "reviértelo", "deshaz", "quítalo", o similar, usa revertir_cambio.

Responde siempre en español. Sé concisa y práctica.`

    // Build API messages
    const apiMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    }))

    // Tool use loop
    let currentRevertData: RevertData | null = lastRevertData || null
    let finalResponse = ''
    let loopMessages = [...apiMessages]
    let iterations = 0

    while (iterations < 3) {
      iterations++

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages: loopMessages,
      })

      // Check if there's a tool use
      const toolUseBlock = response.content.find(b => b.type === 'tool_use')
      const textBlock = response.content.find(b => b.type === 'text')

      if (!toolUseBlock) {
        // No tool use, just text response
        finalResponse = textBlock?.type === 'text' ? textBlock.text : ''
        break
      }

      // Execute the tool
      let toolResult = ''

      if (toolUseBlock.type === 'tool_use') {
        const toolInput = toolUseBlock.input as Record<string, unknown>

        if (toolUseBlock.name === 'cambiar_alimento') {
          const { result, revertData } = await executeCambiarAlimento(supabase, userId, {
            dia: toolInput.dia as number,
            comida: toolInput.comida as string,
            alimento_actual: toolInput.alimento_actual as string,
            alimento_nuevo: toolInput.alimento_nuevo as string,
          })
          toolResult = result
          if (revertData) currentRevertData = revertData
        } else if (toolUseBlock.name === 'agregar_snack') {
          const { result, revertData } = await executeAgregarSnack(supabase, userId, {
            dia: toolInput.dia as string,
            alimento: toolInput.alimento as string,
            cantidad: toolInput.cantidad as number,
          })
          toolResult = result
          if (revertData) currentRevertData = revertData
        } else if (toolUseBlock.name === 'revertir_cambio') {
          toolResult = await executeRevertir(supabase, currentRevertData)
          currentRevertData = null
        }
      }

      // Add assistant response and tool result to messages for next iteration
      loopMessages = [
        ...loopMessages,
        { role: 'assistant' as const, content: response.content },
        {
          role: 'user' as const,
          content: [{
            type: 'tool_result' as const,
            tool_use_id: toolUseBlock.type === 'tool_use' ? toolUseBlock.id : '',
            content: toolResult,
          }],
        },
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
    const lastUserMsg = messages[messages.length - 1]
    if (lastUserMsg && finalResponse) {
      await supabase.from('conversaciones').insert([
        { user_id: userId, role: 'user', content: lastUserMsg.content },
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
