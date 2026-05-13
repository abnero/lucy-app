'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'

interface CursoModulo {
  id: number
  parte_id: number
  numero_en_parte: number
  slug: string
  titulo: string
  descripcion: string | null
  duracion: string | null
  video_url: string
  orden_global: number
}

interface CursoParte {
  id: number
  numero: number
  titulo: string
}

export default function ModuloPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string

  const [modulo, setModulo] = useState<CursoModulo | null>(null)
  const [parte, setParte] = useState<CursoParte | null>(null)
  const [prevSlug, setPrevSlug] = useState<string | null>(null)
  const [nextSlug, setNextSlug] = useState<string | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [notFound, setNotFound] = useState(false)

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

        // Fetch current module
        supabase
          .from('curso_modulos')
          .select('id, parte_id, numero_en_parte, slug, titulo, descripcion, duracion, video_url, orden_global')
          .eq('slug', slug)
          .single()
          .then(({ data: modData, error }) => {
            if (error || !modData) {
              setNotFound(true)
              setLoadingData(false)
              return
            }

            setModulo(modData)

            // Fetch parte info
            supabase.from('curso_partes').select('id, numero, titulo').eq('id', modData.parte_id).single().then(({ data: parteData }) => {
              if (parteData) setParte(parteData)
            })

            // Fetch prev/next by orden_global
            Promise.all([
              supabase
                .from('curso_modulos')
                .select('slug')
                .lt('orden_global', modData.orden_global)
                .order('orden_global', { ascending: false })
                .limit(1),
              supabase
                .from('curso_modulos')
                .select('slug')
                .gt('orden_global', modData.orden_global)
                .order('orden_global', { ascending: true })
                .limit(1),
            ]).then(([prevRes, nextRes]) => {
              if (prevRes.data && prevRes.data.length > 0) setPrevSlug(prevRes.data[0].slug)
              if (nextRes.data && nextRes.data.length > 0) setNextSlug(nextRes.data[0].slug)
              setLoadingData(false)
            })
          })
      })
    }
  }, [user, loading, router, slug])

  if (loading || loadingData) {
    return (
      <div className="min-h-screen bg-lucy-bg flex items-center justify-center">
        <div className="text-lucy-accent text-lg font-medium">Cargando módulo...</div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-lucy-bg flex flex-col items-center justify-center gap-4 px-4">
        <h1 className="text-2xl font-bold text-lucy-text">Módulo no encontrado</h1>
        <p className="text-lucy-muted text-center">Este módulo no existe o no está disponible.</p>
        <button
          onClick={() => router.push('/educacion')}
          className="mt-4 px-6 py-3 bg-lucy-accent text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          Volver al curso
        </button>
      </div>
    )
  }

  if (!modulo) return null

  return (
    <div className="min-h-screen bg-lucy-bg">
      {/* Header */}
      <header className="bg-white border-b border-lucy-border px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => router.push('/educacion')}
            className="flex items-center gap-2 text-lucy-accent text-sm font-medium mb-2"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Volver al curso
          </button>
          {parte && (
            <p className="text-xs text-lucy-muted uppercase tracking-wide">
              Parte {parte.numero} — {parte.titulo}
            </p>
          )}
          <h1 className="text-lg font-bold text-lucy-text mt-1">{modulo.titulo}</h1>
          {modulo.duracion && (
            <span className="inline-block mt-1 text-[11px] text-lucy-muted bg-lucy-bg px-2 py-0.5 rounded-full">
              {modulo.duracion}
            </span>
          )}
        </div>
      </header>

      {/* Video player */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="w-full bg-black rounded-xl overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
          <video
            src={modulo.video_url}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-contain"
          />
        </div>

        {/* Description */}
        {modulo.descripcion && (
          <div className="mt-6 p-4 bg-white rounded-xl border border-lucy-border">
            <p className="text-sm text-lucy-text leading-relaxed">{modulo.descripcion}</p>
          </div>
        )}

        {/* Prev/Next navigation */}
        <div className="mt-6 flex justify-between gap-4">
          {prevSlug ? (
            <button
              onClick={() => router.push(`/educacion/${prevSlug}`)}
              className="flex-1 py-3 px-4 bg-white border border-lucy-border rounded-xl text-sm font-medium text-lucy-text hover:border-lucy-accent transition-colors text-left"
            >
              ← Módulo anterior
            </button>
          ) : <div className="flex-1" />}
          {nextSlug ? (
            <button
              onClick={() => router.push(`/educacion/${nextSlug}`)}
              className="flex-1 py-3 px-4 bg-lucy-accent text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity text-right"
            >
              Módulo siguiente →
            </button>
          ) : <div className="flex-1" />}
        </div>
      </main>
    </div>
  )
}
