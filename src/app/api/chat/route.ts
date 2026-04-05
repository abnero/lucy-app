import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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

export async function POST(req: NextRequest) {
  try {
    const { userId, accessToken, messages } = await req.json()
    if (!userId || !accessToken || !messages) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAuthenticatedClient(accessToken)

    // Fetch user profile
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('nombre, calorias_objetivo, proteina_objetivo, carbs_objetivo, grasas_objetivo, meta, nivel_actividad')
      .eq('id', userId)
      .single()

    if (!usuario) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch calendar with food names
    const { data: calendario } = await supabase
      .from('calendario')
      .select('dia, comida, cantidad, unidad, alimento:alimentos(nombre)')
      .eq('user_id', userId)
      .order('dia')
      .order('comida')

    // Build calendar text
    const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
    let calendarioTexto = ''
    if (calendario && calendario.length > 0) {
      for (let d = 1; d <= 7; d++) {
        const diaItems = calendario.filter(c => c.dia === d)
        if (diaItems.length === 0) continue
        calendarioTexto += `\n${dias[d - 1]}:\n`
        for (const comida of ['desayuno', 'almuerzo', 'cena']) {
          const items = diaItems.filter(c => c.comida === comida)
          if (items.length === 0) continue
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const itemsText = items.map((i: any) => {
            const nombre = Array.isArray(i.alimento) ? i.alimento[0]?.nombre : i.alimento?.nombre
            return `${nombre} (${i.cantidad} ${i.unidad})`
          }).join(', ')
          calendarioTexto += `  ${comida.charAt(0).toUpperCase() + comida.slice(1)}: ${itemsText}\n`
        }
      }
    }

    // Fetch selected foods
    const { data: preferencias } = await supabase
      .from('preferencias_usuario')
      .select('categoria_comida, alimento:alimentos(nombre)')
      .eq('user_id', userId)

    let alimentosTexto = ''
    if (preferencias && preferencias.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

Calendario actual:${calendarioTexto || '\n(No tiene calendario generado aún)'}

Alimentos seleccionados:
${alimentosTexto || '(No tiene alimentos seleccionados aún)'}

Puedes ayudarle con:
1. Cambiar un alimento por otro y recalcular cantidades
2. Redistribuir una comida a un snack
3. Recomendar snacks cuando tiene hambre
4. Dar recetas con ingredientes de su plan
5. Sugerir ingredientes adicionales manteniendo macros
6. Responder preguntas de nutrición
7. Llevarla a su lista de compras

Responde siempre en español. Sé concisa y práctica. Si la usuaria quiere cambiar algo en su plan, explícale el cambio y las nuevas cantidades claramente.`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    // Save both messages to conversaciones
    const lastUserMsg = messages[messages.length - 1]
    if (lastUserMsg) {
      await supabase.from('conversaciones').insert([
        { user_id: userId, role: 'user', content: lastUserMsg.content },
        { user_id: userId, role: 'assistant', content: responseText },
      ])
    }

    return NextResponse.json({ response: responseText })
  } catch (err) {
    console.error('chat error:', err)
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
