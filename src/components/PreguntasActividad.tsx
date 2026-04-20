'use client'

import { useState } from 'react'
import { RespuestasActividad, NivelActividad, calcularNivelDesdeRespuestas, DESCRIPCIONES_NIVEL } from '@/lib/calculo-macros'

interface PreguntasActividadProps {
  respuestasIniciales?: RespuestasActividad
  onChange: (respuestas: RespuestasActividad, nivel: NivelActividad) => void
}

const PREGUNTAS = [
  {
    key: 'horasSentada' as const,
    pregunta: '¿Cuántas horas pasas sentada en un día típico entre semana?',
    ayuda: 'Cuenta trabajo, carro, comer, sofá',
    opciones: [
      { label: 'Más de 7 horas', score: 0 as const },
      { label: 'Entre 4 y 7 horas', score: 1 as const },
      { label: 'Menos de 4 horas', score: 2 as const },
    ],
  },
  {
    key: 'movimientoResto' as const,
    pregunta: 'Cuando no estás sentada, ¿cómo es tu día?',
    ayuda: null,
    opciones: [
      { label: 'Mayormente quieta', score: 0 as const },
      { label: 'Me paro, camino entre pendientes, subo escaleras', score: 1 as const },
      { label: 'De pie o caminando la mayor parte del tiempo', score: 2 as const },
    ],
  },
  {
    key: 'ejercicioPorSemana' as const,
    pregunta: '¿Cuántas veces por semana haces ejercicio formal?',
    ayuda: 'Gym, pesas, caminata planificada, clase de baile, yoga, etc.',
    opciones: [
      { label: '0 o 1 veces', score: 0 as const },
      { label: '2 o 3 veces', score: 1 as const },
      { label: '4 o más veces', score: 2 as const },
    ],
  },
]

export default function PreguntasActividad({ respuestasIniciales, onChange }: PreguntasActividadProps) {
  const [respuestas, setRespuestas] = useState<Partial<RespuestasActividad>>(
    respuestasIniciales ?? {}
  )

  const handleSelect = (key: keyof RespuestasActividad, score: 0 | 1 | 2) => {
    const updated = { ...respuestas, [key]: score }
    setRespuestas(updated)

    // Check if all 3 are answered
    if (updated.horasSentada !== undefined && updated.movimientoResto !== undefined && updated.ejercicioPorSemana !== undefined) {
      const completas = updated as RespuestasActividad
      const nivel = calcularNivelDesdeRespuestas(completas)
      onChange(completas, nivel)
    }
  }

  const todasContestadas = respuestas.horasSentada !== undefined && respuestas.movimientoResto !== undefined && respuestas.ejercicioPorSemana !== undefined
  const nivelCalculado = todasContestadas ? calcularNivelDesdeRespuestas(respuestas as RespuestasActividad) : null

  return (
    <div className="space-y-6">
      {PREGUNTAS.map((p) => (
        <div key={p.key}>
          <label className="block text-sm text-lucy-text font-medium mb-1">{p.pregunta}</label>
          {p.ayuda && <p className="text-xs text-lucy-muted mb-2">{p.ayuda}</p>}
          <div className="space-y-2">
            {p.opciones.map((op) => {
              const isSelected = respuestas[p.key] === op.score
              return (
                <button
                  key={op.score}
                  type="button"
                  onClick={() => handleSelect(p.key, op.score)}
                  className={`w-full text-left px-4 py-3 rounded-btn border transition-colors text-sm ${
                    isSelected
                      ? 'border-lucy-accent bg-lucy-accent/5 text-lucy-text font-medium'
                      : 'border-lucy-border text-lucy-text hover:border-lucy-soft'
                  }`}
                >
                  {op.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* Level result */}
      <div className="bg-lucy-bg rounded-card border border-lucy-border p-4 text-center">
        {nivelCalculado ? (
          <>
            <p className="text-xs text-lucy-muted uppercase tracking-wider mb-1">Tu nivel de actividad</p>
            <p className="text-sm text-lucy-text font-medium">{DESCRIPCIONES_NIVEL[nivelCalculado]}</p>
          </>
        ) : (
          <p className="text-xs text-lucy-muted">Contesta las 3 preguntas para ver tu nivel</p>
        )}
      </div>
    </div>
  )
}
