'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'

interface CursoParte {
  id: number
  numero: number
  titulo: string
  orden: number
}

interface CursoModulo {
  id: number
  parte_id: number
  numero_en_parte: number
  slug: string
  titulo: string
  duracion: string | null
  orden_global: number
}

export default function EducacionPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [partes, setPartes] = useState<CursoParte[]>([])
  const [modulos, setModulos] = useState<CursoModulo[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [openParte, setOpenParte] = useState<number | null>(null)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
      return
    }
    if (!loading && user) {
      supabase.from('usuarios').select('onboarding_completado').eq('id', user.id).single().then(({ data: userData }) => {
        if (!userData || !userData.onboarding_completado) {
          router.push('/onboarding')
          return
        }

        Promise.all([
          supabase.from('curso_partes').select('id, numero, titulo, orden').order('orden'),
          supabase.from('curso_modulos').select('id, parte_id, numero_en_parte, slug, titulo, duracion, orden_global').order('orden_global'),
        ]).then(([partesRes, modulosRes]) => {
          if (partesRes.data) {
            setPartes(partesRes.data)
            if (partesRes.data.length > 0) setOpenParte(partesRes.data[0].id)
          }
          if (modulosRes.data) setModulos(modulosRes.data)
          setLoadingData(false)
        })
      })
    }
  }, [user, loading, router])

  if (loading || loadingData) {
    return (
      <div className="min-h-screen bg-lucy-bg flex items-center justify-center">
        <div className="text-lucy-accent text-lg font-medium">Cargando curso...</div>
      </div>
    )
  }

  const modulosPorParte = (parteId: number) => modulos.filter(m => m.parte_id === parteId)

  return (
    <div className="min-h-screen bg-lucy-bg pb-24">
      {/* Header */}
      <header className="bg-white border-b border-lucy-border px-4 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold text-lucy-text">Curso de Activación Metabólica</h1>
          <p className="text-sm text-lucy-muted mt-1">Las 5 Áreas Fundamentales del Fitness: Nutrición, Ejercicio, Descanso, Hidratación y Salud Mental</p>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto px-4 py-6">
        {partes.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-lucy-muted text-lg">No hay contenido disponible todavía.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {partes.map((parte) => {
              const isOpen = openParte === parte.id
              const partModulos = modulosPorParte(parte.id)

              return (
                <div key={parte.id} className="bg-white rounded-xl border border-lucy-border overflow-hidden">
                  {/* Parte header (accordion toggle) */}
                  <button
                    onClick={() => setOpenParte(isOpen ? null : parte.id)}
                    className="w-full px-4 py-4 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-lucy-accent/10 text-lucy-accent text-sm font-bold flex items-center justify-center">
                        {parte.numero}
                      </span>
                      <span className="font-semibold text-lucy-text text-[15px] leading-tight">
                        {parte.titulo}
                      </span>
                    </div>
                    <svg
                      width="20" height="20" viewBox="0 0 20 20" fill="none"
                      className={`flex-shrink-0 text-lucy-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    >
                      <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {/* Modules list */}
                  {isOpen && (
                    <div className="border-t border-lucy-border">
                      {partModulos.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-lucy-muted">Sin módulos disponibles</p>
                      ) : (
                        partModulos.map((mod) => (
                          <button
                            key={mod.id}
                            onClick={() => router.push(`/educacion/${mod.slug}`)}
                            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-lucy-bg/50 transition-colors border-b border-lucy-border/50 last:border-b-0"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="flex-shrink-0 text-xs text-lucy-muted font-medium w-5 text-right">
                                {mod.numero_en_parte}.
                              </span>
                              <span className="text-sm text-lucy-text truncate">
                                {mod.titulo}
                              </span>
                            </div>
                            {mod.duracion && (
                              <span className="flex-shrink-0 ml-2 text-[11px] text-lucy-muted bg-lucy-bg px-2 py-0.5 rounded-full">
                                {mod.duracion}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

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
            onClick={() => router.push('/mis-rutinas')}
            className="flex-1 py-3 flex flex-col items-center gap-0.5"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="4" y="9" width="12" height="2" rx="1" stroke="#9896B0" strokeWidth="1.5" fill="none" />
              <rect x="2" y="7" width="3" height="6" rx="1" stroke="#9896B0" strokeWidth="1.5" fill="none" />
              <rect x="15" y="7" width="3" height="6" rx="1" stroke="#9896B0" strokeWidth="1.5" fill="none" />
            </svg>
            <span className="text-[10px] text-lucy-muted">Rutinas</span>
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
            className="flex-1 py-3 flex flex-col items-center gap-0.5"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 17h14M5 17V9l5-5 5 5v8" stroke="#7B7FC4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <rect x="8" y="12" width="4" height="5" rx="0.5" stroke="#7B7FC4" strokeWidth="1.5" fill="none" />
            </svg>
            <span className="text-[10px] text-lucy-accent font-medium">Educación</span>
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
