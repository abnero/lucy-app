'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'
import ChatPanel from '@/components/ChatPanel'

interface CalendarioItem {
  dia: number
  comida: string
  cantidad: number
  unidad: string
  alimento: {
    nombre: string
    foto_url: string | null
  }
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const COMIDAS = [
  { key: 'desayuno', label: 'Desayuno' },
  { key: 'almuerzo', label: 'Almuerzo' },
  { key: 'cena', label: 'Cena' },
]

export default function MiCalendarioPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<CalendarioItem[]>([])
  const [diaActivo, setDiaActivo] = useState(1)
  const [loadingData, setLoadingData] = useState(true)
  const [nombre, setNombre] = useState('')
  const [showHint, setShowHint] = useState(true)
  const [slideClass, setSlideClass] = useState('')
  const animating = useRef(false)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const mealsRef = useRef<HTMLDivElement>(null)

  const fetchCalendar = useCallback(() => {
    if (!user) return
    supabase
      .from('calendario')
      .select('dia, comida, cantidad, unidad, alimento:alimentos(nombre, foto_url)')
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
          .select('dia, comida, cantidad, unidad, alimento:alimentos(nombre, foto_url)')
          .eq('user_id', user.id)
          .order('dia')
          .order('comida'),
        supabase
          .from('usuarios')
          .select('nombre')
          .eq('id', user.id)
          .single(),
      ]).then(([calRes, userRes]) => {
        if (calRes.data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setItems(calRes.data.map((r: any) => ({
            ...r,
            alimento: Array.isArray(r.alimento) ? r.alimento[0] : r.alimento,
          })))
        }
        if (userRes.data) setNombre(userRes.data.nombre)
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
          <h2 className="text-base text-lucy-text">{DIAS[diaActivo - 1]}</h2>
        </div>
      </div>

      {/* Swipe hint */}
      {showHint && (
        <div className="px-4 mb-3 transition-opacity duration-500">
          <p className="text-center text-[11px] text-lucy-soft">Desliza para ver los demás días →</p>
        </div>
      )}

      {/* Meals — swipeable */}
      <div
        ref={mealsRef}
        className="px-4 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={`max-w-lg mx-auto space-y-4 transition-all duration-150 ease-in-out ${slideClass}`}
        >
          {COMIDAS.map(({ key, label }) => {
            const comidaItems = itemsDelDia.filter(i => i.comida === key)
            if (comidaItems.length === 0) return null
            return (
              <div key={key} className="bg-lucy-white rounded-card border border-lucy-border p-4">
                <p className="text-xs text-lucy-muted mb-3 uppercase tracking-wider">{label}</p>
                <div className="space-y-3">
                  {comidaItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-lucy-bg shrink-0">
                        {item.alimento?.foto_url ? (
                          <img
                            src={item.alimento.foto_url}
                            alt={item.alimento.nombre}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-lucy-soft text-xs">?</div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-lucy-text">{item.alimento?.nombre}</p>
                        <p className="text-xs text-lucy-muted">{item.cantidad} {item.unidad}</p>
                      </div>
                    </div>
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
      <ChatPanel onDataChange={fetchCalendar} />

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-lucy-white border-t border-lucy-border">
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
