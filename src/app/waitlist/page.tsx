'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function WaitlistPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'exists' | 'error'>('idle')
  const [count, setCount] = useState(200)

  useEffect(() => {
    supabase
      .from('waitlist')
      .select('id', { count: 'exact', head: true })
      .then(({ count: c }) => {
        if (c !== null) setCount(200 + c)
      })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('loading')

    const { error } = await supabase.from('waitlist').insert({ email: email.trim().toLowerCase() })

    if (error) {
      if (error.code === '23505') {
        setStatus('exists')
      } else {
        setStatus('error')
      }
    } else {
      setStatus('success')
      setCount(prev => prev + 1)
    }
  }

  return (
    <div className="min-h-screen px-4 py-10 flex flex-col items-center">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="font-logo text-4xl text-lucy-text">Lucy</h1>
          <p className="text-lucy-soft text-[11px] tracking-[0.25em] uppercase mt-1">calendario metabólico</p>
        </div>

        {/* Headline */}
        <div className="text-center mb-8">
          <h2 className="text-xl font-medium text-lucy-text leading-snug mb-3">
            ¿No sabes qué comer ni en qué cantidades para bajar de peso?
          </h2>
          <p className="text-sm text-lucy-muted">
            Lucy lo resuelve. Tu nutricionista personal con IA.
          </p>
        </div>

        {/* Benefits */}
        <div className="bg-lucy-white rounded-card border border-lucy-border p-6 mb-6">
          <div className="space-y-4">
            <div className="flex gap-3 items-start">
              <span className="text-lg shrink-0">🧠</span>
              <p className="text-sm text-lucy-text">Tu plan de comidas personalizado en 3 minutos</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="text-lg shrink-0">🥗</span>
              <p className="text-sm text-lucy-text">Con los alimentos que tú escoges — no dietas genéricas</p>
            </div>
            <div className="flex gap-3 items-start">
              <span className="text-lg shrink-0" role="img" aria-label="chat">💬</span>
              <p className="text-sm text-lucy-text">Cámbialo cuando quieras hablándole por chat</p>
            </div>
          </div>
        </div>

        {/* App mockup */}
        <div className="bg-lucy-white rounded-card border border-lucy-border p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-lucy-accent flex items-center justify-center">
              <span className="font-logo text-white text-xs">L</span>
            </div>
            <div>
              <p className="text-xs font-medium text-lucy-text">Lucy</p>
              <p className="text-[10px] text-lucy-muted">Tu nutricionista personal</p>
            </div>
          </div>
          <div className="rounded-xl p-3 text-xs text-lucy-text leading-relaxed" style={{ backgroundColor: '#F0EFFA' }}>
            ¡Hola! Ya calculé tus macros y armé tu calendario de 7 días. Tienes pollo, arroz y brócoli para el almuerzo de hoy. ¿Quieres cambiar algo? 😊
          </div>
        </div>

        {/* Counter */}
        <p className="text-center text-sm text-lucy-text mb-4">
          🔥 <span className="font-medium">{count.toLocaleString()}</span> personas esperando acceso
        </p>

        {/* Form */}
        <div className="bg-lucy-white rounded-card border border-lucy-border p-6 mb-4">
          {status === 'success' ? (
            <div className="text-center py-2">
              <p className="text-sm text-lucy-text mb-1">¡Listo! Te avisamos cuando tu acceso esté listo 🎉</p>
              <p className="text-xs text-lucy-muted">Revisa tu email pronto.</p>
            </div>
          ) : status === 'exists' ? (
            <div className="text-center py-2">
              <p className="text-sm text-lucy-text">¡Ya estás en la lista! Te avisamos pronto 😊</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="w-full border border-lucy-border rounded-btn py-2.5 px-4 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors"
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full bg-lucy-accent text-white font-medium rounded-btn py-2.5 px-4 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {status === 'loading' ? 'Guardando...' : 'Quiero acceso gratis'}
              </button>
              {status === 'error' && (
                <p className="text-red-500 text-xs text-center">Hubo un error. Intenta de nuevo.</p>
              )}
            </form>
          )}
        </div>

        {/* Urgency */}
        <p className="text-center text-xs text-lucy-muted mb-6">
          Estamos aceptando acceso por orden de lista
        </p>

        {/* Disclaimer */}
        <p className="text-center text-[10px] text-lucy-muted">
          Sin spam. Solo te escribimos cuando tu acceso esté listo.
        </p>
      </div>
    </div>
  )
}
