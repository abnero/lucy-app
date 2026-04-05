import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

function createAuthenticatedClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    }
  )
}

interface PlanAlimento {
  alimento: string
  cantidad: number
  unidad: string
}

interface PlanDia {
  dia: number
  desayuno: PlanAlimento[]
  almuerzo: PlanAlimento[]
  cena: PlanAlimento[]
}

export async function POST(req: NextRequest) {
  try {
    const { userId, accessToken } = await req.json()
    if (!userId || !accessToken) {
      return NextResponse.json({ error: 'userId and accessToken required' }, { status: 400 })
    }

    const supabase = createAuthenticatedClient(accessToken)

    // 1. Fetch user macros
    const { data: usuario, error: userErr } = await supabase
      .from('usuarios')
      .select('nombre, calorias_objetivo, proteina_objetivo, carbs_objetivo, grasas_objetivo, meta')
      .eq('id', userId)
      .single()

    if (userErr || !usuario) {
      return NextResponse.json(
        { error: 'Hubo un problema cargando tu perfil. Por favor regresa y completa tu información.' },
        { status: 404 }
      )
    }

    // 2. Fetch user preferences with food details
    const { data: preferencias, error: prefErr } = await supabase
      .from('preferencias_usuario')
      .select(`
        categoria_comida,
        alimento:alimentos (
          id, nombre, categoria_comida,
          calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad,
          unidad_medida, porcion_base, porcion_min, porcion_max
        )
      `)
      .eq('user_id', userId)

    if (prefErr || !preferencias?.length) {
      return NextResponse.json(
        { error: 'No encontramos tus alimentos seleccionados. Por favor regresa y escoge tus alimentos.' },
        { status: 404 }
      )
    }

    // 3. Build the food catalog for the prompt
    const alimentosMap = new Map<string, { id: string; nombre: string }>()
    const alimentosPorCategoria: Record<string, string[]> = {}

    for (const pref of preferencias) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = pref.alimento as any
      if (!a) continue
      alimentosMap.set(a.nombre.toLowerCase(), { id: a.id, nombre: a.nombre })

      const cat = pref.categoria_comida
      if (!alimentosPorCategoria[cat]) alimentosPorCategoria[cat] = []
      alimentosPorCategoria[cat].push(
        `${a.nombre} (${a.calorias_por_unidad} kcal, P:${a.proteina_por_unidad}g, C:${a.carbs_por_unidad}g, G:${a.grasas_por_unidad}g por ${a.porcion_base}${a.unidad_medida}, rango: ${a.porcion_min}-${a.porcion_max}${a.unidad_medida})`
      )
    }

    const catalogoTexto = Object.entries(alimentosPorCategoria)
      .map(([cat, items]) => `**${cat}:** ${items.join(', ')}`)
      .join('\n')

    const systemPrompt = `Eres Lucy, una asistente experta en nutrición. Genera un calendario metabólico de 7 días siguiendo estas reglas exactas:
1. Usa ÚNICAMENTE los alimentos que la usuaria seleccionó
2. Distribución de calorías: Desayuno 30%, Almuerzo 40%, Cena 30%
3. Distribución de proteína: Desayuno 30%, Almuerzo 35%, Cena 35%
4. Regla 1: No repetir misma combinación en días consecutivos
5. Regla 2: Almuerzo = cena del día anterior
6. Regla 3: Desayuno siempre rota
7. Regla 4: Cena siempre nueva
8. Cantidades FIJAS — misma cantidad todos los días para cada alimento
9. Responde ÚNICAMENTE con JSON válido con esta estructura:
{
  "dias": [
    {
      "dia": 1,
      "desayuno": [{"alimento": "nombre exacto", "cantidad": 150, "unidad": "gramos"}],
      "almuerzo": [{"alimento": "nombre exacto", "cantidad": 150, "unidad": "gramos"}],
      "cena": [{"alimento": "nombre exacto", "cantidad": 150, "unidad": "gramos"}]
    }
  ]
}`

    const userMessage = `Macros objetivo de ${usuario.nombre}:
- Calorías: ${usuario.calorias_objetivo} kcal/día
- Proteína: ${usuario.proteina_objetivo}g/día
- Carbs: ${usuario.carbs_objetivo}g/día
- Grasas: ${usuario.grasas_objetivo}g/día
- Meta: ${usuario.meta}

Alimentos seleccionados:
${catalogoTexto}

Genera el calendario de 7 días. Responde SOLO con JSON, sin texto adicional.`

    // 4. Call Anthropic API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        { role: 'user', content: userMessage },
      ],
      system: systemPrompt,
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Lucy tuvo un problema generando tu plan. Intenta de nuevo.' }, { status: 500 })
    }

    const plan: { dias: PlanDia[] } = JSON.parse(jsonMatch[0])

    // 5. Clear existing calendar and shopping list
    await supabase.from('calendario').delete().eq('user_id', userId)
    await supabase.from('lista_compras').delete().eq('user_id', userId)

    // 6. Save calendar entries
    const calendarioRows: { user_id: string; dia: number; comida: string; alimento_id: string; cantidad: number; unidad: string }[] = []
    const comprasTotals = new Map<string, { alimentoId: string; cantidad: number; unidad: string }>()

    for (const dia of plan.dias) {
      for (const comida of ['desayuno', 'almuerzo', 'cena'] as const) {
        const items = dia[comida]
        if (!items) continue
        for (const item of items) {
          const match = alimentosMap.get(item.alimento.toLowerCase())
          if (!match) continue

          calendarioRows.push({
            user_id: userId,
            dia: dia.dia,
            comida,
            alimento_id: match.id,
            cantidad: item.cantidad,
            unidad: item.unidad,
          })

          // Accumulate shopping list
          const key = match.id
          const existing = comprasTotals.get(key)
          if (existing) {
            existing.cantidad += item.cantidad
          } else {
            comprasTotals.set(key, { alimentoId: match.id, cantidad: item.cantidad, unidad: item.unidad })
          }
        }
      }
    }

    if (calendarioRows.length > 0) {
      const { error: calErr } = await supabase.from('calendario').insert(calendarioRows)
      if (calErr) {
        return NextResponse.json({ error: 'Error guardando el calendario: ' + calErr.message }, { status: 500 })
      }
    }

    // 7. Save shopping list
    const comprasRows = Array.from(comprasTotals.values()).map(c => ({
      user_id: userId,
      alimento_id: c.alimentoId,
      cantidad_total: c.cantidad,
      unidad: c.unidad,
      comprado: false,
    }))

    if (comprasRows.length > 0) {
      const { error: shopErr } = await supabase.from('lista_compras').insert(comprasRows)
      if (shopErr) {
        return NextResponse.json({ error: 'Error guardando la lista de compras: ' + shopErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, dias: plan.dias.length, items: calendarioRows.length })
  } catch (err) {
    console.error('generar-plan error:', err)
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
