'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import Lottie from 'lottie-react'
import spinnerBeach from '@/animations/spinner-beach.json'

const MENSAJES_ONBOARDING = [
  'Lucy está preparando tu plan...',
  'Calculando tus porciones perfectas...',
  'Organizando tu semana deliciosa...',
  '¡Casi listo!',
]

const MENSAJES_ACTUALIZACION = [
  'Estoy actualizando tu plan...',
  'Como ajustaste tus datos, tus macros cambiaron.',
  'Estoy recalculando las cantidades de tus alimentos para que sigas dentro de tu meta.',
  '¡Ya casi está listo!',
]

export default function GenerandoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-lucy-muted text-sm">Cargando...</p></div>}>
      <GenerandoContent />
    </Suspense>
  )
}

function GenerandoContent() {
  const { user, session, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const modo = searchParams.get('modo')
  const forceRegenerate = modo === 'wizard'
  const mensajes = modo === 'actualizacion' ? MENSAJES_ACTUALIZACION : MENSAJES_ONBOARDING
  const [msgIndex, setMsgIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const started = useRef(false)

  // Rotate messages
  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex(prev => (prev + 1) % mensajes.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [mensajes.length])

  // Animate progress gradually up to 90%
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return 90
        return prev + Math.random() * 8 + 2
      })
    }, 800)
    return () => clearInterval(interval)
  }, [])

  // Call API
  useEffect(() => {
    if (loading || !user || !session || started.current) return
    started.current = true

    fetch('/api/generar-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        accessToken: session.access_token,
        ...(forceRegenerate && { forceRegenerate: true }),
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
          return
        }
        setProgress(100)
        setMsgIndex(3)
        setTimeout(() => router.push('/mi-calendario'), 1200)
      })
      .catch(() => {
        setError('Error de conexión. Verifica tu internet e intenta de nuevo.')
      })
  }, [user, session, loading, router])

  if (loading) return null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="text-center mb-10">
        <h1 className="font-logo text-2xl text-lucy-text">Lucy</h1>
        <p className="text-lucy-soft text-[10px] tracking-[0.25em] uppercase">calendario metabólico</p>
      </div>

      {/* Lottie animation */}
      <div className="mb-6">
        <Lottie
          animationData={spinnerBeach}
          loop={true}
          autoplay={true}
          style={{ width: 280, height: 280 }}
        />
      </div>

      {/* Animated message */}
      <div className="h-6 mb-8">
        {error ? (
          <p className="text-sm text-red-400 text-center max-w-xs">{error}</p>
        ) : (
          <p
            key={msgIndex}
            className="text-sm text-lucy-text text-center animate-fadeIn"
          >
            {mensajes[msgIndex]}
          </p>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-64 h-1.5 bg-lucy-border rounded-full overflow-hidden">
        <div
          className="h-full bg-lucy-accent rounded-full transition-all duration-700 ease-out"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      {error && (
        <button
          onClick={() => {
            setError('')
            setProgress(0)
            started.current = false
          }}
          className="mt-6 text-xs text-lucy-accent hover:opacity-80"
        >
          Reintentar
        </button>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
    </div>
  )
}
