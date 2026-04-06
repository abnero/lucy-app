'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

export default function RecuperarContrasenaPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError('Ingresa tu email'); return }

    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nueva-contrasena`,
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="font-logo text-4xl text-lucy-text">Lucy</h1>
          <p className="text-lucy-soft text-[11px] tracking-[0.25em] uppercase mt-1">calendario metabólico</p>
        </div>

        <div className="bg-lucy-white rounded-card border border-lucy-border p-8">
          {sent ? (
            <div className="text-center">
              <h2 className="text-base text-lucy-text mb-2">Revisa tu email</h2>
              <p className="text-xs text-lucy-muted leading-relaxed mb-6">
                Te enviamos un enlace a <strong className="text-lucy-text">{email}</strong> para restablecer tu contraseña.
              </p>
              <button
                onClick={() => router.push('/login')}
                className="text-xs text-lucy-accent hover:opacity-80 font-medium"
              >
                Volver al inicio de sesión
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-base text-lucy-text mb-1">Recupera tu contraseña</h2>
                <p className="text-xs text-lucy-muted">Te enviaremos un enlace a tu email</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-lucy-muted mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    className="w-full border border-lucy-border rounded-btn py-2.5 px-4 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors"
                  />
                </div>

                {error && (
                  <p className="text-red-500 text-xs bg-red-50 rounded-btn p-3">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-lucy-accent text-white font-medium rounded-btn py-2.5 px-4 text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Enviando...' : 'Enviar enlace'}
                </button>
              </form>

              <p className="text-center mt-5">
                <button
                  onClick={() => router.push('/login')}
                  className="text-xs text-lucy-muted hover:text-lucy-accent transition-colors"
                >
                  ← Volver al inicio de sesión
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
