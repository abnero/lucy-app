'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'

interface Macros {
  calorias_objetivo: number
  proteina_objetivo: number
  carbs_objetivo: number
  grasas_objetivo: number
  meta: string
  nombre: string
}

const MENSAJES: Record<string, string> = {
  perder_peso:
    'Con estos macros vas a estar en un déficit calórico que te va a permitir bajar de peso comiendo las comidas que te gustan. No es una dieta — es estructura. Vas a comer rico, vas a comer suficiente, y tu cuerpo va a responder. Yo voy a estar aquí para guiarte en cada paso.',
  mantener_peso:
    'Con estos macros vas a mantener tu peso actual mientras le das a tu cuerpo exactamente lo que necesita. El objetivo es nutrición óptima — que te sientas con energía, fuerte, y en balance. Yo voy a estar aquí para guiarte en cada paso.',
  ganar_masa:
    'Con estos macros vas a estar en un superávit calórico controlado que le va a dar a tus músculos el combustible que necesitan para crecer. Vas a comer más, pero de forma inteligente. Yo voy a estar aquí para guiarte en cada paso.',
}

export default function MisMacrosPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [macros, setMacros] = useState<Macros | null>(null)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
      return
    }
    if (!loading && user) {
      supabase
        .from('usuarios')
        .select('calorias_objetivo, proteina_objetivo, carbs_objetivo, grasas_objetivo, meta, nombre')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) setMacros(data as Macros)
        })
    }
  }, [user, loading, router])

  if (loading || !macros) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lucy-muted text-sm">Cargando...</p>
      </div>
    )
  }

  const macroCards = [
    { label: 'Calorías', value: macros.calorias_objetivo, unit: 'kcal' },
    { label: 'Proteína', value: macros.proteina_objetivo, unit: 'g' },
    { label: 'Carbs', value: macros.carbs_objetivo, unit: 'g' },
    { label: 'Grasas', value: macros.grasas_objetivo, unit: 'g' },
  ]

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-lg mx-auto">
        {/* Logo */}
        <div className="text-center mb-6">
          <h1 className="font-logo text-2xl text-lucy-text">Lucy</h1>
          <p className="text-lucy-soft text-[10px] tracking-[0.25em] uppercase">
            calendario metabólico
          </p>
        </div>

        {/* Editar datos */}
        <button
          onClick={() => router.push('/onboarding')}
          className="text-xs text-lucy-muted hover:text-lucy-accent transition-colors mb-6"
        >
          ← Editar mis datos
        </button>

        {/* Título */}
        <div className="text-center mb-8">
          <h2 className="text-xl text-lucy-text">¡Tus macros están listos!</h2>
        </div>

        {/* Macro cards */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {macroCards.map(({ label, value, unit }) => (
            <div
              key={label}
              className="bg-lucy-white rounded-card border border-lucy-border p-5 text-center"
            >
              <p className="text-lucy-muted text-xs mb-1">{label}</p>
              <p className="text-3xl font-medium text-lucy-text leading-none">
                {value}
              </p>
              <p className="text-lucy-muted text-xs mt-1">{unit}</p>
            </div>
          ))}
        </div>

        {/* Mensaje de Lucy */}
        <div className="rounded-card p-5 mb-8" style={{ backgroundColor: '#F0EFFA' }}>
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-lucy-accent flex items-center justify-center">
              <span className="font-logo text-white text-sm">L</span>
            </div>
            <div>
              <p className="text-xs font-medium text-lucy-accent mb-1.5">Lucy</p>
              <p className="text-sm text-lucy-text leading-relaxed">
                {MENSAJES[macros.meta] || MENSAJES.mantener_peso}
              </p>
            </div>
          </div>
        </div>

        {/* Instrucción */}
        <p className="text-center text-lucy-muted text-xs leading-relaxed mb-4">
          Ahora escoge los alimentos que te gustan y yo me encargo de preparar tu calendario metabólico personalizado.
        </p>

        {/* Flecha */}
        <div className="flex justify-center mb-3">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-lucy-soft">
            <path d="M10 4v10m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Botón */}
        <button
          onClick={() => router.push('/seleccion-alimentos')}
          className="w-full bg-lucy-accent text-white font-medium rounded-btn py-2.5 px-4 text-sm hover:opacity-90 transition-opacity"
        >
          Escoger mis alimentos
        </button>
      </div>
    </div>
  )
}
