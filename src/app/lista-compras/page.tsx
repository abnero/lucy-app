'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'
import ChatPanel from '@/components/ChatPanel'
import FoodAvatar from '@/components/FoodAvatar'
import { toImperial } from '@/lib/units'

interface CompraItem {
  id: string
  cantidad_total: number
  unidad: string
  comprado: boolean
  alimento: {
    nombre: string
    foto_url: string | null
    categoria_supermercado: string | null
    unidad_medida: string
    unidad_display: string | null
    factor_conversion: number | null
  }
}

const CATEGORIAS: { key: string; label: string }[] = [
  { key: 'frutas_verduras', label: 'Frutas y Verduras' },
  { key: 'carnes', label: 'Carnes y Pescado' },
  { key: 'lacteos', label: 'Lácteos' },
  { key: 'granos_cereales', label: 'Granos y Cereales' },
  { key: 'enlatados', label: 'Enlatados' },
  { key: 'condimentos', label: 'Grasas Saludables' },
  { key: 'bebidas', label: 'Bebidas' },
  { key: 'congelados', label: 'Congelados' },
  { key: 'panaderia', label: 'Panadería' },
  { key: 'otro', label: 'Otros' },
]

export default function ListaComprasPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<CompraItem[]>([])
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
      return
    }
    if (!loading && user) {
      supabase
        .from('lista_compras')
        .select('id, cantidad_total, unidad, comprado, alimento:alimentos(nombre, foto_url, categoria_supermercado, unidad_medida, unidad_display, factor_conversion)')
        .eq('user_id', user.id)
        .then(({ data }) => {
          if (data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setItems(data.map((r: any) => ({
              ...r,
              alimento: Array.isArray(r.alimento) ? r.alimento[0] : r.alimento,
            })))
          }
          setLoadingData(false)
        })
    }
  }, [user, loading, router])

  const toggleComprado = async (item: CompraItem) => {
    const newVal = !item.comprado
    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, comprado: newVal } : i))
    await supabase.from('lista_compras').update({ comprado: newVal }).eq('id', item.id)
  }

  const comprados = items.filter(i => i.comprado).length
  const total = items.length

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lucy-muted text-sm">Cargando...</p>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-logo text-xl text-lucy-text">Lucy</h1>
            <p className="text-lucy-soft text-[9px] tracking-[0.25em] uppercase">calendario metabólico</p>
          </div>
          <p className="text-sm text-lucy-text">Lista de Compras</p>
        </div>
      </div>

      {/* Progress */}
      <div className="px-4 mb-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-lucy-muted">{comprados} de {total} comprados</p>
            {comprados === total && total > 0 && (
              <p className="text-xs text-lucy-accent font-medium">¡Listo!</p>
            )}
          </div>
          <div className="w-full h-1.5 bg-lucy-border rounded-full overflow-hidden">
            <div
              className="h-full bg-lucy-accent rounded-full transition-all duration-300"
              style={{ width: total > 0 ? `${(comprados / total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      </div>

      {/* Items by category */}
      <div className="px-4">
        <div className="max-w-lg mx-auto space-y-4">
          {CATEGORIAS.map(({ key, label }) => {
            const catItems = items.filter(i => (i.alimento?.categoria_supermercado || 'otro') === key)
            if (catItems.length === 0) return null
            return (
              <div key={key}>
                <p className="text-xs text-lucy-muted uppercase tracking-wider mb-2">{label}</p>
                <div className="bg-lucy-white rounded-card border border-lucy-border overflow-hidden">
                  {catItems.map((item, idx) => (
                    <button
                      key={item.id}
                      onClick={() => toggleComprado(item)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        item.comprado ? 'bg-[#FDE8E0]' : ''
                      } ${idx > 0 ? 'border-t border-lucy-border' : ''}`}
                    >
                      {/* Checkbox */}
                      <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                        item.comprado ? 'bg-lucy-accent border-lucy-accent' : 'border-lucy-soft'
                      }`}>
                        {item.comprado && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5.5L4 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>

                      {/* Avatar */}
                      <FoodAvatar nombre={item.alimento?.nombre || '?'} foto_url={item.alimento?.foto_url} size="sm" />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${
                          item.comprado ? 'line-through text-lucy-muted' : 'text-lucy-text'
                        }`}>
                          {item.alimento?.nombre}
                        </p>
                        <p className="text-xs text-lucy-muted">{item.alimento ? toImperial(item.cantidad_total, item.alimento) : `${item.cantidad_total} ${item.unidad}`}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}

          {items.length === 0 && (
            <div className="bg-lucy-white rounded-card border border-lucy-border p-8 text-center">
              <p className="text-sm text-lucy-muted">No hay items en tu lista de compras</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat */}
      <ChatPanel />

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-lucy-white border-t border-lucy-border pb-safe">
        <div className="max-w-lg mx-auto flex">
          <button
            onClick={() => router.push('/mi-calendario')}
            className="flex-1 py-3 flex flex-col items-center gap-0.5"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="3" width="16" height="14" rx="2" stroke="#9896B0" strokeWidth="1.5" fill="none" />
              <line x1="2" y1="7" x2="18" y2="7" stroke="#9896B0" strokeWidth="1.5" />
              <line x1="7" y1="3" x2="7" y2="7" stroke="#9896B0" strokeWidth="1.5" />
              <line x1="13" y1="3" x2="13" y2="7" stroke="#9896B0" strokeWidth="1.5" />
            </svg>
            <span className="text-[10px] text-lucy-muted">Calendario</span>
          </button>
          <button
            className="flex-1 py-3 flex flex-col items-center gap-0.5"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M6 4h12l-1.5 9H7.5L6 4z" stroke="#7B7FC4" strokeWidth="1.5" fill="none" />
              <circle cx="8.5" cy="16" r="1.5" stroke="#7B7FC4" strokeWidth="1.5" fill="none" />
              <circle cx="15" cy="16" r="1.5" stroke="#7B7FC4" strokeWidth="1.5" fill="none" />
              <path d="M6 4L5 2H2" stroke="#7B7FC4" strokeWidth="1.5" fill="none" />
            </svg>
            <span className="text-[10px] text-lucy-accent font-medium">Compras</span>
          </button>
          <button
            onClick={() => router.push('/mi-perfil')}
            className="flex-1 py-3 flex flex-col items-center gap-0.5"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="7" r="3.5" stroke="#9896B0" strokeWidth="1.5" fill="none" />
              <path d="M3 17.5c0-3 3.13-5.5 7-5.5s7 2.5 7 5.5" stroke="#9896B0" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
            <span className="text-[10px] text-lucy-muted">Perfil</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
