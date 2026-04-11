'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'
import FoodAvatar from '@/components/FoodAvatar'

interface Alimento {
  id: string
  nombre: string
  foto_url: string | null
  rol_permitido: string[]
}

const PASOS = [
  { rol: 'Desayuno_1', titulo: 'Desayuno 1', subtitulo: 'Escoge tus opciones preferidas', min: 3, max: 4, categoria: 'desayuno_1', opcional: false },
  { rol: 'Desayuno_2', titulo: 'Desayuno 2', subtitulo: 'Acompañantes opcionales de desayuno', min: 0, max: 4, categoria: 'desayuno_2', opcional: true },
  { rol: 'Proteina', titulo: 'Proteínas', subtitulo: 'Escoge tus proteínas favoritas', min: 3, max: 7, categoria: 'proteina', opcional: false },
  { rol: 'Carbohidrato', titulo: 'Acompañante 1 — Carbs', subtitulo: 'Tus carbohidratos preferidos', min: 1, max: 5, categoria: 'carbohidrato', opcional: false },
  { rol: 'Fibra', titulo: 'Acompañante 2 — Fibras', subtitulo: 'Vegetales y fibras que te gustan', min: 3, max: 5, categoria: 'fibra', opcional: false },
  { rol: 'Grasa', titulo: 'Grasas', subtitulo: 'Grasas saludables que prefieres', min: 3, max: 5, categoria: 'grasa', opcional: false },
] as const

export default function SeleccionAlimentosPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [showIntro, setShowIntro] = useState(true)
  const [paso, setPaso] = useState(0)
  const [alimentos, setAlimentos] = useState<Alimento[]>([])
  const [selecciones, setSelecciones] = useState<Record<number, Set<string>>>({
    0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(),
  })
  const [loadingAlimentos, setLoadingAlimentos] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [hasCalendario, setHasCalendario] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
      return
    }
    if (!loading && user) {
      supabase
        .from('calendario')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .then(({ count }) => {
          if (count && count > 0) setHasCalendario(true)
        })
    }
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    setLoadingAlimentos(true)
    const config = PASOS[paso]
    supabase
      .from('alimentos')
      .select('id, nombre, foto_url, rol_permitido')
      .contains('rol_permitido', [config.rol])
      .or('es_personalizado.is.null,es_personalizado.eq.false')
      .order('nombre')
      .then(({ data }) => {
        setAlimentos(data ?? [])
        setLoadingAlimentos(false)
      })
  }, [paso, user])

  const config = PASOS[paso]
  const selected = selecciones[paso]

  const toggleAlimento = useCallback((id: string) => {
    setSelecciones(prev => {
      const current = new Set(prev[paso])
      if (current.has(id)) {
        current.delete(id)
      } else if (current.size < config.max) {
        current.add(id)
      }
      return { ...prev, [paso]: current }
    })
  }, [paso, config.max])

  const canAdvance = selected.size >= config.min
  const isLastStep = paso === PASOS.length - 1

  const handleNext = async () => {
    setError('')
    if (!canAdvance && !config.opcional) return

    if (isLastStep) {
      setSaving(true)
      // Build all preferences (deduplicate by alimento_id to respect UNIQUE constraint)
      const seen = new Set<string>()
      const preferences: { user_id: string; alimento_id: string; categoria_comida: string }[] = []
      for (let i = 0; i < PASOS.length; i++) {
        const ids = selecciones[i]
        const cat = PASOS[i].categoria
        ids.forEach(id => {
          if (!seen.has(id)) {
            seen.add(id)
            preferences.push({ user_id: user!.id, alimento_id: id, categoria_comida: cat })
          }
        })
      }

      // Clear existing data (preferences, calendar, shopping list)
      const uid = user!.id
      const [delPref] = await Promise.all([
        supabase.from('preferencias_usuario').delete().eq('user_id', uid).select(),
        supabase.from('calendario').delete().eq('user_id', uid).select(),
        supabase.from('lista_compras').delete().eq('user_id', uid).select(),
      ])

      if (delPref.error) {
        setError('Error limpiando preferencias: ' + delPref.error.message)
        setSaving(false)
        return
      }

      const { error: dbError } = await supabase.from('preferencias_usuario').insert(preferences)

      if (dbError) {
        console.error('Insert error:', dbError, 'Preferences count:', preferences.length)
        setError('Error al guardar: ' + dbError.message)
        setSaving(false)
        return
      }

      router.push('/generando')
    } else {
      setPaso(paso + 1)
    }
  }

  const handleBack = () => {
    if (paso > 0) setPaso(paso - 1)
    else router.push('/mis-macros')
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lucy-muted text-sm">Cargando...</p>
      </div>
    )
  }

  if (showIntro) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="font-logo text-2xl text-lucy-text">Lucy</h1>
            <p className="text-lucy-soft text-[10px] tracking-[0.25em] uppercase">calendario metabólico</p>
          </div>
          <div className="bg-lucy-white rounded-card border border-lucy-border p-8 text-center">
            <p className="text-4xl mb-4">🥗</p>
            <h2 className="text-lg text-lucy-text mb-3">Escoge tus alimentos favoritos</h2>
            <p className="text-xs text-lucy-muted leading-relaxed mb-6">
              Vamos a personalizar tu calendario metabólico. Escoge los alimentos que más te gustan en cada categoría — no tienen que ser perfectos. Una vez generado tu calendario, podrás añadir, cambiar o quitar cualquier alimento con la ayuda de Lucy.
            </p>
            <button
              onClick={() => setShowIntro(false)}
              className="w-full bg-lucy-accent text-white font-medium rounded-btn py-2.5 px-4 text-sm hover:opacity-90 transition-opacity"
            >
              ¡Empecemos!
            </button>
            {hasCalendario && (
              <button
                onClick={() => router.push('/mi-calendario')}
                className="w-full mt-3 text-xs text-lucy-muted hover:text-lucy-accent transition-colors"
              >
                ← Volver a mi calendario
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="max-w-lg mx-auto">
        {/* Back button */}
        {hasCalendario && (
          <button
            onClick={() => router.push('/mi-calendario')}
            className="text-xs text-lucy-muted hover:text-lucy-accent transition-colors mb-3"
          >
            ← Volver a mi calendario
          </button>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-logo text-xl text-lucy-text">Lucy</h1>
            <p className="text-lucy-soft text-[9px] tracking-[0.25em] uppercase">calendario metabólico</p>
          </div>
          <div className="flex items-center gap-3">
            {config.opcional && (
              <button
                onClick={handleNext}
                className="text-xs text-lucy-muted hover:text-lucy-accent transition-colors"
              >
                Saltar
              </button>
            )}
            <span className="text-xs text-lucy-muted">Paso {paso + 1} de 6</span>
          </div>
        </div>

        {/* Progress steps */}
        <div className="flex gap-1 mb-6 overflow-x-auto scrollbar-hide">
          {PASOS.map((p, i) => {
            const isCompleted = i < paso
            const isCurrent = i === paso
            return (
              <div key={i} className="flex items-center gap-1 shrink-0">
                <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] transition-colors ${
                  isCurrent ? 'bg-lucy-accent text-white' :
                  isCompleted ? 'bg-lucy-accent/10 text-lucy-accent' :
                  'bg-lucy-border/50 text-lucy-muted'
                }`}>
                  {isCompleted && <span>&#10003;</span>}
                  <span>{p.titulo.replace('Acompañante 1 — ', '').replace('Acompañante 2 — ', '')}</span>
                </div>
                {i < PASOS.length - 1 && <div className="w-2 h-px bg-lucy-border shrink-0" />}
              </div>
            )
          })}
        </div>

        {/* Title */}
        <div className="mb-2">
          <h2 className="text-lg text-lucy-text">{config.titulo}</h2>
          <p className="text-lucy-muted text-xs">{config.subtitulo}</p>
        </div>

        {/* Counter */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-lucy-muted">
            {selected.size} de {config.max} seleccionados
            {config.min > 0 && selected.size < config.min && (
              <span className="text-lucy-soft ml-1">(mínimo {config.min})</span>
            )}
          </p>
        </div>

        {/* Grid */}
        {loadingAlimentos ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-lucy-muted text-sm">Cargando alimentos...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 mb-8">
            {alimentos.map(alimento => {
              const isSelected = selected.has(alimento.id)
              return (
                <button
                  key={alimento.id}
                  onClick={() => toggleAlimento(alimento.id)}
                  className={`rounded-card border p-4 flex flex-col items-center gap-3 transition-colors ${
                    isSelected
                      ? 'border-lucy-accent bg-lucy-accent/10'
                      : 'border-lucy-border bg-lucy-white hover:border-lucy-soft'
                  }`}
                >
                  <FoodAvatar nombre={alimento.nombre} foto_url={alimento.foto_url} size="lg" />
                  <span className={`text-xs text-center leading-tight ${
                    isSelected ? 'text-lucy-accent font-medium' : 'text-lucy-text'
                  }`}>
                    {alimento.nombre}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {error && (
          <p className="text-red-500 text-xs bg-red-50 rounded-btn p-3 mb-4">{error}</p>
        )}

        {/* Navigation */}
        <div className="flex gap-3">
          <button
            onClick={handleBack}
            className="w-12 shrink-0 border border-lucy-border rounded-btn py-2.5 text-lucy-muted hover:border-lucy-soft transition-colors text-sm"
          >
            ←
          </button>
          <button
            onClick={handleNext}
            disabled={!canAdvance && !config.opcional || saving}
            className="flex-1 bg-lucy-accent text-white font-medium rounded-btn py-2.5 px-4 text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando...' : isLastStep ? '¡Generar!' : '→'}
          </button>
        </div>
      </div>
    </div>
  )
}
