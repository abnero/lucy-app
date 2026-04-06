'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

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
  }, [])

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

      {/* Illustration — relaxed girl on beach */}
      <div className="mb-10 animate-float">
        <svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Sun */}
          <circle cx="145" cy="35" r="18" fill="#F0EFFA" className="animate-pulse" />
          <circle cx="145" cy="35" r="10" fill="#B8B5E0" />

          {/* Beach/ground */}
          <ellipse cx="90" cy="155" rx="75" ry="12" fill="#F0EFFA" />

          {/* Beach chair - back */}
          <line x1="55" y1="95" x2="75" y2="145" stroke="#B8B5E0" strokeWidth="3" strokeLinecap="round" />
          <line x1="115" y1="95" x2="95" y2="145" stroke="#B8B5E0" strokeWidth="3" strokeLinecap="round" />
          <line x1="55" y1="95" x2="115" y2="95" stroke="#B8B5E0" strokeWidth="3" strokeLinecap="round" />

          {/* Chair fabric */}
          <path d="M58 97 L62 115 L108 115 L112 97" fill="#E8E6F4" />

          {/* Body - torso */}
          <ellipse cx="85" cy="108" rx="16" ry="12" fill="#7B7FC4" />

          {/* Head */}
          <circle cx="85" cy="82" r="14" fill="#F0EFFA" />

          {/* Hair */}
          <path d="M71 78 Q72 65, 85 64 Q98 65, 99 78" fill="#2D2B45" />
          <path d="M99 78 Q102 82, 104 90" stroke="#2D2B45" strokeWidth="3" strokeLinecap="round" fill="none" />

          {/* Sunglasses */}
          <ellipse cx="80" cy="82" rx="5" ry="4" fill="#2D2B45" />
          <ellipse cx="92" cy="82" rx="5" ry="4" fill="#2D2B45" />
          <line x1="85" y1="82" x2="87" y2="82" stroke="#2D2B45" strokeWidth="1.5" />

          {/* Smile */}
          <path d="M81 88 Q85 92, 90 88" stroke="#9896B0" strokeWidth="1.5" strokeLinecap="round" fill="none" />

          {/* Arm left - resting */}
          <path d="M70 105 Q55 110, 50 118" stroke="#F0EFFA" strokeWidth="5" strokeLinecap="round" fill="none" />

          {/* Arm right - holding drink */}
          <path d="M100 105 Q115 100, 120 90" stroke="#F0EFFA" strokeWidth="5" strokeLinecap="round" fill="none" />

          {/* Drink */}
          <rect x="116" y="72" width="12" height="18" rx="3" fill="#B8B5E0" />
          <rect x="118" y="75" width="8" height="5" rx="2" fill="#7B7FC4" />
          {/* Straw */}
          <line x1="122" y1="72" x2="126" y2="62" stroke="#7B7FC4" strokeWidth="1.5" strokeLinecap="round" />
          {/* Umbrella in drink */}
          <path d="M126 62 Q122 58, 118 62" fill="#E8E6F4" stroke="#B8B5E0" strokeWidth="1" />

          {/* Legs */}
          <path d="M78 118 Q72 135, 70 148" stroke="#F0EFFA" strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M92 118 Q96 135, 98 148" stroke="#F0EFFA" strokeWidth="5" strokeLinecap="round" fill="none" />

          {/* Sparkles */}
          <circle cx="30" cy="50" r="2" fill="#B8B5E0" className="animate-ping" style={{ animationDuration: '2s' }} />
          <circle cx="155" cy="80" r="2" fill="#B8B5E0" className="animate-ping" style={{ animationDuration: '3s' }} />
          <circle cx="40" cy="120" r="1.5" fill="#E8E6F4" className="animate-ping" style={{ animationDuration: '2.5s' }} />
        </svg>
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
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
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
