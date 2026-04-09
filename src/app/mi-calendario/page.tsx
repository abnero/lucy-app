'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'
import ChatPanel from '@/components/ChatPanel'
import FoodAvatar from '@/components/FoodAvatar'

interface CalendarioItem {
  dia: number
  comida: string
  cantidad: number
  unidad: string
  alimento: {
    nombre: string
    foto_url: string | null
    categoria_comida: string
    calorias_por_unidad: number
    proteina_por_unidad: number
    carbs_por_unidad: number
    grasas_por_unidad: number
    porcion_base: number
    unidad_medida: string
  }
}

const ORDEN_CATEGORIA: Record<string, number> = {
  proteina: 1, carbohidrato: 2, vegetal: 3, grasa: 4,
  fruta: 5, lacteo: 5, bebida: 5, condimento: 5, otro: 6,
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const COMIDAS = [
  { key: 'desayuno', label: 'Desayuno' },
  { key: 'almuerzo', label: 'Almuerzo' },
  { key: 'cena', label: 'Cena' },
  { key: 'snack', label: 'Snack' },
]

export default function MiCalendarioPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<CalendarioItem[]>([])
  const [diaActivo, setDiaActivo] = useState(() => {
    const jsDay = new Date().getDay() // 0=Sun, 1=Mon, ..., 6=Sat
    return jsDay === 0 ? 7 : jsDay // 1=Mon, ..., 7=Sun
  })
  const [loadingData, setLoadingData] = useState(true)
  const [nombre, setNombre] = useState('')
  const [showHint, setShowHint] = useState(true)
  const [macroPopup, setMacroPopup] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<CalendarioItem | null>(null)
  const [showDayMacros, setShowDayMacros] = useState(false)
  const [objetivos, setObjetivos] = useState({ cal: 0, prot: 0, carbs: 0, grasas: 0 })
  const [slideClass, setSlideClass] = useState('')
  const animating = useRef(false)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const mealsRef = useRef<HTMLDivElement>(null)

  const fetchCalendar = useCallback(() => {
    if (!user) return
    console.log('[Calendar] fetchCalendar triggered')
    supabase
      .from('calendario')
      .select('dia, comida, cantidad, unidad, alimento:alimentos(nombre, foto_url, categoria_comida, calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad, porcion_base, unidad_medida)')
      .eq('user_id', user.id)
      .order('dia')
      .order('comida')
      .then(({ data }) => {
        if (data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setItems(data.map((r: any) => ({
            ...r,
            alimento: Array.isArray(r.alimento) ? r.alimento[0] : r.alimento,
          })))
        }
      })
  }, [user])

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
      return
    }
    if (!loading && user) {
      Promise.all([
        supabase
          .from('calendario')
          .select('dia, comida, cantidad, unidad, alimento:alimentos(nombre, foto_url, categoria_comida, calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad, porcion_base, unidad_medida)')
          .eq('user_id', user.id)
          .order('dia')
          .order('comida'),
        supabase
          .from('usuarios')
          .select('nombre, calorias_objetivo, proteina_objetivo, carbs_objetivo, grasas_objetivo')
          .eq('id', user.id)
          .single(),
      ]).then(([calRes, userRes]) => {
        if (calRes.error) console.error('Calendar fetch error:', calRes.error.message)
        if (calRes.data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setItems(calRes.data.map((r: any) => ({
            ...r,
            alimento: Array.isArray(r.alimento) ? r.alimento[0] : r.alimento,
          })))
        }
        if (userRes.data) {
          setNombre(userRes.data.nombre)
          setObjetivos({
            cal: userRes.data.calorias_objetivo || 0,
            prot: userRes.data.proteina_objetivo || 0,
            carbs: userRes.data.carbs_objetivo || 0,
            grasas: userRes.data.grasas_objetivo || 0,
          })
        }
        setLoadingData(false)
      }).catch(err => {
        console.error('Calendar load failed:', err)
        setLoadingData(false)
      })
    }
  }, [user, loading, router])

  // Hide swipe hint after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  // Swipe with slide animation
  const changeDia = useCallback((newDia: number, direction: 'left' | 'right') => {
    if (animating.current) return
    animating.current = true
    // Exit: slide current content out
    setSlideClass(direction === 'left' ? '-translate-x-full opacity-0' : 'translate-x-full opacity-0')
    setTimeout(() => {
      // Swap day, position new content on opposite side instantly
      setDiaActivo(newDia)
      setMacroPopup(null)
      setShowDayMacros(false)
      setSlideClass(
        (direction === 'left' ? 'translate-x-full' : '-translate-x-full') + ' opacity-0 !duration-0'
      )
      // Next frame: slide in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSlideClass('translate-x-0 opacity-100')
          setTimeout(() => { animating.current = false }, 150)
        })
      })
    }, 150)
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (animating.current) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && diaActivo < 7) changeDia(diaActivo + 1, 'left')
      if (dx > 0 && diaActivo > 1) changeDia(diaActivo - 1, 'right')
    }
  }, [diaActivo, changeDia])

  const itemsDelDia = items.filter(i => i.dia === diaActivo)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lucy-muted text-sm">Cargando...</p>
      </div>
    )
  }

  if (!user) {
    router.push('/login')
    return null
  }

  if (loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lucy-muted text-sm">Cargando calendario...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-logo text-xl text-lucy-text">Lucy</h1>
            <p className="text-lucy-soft text-[9px] tracking-[0.25em] uppercase">calendario metabólico</p>
          </div>
          <p className="text-sm text-lucy-text">Hola, <span className="font-medium">{nombre}</span></p>
        </div>
      </div>

      {/* Day tabs */}
      <div className="px-4 mb-4">
        <div className="max-w-lg mx-auto">
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
            {DIAS.map((dia, i) => (
              <button
                key={i}
                onClick={() => {
                  const newDia = i + 1
                  if (newDia === diaActivo || animating.current) return
                  changeDia(newDia, newDia > diaActivo ? 'left' : 'right')
                }}
                className={`shrink-0 px-3 py-2 rounded-btn text-xs transition-colors ${
                  diaActivo === i + 1
                    ? 'bg-lucy-accent text-white'
                    : 'bg-lucy-white border border-lucy-border text-lucy-muted hover:border-lucy-soft'
                }`}
              >
                {dia.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Day title */}
      <div className="px-4 mb-4">
        <div className="max-w-lg mx-auto">
          <button onClick={() => setShowDayMacros(true)}>
            <h2 className="text-base text-lucy-text">{DIAS[diaActivo - 1]}</h2>
          </button>
        </div>
      </div>

      {/* Day macros modal */}
      {showDayMacros && (() => {
        const dayMacros = itemsDelDia.reduce((acc, item) => {
          const a = item.alimento
          if (!a) return acc
          const ratio = a.unidad_medida === 'unidad' ? item.cantidad : item.cantidad / (a.porcion_base || 100)
          return {
            cal: acc.cal + a.calorias_por_unidad * ratio,
            prot: acc.prot + a.proteina_por_unidad * ratio,
            carbs: acc.carbs + a.carbs_por_unidad * ratio,
            grasas: acc.grasas + a.grasas_por_unidad * ratio,
          }
        }, { cal: 0, prot: 0, carbs: 0, grasas: 0 })

        return (
          <>
            <div className="fixed inset-0 bg-black/20 z-30" onClick={() => setShowDayMacros(false)} />
            <div className="fixed inset-0 z-40 flex items-center justify-center px-6 pointer-events-none">
              <div className="bg-lucy-white rounded-card border border-lucy-border p-6 w-full max-w-xs pointer-events-auto animate-macroIn">
                <div className="text-center mb-4">
                  <p className="text-2xl mb-1">📅</p>
                  <p className="text-sm font-medium text-lucy-text">Macros del día</p>
                  <p className="text-xs text-lucy-muted">{DIAS[diaActivo - 1]}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { label: 'Calorías', value: Math.round(dayMacros.cal), target: objetivos.cal, unit: 'kcal' },
                    { label: 'Proteína', value: Math.round(dayMacros.prot), target: objetivos.prot, unit: 'g' },
                    { label: 'Carbs', value: Math.round(dayMacros.carbs), target: objetivos.carbs, unit: 'g' },
                    { label: 'Grasas', value: Math.round(dayMacros.grasas), target: objetivos.grasas, unit: 'g' },
                  ].map(m => (
                    <div key={m.label} className="border border-lucy-border rounded-btn p-3 text-center">
                      <p className="text-[11px] text-lucy-muted mb-1">{m.label}</p>
                      <p className="text-[32px] font-semibold text-lucy-text leading-none">{m.value.toLocaleString()}</p>
                      <p className="text-[11px] text-lucy-muted mt-0.5">{m.unit}</p>
                      <p className="text-[13px] text-lucy-soft">/ {m.target.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowDayMacros(false)}
                  className="w-full text-xs text-lucy-muted hover:text-lucy-accent transition-colors py-1"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </>
        )
      })()}

      {/* Swipe hint */}
      {showHint && (
        <div className="px-4 mb-3 transition-opacity duration-500">
          <p className="text-center text-[11px] text-lucy-soft">Desliza para ver los demás días →</p>
        </div>
      )}

      {/* Meals — swipeable */}
      <div
        ref={mealsRef}
        className="px-4 overflow-x-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={`max-w-lg mx-auto space-y-4 transition-all duration-150 ease-in-out ${slideClass}`}
        >
          {COMIDAS.map(({ key, label }) => {
            const comidaItems = itemsDelDia
              .filter(i => i.comida === key)
              .sort((a, b) => (ORDEN_CATEGORIA[a.alimento?.categoria_comida] || 6) - (ORDEN_CATEGORIA[b.alimento?.categoria_comida] || 6))
            if (comidaItems.length === 0) return null
            // Calculate macros for this meal
            const mealMacros = comidaItems.reduce((acc, item) => {
              const a = item.alimento
              if (!a) return acc
              const ratio = a.unidad_medida === 'unidad' ? item.cantidad : item.cantidad / (a.porcion_base || 100)
              return {
                cal: acc.cal + a.calorias_por_unidad * ratio,
                prot: acc.prot + a.proteina_por_unidad * ratio,
                carbs: acc.carbs + a.carbs_por_unidad * ratio,
                grasas: acc.grasas + a.grasas_por_unidad * ratio,
              }
            }, { cal: 0, prot: 0, carbs: 0, grasas: 0 })

            const popupKey = `${diaActivo}-${key}`
            const isPopupOpen = macroPopup === popupKey

            return (
              <div key={key} className="bg-lucy-white rounded-card border border-lucy-border p-4">
                <button
                  onClick={() => setMacroPopup(isPopupOpen ? null : popupKey)}
                  className="text-xs text-lucy-muted mb-3 uppercase tracking-wider flex items-center gap-1.5"
                >
                  {label}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform ${isPopupOpen ? 'rotate-180' : ''}`}>
                    <path d="M2 4l3 3 3-3" stroke="#9896B0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Macro popup */}
                {isPopupOpen && (
                  <div className="mb-3 grid grid-cols-4 gap-1.5 animate-macroIn">
                    {[
                      { label: 'Cal', value: Math.round(mealMacros.cal), unit: 'kcal' },
                      { label: 'Prot', value: Math.round(mealMacros.prot), unit: 'g' },
                      { label: 'Carbs', value: Math.round(mealMacros.carbs), unit: 'g' },
                      { label: 'Grasas', value: Math.round(mealMacros.grasas), unit: 'g' },
                    ].map(m => (
                      <div key={m.label} className="border border-lucy-border rounded-btn p-2 text-center">
                        <p className="text-sm font-medium text-lucy-text leading-tight">{m.value}</p>
                        <p className="text-[9px] text-lucy-muted">{m.label}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  {comidaItems.map((item, idx) => (
                    <button key={idx} className="flex items-center gap-3 w-full text-left" onClick={() => setSelectedItem(item)}>
                      <FoodAvatar nombre={item.alimento?.nombre || '?'} foto_url={item.alimento?.foto_url} />
                      <div>
                        <p className="text-sm text-lucy-text">{item.alimento?.nombre}</p>
                        <p className="text-xs text-lucy-muted">{item.cantidad} {item.unidad}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}

          {itemsDelDia.length === 0 && (
            <div className="bg-lucy-white rounded-card border border-lucy-border p-8 text-center">
              <p className="text-sm text-lucy-muted">No hay comidas programadas para este día</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat */}
      {/* Food detail modal */}
      {selectedItem && selectedItem.alimento && (() => {
        const a = selectedItem.alimento
        const ratio = a.unidad_medida === 'unidad' ? selectedItem.cantidad : selectedItem.cantidad / (a.porcion_base || 100)
        const r1 = (n: number) => Math.round(n * ratio * 10) / 10
        return (
          <>
            <div className="fixed inset-0 bg-black/20 z-30" onClick={() => setSelectedItem(null)} />
            <div className="fixed inset-0 z-40 flex items-center justify-center px-6 pointer-events-none">
              <div className="bg-lucy-white rounded-card border border-lucy-border p-6 w-full max-w-xs pointer-events-auto animate-macroIn">
                <div className="flex flex-col items-center mb-4">
                  <div className="mb-2">
                    <FoodAvatar nombre={a.nombre} foto_url={a.foto_url} size="lg" />
                  </div>
                  <p className="text-sm font-medium text-lucy-text">{a.nombre}</p>
                  <p className="text-lg text-lucy-accent font-medium">{selectedItem.cantidad} {selectedItem.unidad}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { label: 'Calorías', value: r1(a.calorias_por_unidad), unit: 'kcal' },
                    { label: 'Proteína', value: r1(a.proteina_por_unidad), unit: 'g' },
                    { label: 'Carbs', value: r1(a.carbs_por_unidad), unit: 'g' },
                    { label: 'Grasas', value: r1(a.grasas_por_unidad), unit: 'g' },
                  ].map(m => (
                    <div key={m.label} className="border border-lucy-border rounded-btn p-3 text-center">
                      <p className="text-xl font-medium text-lucy-text leading-tight">{m.value}</p>
                      <p className="text-[10px] text-lucy-muted">{m.unit}</p>
                      <p className="text-[10px] text-lucy-muted">{m.label}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="w-full text-xs text-lucy-muted hover:text-lucy-accent transition-colors py-1"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </>
        )
      })()}

      <ChatPanel onDataChange={fetchCalendar} />

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-lucy-white border-t border-lucy-border pb-safe">
        <div className="max-w-lg mx-auto flex">
          <button
            className="flex-1 py-3 flex flex-col items-center gap-0.5"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="3" width="16" height="14" rx="2" stroke="#7B7FC4" strokeWidth="1.5" fill="none" />
              <line x1="2" y1="7" x2="18" y2="7" stroke="#7B7FC4" strokeWidth="1.5" />
              <line x1="7" y1="3" x2="7" y2="7" stroke="#7B7FC4" strokeWidth="1.5" />
              <line x1="13" y1="3" x2="13" y2="7" stroke="#7B7FC4" strokeWidth="1.5" />
            </svg>
            <span className="text-[10px] text-lucy-accent font-medium">Calendario</span>
          </button>
          <button
            onClick={() => router.push('/lista-compras')}
            className="flex-1 py-3 flex flex-col items-center gap-0.5"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M6 4h12l-1.5 9H7.5L6 4z" stroke="#9896B0" strokeWidth="1.5" fill="none" />
              <circle cx="8.5" cy="16" r="1.5" stroke="#9896B0" strokeWidth="1.5" fill="none" />
              <circle cx="15" cy="16" r="1.5" stroke="#9896B0" strokeWidth="1.5" fill="none" />
              <path d="M6 4L5 2H2" stroke="#9896B0" strokeWidth="1.5" fill="none" />
            </svg>
            <span className="text-[10px] text-lucy-muted">Compras</span>
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
