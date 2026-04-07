import { NextRequest, NextResponse } from 'next/server'

const USDA_API_KEY = process.env.USDA_API_KEY

interface USDANutrient {
  nutrientId: number
  nutrientName: string
  value: number
}

interface USDAFood {
  description: string
  foodNutrients: USDANutrient[]
}

function getNutrient(nutrients: USDANutrient[], id: number): number {
  return nutrients.find(n => n.nutrientId === id)?.value || 0
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json()
    if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 })
    if (!USDA_API_KEY) return NextResponse.json({ error: 'USDA API key not configured' }, { status: 500 })

    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&api_key=${USDA_API_KEY}&pageSize=5`

    const res = await fetch(url)
    if (!res.ok) {
      return NextResponse.json({ error: `USDA API error: ${res.status}` }, { status: 502 })
    }

    const data = await res.json()
    const foods: USDAFood[] = data.foods || []

    if (foods.length === 0) {
      return NextResponse.json({ error: `No se encontró "${query}" en la base de datos USDA.` }, { status: 404 })
    }

    const food = foods[0]
    const nutrients = food.foodNutrients

    // USDA nutrient IDs: 1008=Energy(kcal), 1003=Protein, 1005=Carbs, 1004=Fat, 1079=Fiber
    const result = {
      nombre: food.description,
      por_100g: {
        calorias: Math.round(getNutrient(nutrients, 1008) * 10) / 10,
        proteina: Math.round(getNutrient(nutrients, 1003) * 10) / 10,
        carbs: Math.round(getNutrient(nutrients, 1005) * 10) / 10,
        grasas: Math.round(getNutrient(nutrients, 1004) * 10) / 10,
        fibra: Math.round(getNutrient(nutrients, 1079) * 10) / 10,
      },
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('USDA search error:', err)
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
