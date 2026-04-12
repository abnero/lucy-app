'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import FoodAvatar from '@/components/FoodAvatar'

export interface WizardAlimento {
  id: string
  nombre: string
  foto_url: string | null
  categoria_comida: string
  calorias_por_unidad: number
  proteina_por_unidad: number
  carbs_por_unidad: number
  grasas_por_unidad: number
  porcion_base: number
  porcion_min: number
  porcion_max: number
  unidad_medida: string
  unidad_display: string | null
  factor_conversion: number | null
  rol_permitido: string[]
}

interface FoodWizardProps {
  rolPermitido: string[]
  userId: string
  titulo: string
  onSelect: (alimento: WizardAlimento) => void
  onClose: () => void
}

export default function FoodWizard({ rolPermitido, userId, titulo, onSelect, onClose }: FoodWizardProps) {
  const [alimentos, setAlimentos] = useState<WizardAlimento[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('alimentos')
      .select('id, nombre, foto_url, categoria_comida, calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad, porcion_base, porcion_min, porcion_max, unidad_medida, unidad_display, factor_conversion, rol_permitido')
      .overlaps('rol_permitido', rolPermitido)
      .or(`es_personalizado.is.null,es_personalizado.eq.false,and(es_personalizado.eq.true,creado_por.eq.${userId})`)
      .order('nombre')
      .then(({ data }) => {
        setAlimentos((data as WizardAlimento[]) ?? [])
        setLoading(false)
      })
  }, [rolPermitido, userId])

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-[20px] max-h-[85vh] flex flex-col animate-macroIn">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-lucy-border shrink-0">
          <h2 className="text-sm font-medium text-lucy-text">{titulo}</h2>
          <button onClick={onClose} className="text-lucy-muted text-xs hover:text-lucy-accent transition-colors">
            Cerrar
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-lucy-muted text-sm">Cargando alimentos...</p>
            </div>
          ) : alimentos.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-lucy-muted">No hay alimentos disponibles</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {alimentos.map(alimento => (
                <button
                  key={alimento.id}
                  onClick={() => onSelect(alimento)}
                  className="rounded-card border border-lucy-border bg-lucy-white p-4 flex flex-col items-center gap-3 hover:border-lucy-accent transition-colors"
                >
                  <FoodAvatar nombre={alimento.nombre} foto_url={alimento.foto_url} size="lg" />
                  <span className="text-xs text-lucy-text text-center leading-tight">
                    {alimento.nombre}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
