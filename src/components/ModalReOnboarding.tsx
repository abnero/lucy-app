'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import PreguntasActividad from '@/components/PreguntasActividad'
import { calcularMacros, RespuestasActividad, NivelActividad, Meta, Genero } from '@/lib/calculo-macros'

interface ModalReOnboardingProps {
  userId: string
  userData: {
    peso_kg: number
    altura_cm: number
    edad: number
    meta: Meta
    genero: Genero
  }
  onComplete: () => void
}

export default function ModalReOnboarding({ userId, userData, onComplete }: ModalReOnboardingProps) {
  const [nivel, setNivel] = useState<NivelActividad | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [planError, setPlanError] = useState(false)
  const [retrying, setRetrying] = useState(false)

  if (process.env.NEXT_PUBLIC_LUCY_REGEN_PAUSED === 'true') {
    return (
      <div className="fixed inset-0 z-50 bg-lucy-bg overflow-y-auto">
        <div className="max-w-md mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="font-logo text-2xl text-lucy-text">Lucy</h1>
            <p className="text-lucy-soft text-[10px] tracking-[0.25em] uppercase mt-1">calendario metabólico</p>
          </div>
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-sm text-lucy-text font-medium mb-2">Lucy está en mantenimiento</p>
            <p className="text-xs text-lucy-muted text-center mb-6 max-w-xs">Estamos haciendo mejoras. Tu plan actual sigue activo. Vuelve pronto.</p>
            <button onClick={onComplete} className="text-xs text-lucy-accent hover:opacity-80 transition-opacity">Cerrar</button>
          </div>
        </div>
      </div>
    )
  }

  const handlePreguntasChange = (_respuestas: RespuestasActividad, nivelCalculado: NivelActividad) => {
    setNivel(nivelCalculado)
  }

  const generarPlan = async (): Promise<boolean> => {
    try {
      const session = (await supabase.auth.getSession()).data.session
      const res = await fetch('/api/generar-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, accessToken: session?.access_token }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        const msg = data.error || `HTTP ${res.status}`
        console.error('[re-onboarding] generar-plan error:', msg)
        if (res.status === 429 || (typeof msg === 'string' && msg.toLowerCase().includes('rate'))) {
          setError('Estamos experimentando alta demanda, intenta en unos minutos.')
        } else {
          setError('No pudimos actualizar tu plan. Intenta de nuevo en unos minutos.')
        }
        return false
      }
      return true
    } catch (err) {
      console.error('[re-onboarding] generar-plan failed:', err)
      setError('No pudimos actualizar tu plan. Intenta de nuevo en unos minutos.')
      return false
    }
  }

  const handleContinuar = async () => {
    if (!nivel) return
    setSaving(true)
    setError('')
    setPlanError(false)

    const macros = calcularMacros(
      userData.peso_kg,
      userData.altura_cm,
      userData.edad,
      nivel,
      userData.meta,
      userData.genero
    )

    // Paso 1: UPDATE macros + nivel, SIN re_onboarding_completado
    const { error: dbErr } = await supabase
      .from('usuarios')
      .update({
        nivel_actividad: nivel,
        calorias_objetivo: macros.calorias,
        proteina_objetivo: macros.proteina,
        carbs_objetivo: macros.carbs,
        grasas_objetivo: macros.grasas,
      })
      .eq('id', userId)

    if (dbErr) {
      setError('Error al guardar: ' + dbErr.message)
      setSaving(false)
      return
    }

    // Paso 2: generar-plan
    const ok = await generarPlan()

    if (!ok) {
      setPlanError(true)
      setSaving(false)
      return
    }

    // Paso 3: SOLO si generar-plan fue exitoso, marcar completado
    await supabase
      .from('usuarios')
      .update({ re_onboarding_completado: true })
      .eq('id', userId)

    onComplete()
  }

  const handleRetry = async () => {
    setRetrying(true)
    setError('')

    const ok = await generarPlan()

    if (!ok) {
      setRetrying(false)
      return
    }

    await supabase
      .from('usuarios')
      .update({ re_onboarding_completado: true })
      .eq('id', userId)

    onComplete()
  }

  const handleClose = () => {
    // Banner volverá a aparecer porque re_onboarding_completado sigue FALSE
    onComplete()
  }

  return (
    <div className="fixed inset-0 z-50 bg-lucy-bg overflow-y-auto">
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-logo text-2xl text-lucy-text">Lucy</h1>
          <p className="text-lucy-soft text-[10px] tracking-[0.25em] uppercase mt-1">calendario metabólico</p>
        </div>

        {saving ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-3 border-lucy-border border-t-lucy-accent rounded-full animate-spin mb-4" />
            <p className="text-sm text-lucy-text">Actualizando tu plan con tus nuevas macros...</p>
          </div>
        ) : planError ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-sm text-lucy-text font-medium mb-2">Hubo un problema</p>
            <p className="text-xs text-lucy-muted text-center mb-6 max-w-xs">{error}</p>
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="w-full max-w-xs bg-lucy-accent text-white font-medium rounded-btn py-2.5 px-4 text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mb-3"
            >
              {retrying ? 'Reintentando...' : 'Reintentar'}
            </button>
            <button
              onClick={handleClose}
              disabled={retrying}
              className="text-xs text-lucy-muted hover:text-lucy-accent transition-colors disabled:opacity-50"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <h2 className="text-lg text-lucy-text font-medium">Actualicemos tu plan</h2>
              <p className="text-xs text-lucy-muted mt-1">3 preguntas rápidas sobre tu día típico</p>
            </div>

            <PreguntasActividad onChange={handlePreguntasChange} />

            {error && (
              <p className="text-red-500 text-xs bg-red-50 rounded-btn p-3 mt-4">{error}</p>
            )}

            <button
              onClick={handleContinuar}
              disabled={!nivel}
              className="w-full mt-6 bg-lucy-accent text-white font-medium rounded-btn py-2.5 px-4 text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continuar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
