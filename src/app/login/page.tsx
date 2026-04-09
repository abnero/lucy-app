'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { getDestination } from '@/lib/routeUser'

export default function LoginPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      getDestination(user.id).then(dest => router.push(dest))
    }
  }, [user, authLoading, router])

  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)

  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (isRegister) {
      if (!nombre.trim()) {
        setError('Por favor ingresa tu nombre')
        setLoading(false)
        return
      }
      const { error, session } = await signUpWithEmail(email, password, nombre)
      if (error) {
        setError(error.message)
      } else if (session) {
        router.push('/onboarding')
      } else {
        setConfirmationSent(true)
      }
    } else {
      const { error } = await signInWithEmail(email, password)
      if (error) {
        if (error.message.includes('Invalid login credentials') || error.message.includes('Email not confirmed')) {
          setError('NO_ACCOUNT')
        } else {
          setError(error.message)
        }
      } else {
        const { data: { user: loggedUser } } = await supabase.auth.getUser()
        if (loggedUser) {
          const dest = await getDestination(loggedUser.id)
          router.push(dest)
        }
      }
    }

    setLoading(false)
  }

  if (confirmationSent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-lucy-white rounded-card border border-lucy-border p-8 w-full max-w-md text-center">
          <h2 className="text-xl text-lucy-text mb-2">Revisa tu email</h2>
          <p className="text-lucy-muted text-sm">
            Te enviamos un enlace de confirmación a <strong className="text-lucy-text">{email}</strong>.
            Haz clic en el enlace para activar tu cuenta.
          </p>
          <button
            onClick={() => { setConfirmationSent(false); setIsRegister(false) }}
            className="mt-6 text-lucy-accent hover:opacity-80 text-sm font-medium"
          >
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-logo text-4xl text-lucy-text">Lucy</h1>
          <p className="text-lucy-soft text-[11px] tracking-[0.25em] uppercase mt-1">calendario metabólico</p>
        </div>

        <div className="bg-lucy-white rounded-card border border-lucy-border p-8">
          {/* Google Sign In — hidden temporarily */}
          {/* TODO: re-enable when access control bug is fixed */}

          {/* Email Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-lucy-muted mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="w-full border border-lucy-border rounded-btn py-2.5 px-4 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-lucy-muted mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
                className="w-full border border-lucy-border rounded-btn py-2.5 px-4 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors"
              />
            </div>

            {error && (
              error === 'NO_ACCOUNT' ? (
                <div className="text-xs bg-red-50 rounded-btn p-3">
                  <p className="text-red-500 mb-1">No encontramos una cuenta con ese email.</p>
                  <button onClick={() => router.push('/waitlist')} className="text-lucy-accent font-medium hover:opacity-80">
                    ¿Quieres unirte a la lista de espera?
                  </button>
                </div>
              ) : (
                <p className="text-red-500 text-xs bg-red-50 rounded-btn p-3">{error}</p>
              )
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-lucy-accent text-white font-medium rounded-btn py-2.5 px-4 text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Cargando...' : 'Iniciar sesión'}
            </button>
          </form>

          {/* Forgot password */}
          <p className="text-center mt-3">
            <button
              onClick={() => router.push('/recuperar-contrasena')}
              className="text-xs text-lucy-muted hover:text-lucy-accent transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </p>

          {/* Waitlist CTA */}
          <div className="mt-6 pt-5 border-t border-lucy-border">
            <p className="text-center text-xs text-lucy-muted mb-3">¿No tienes cuenta?</p>
            <button
              onClick={() => router.push('/waitlist')}
              className="w-full border border-lucy-accent text-lucy-accent font-medium rounded-btn py-2.5 px-4 text-sm hover:bg-lucy-accent/5 transition-colors"
            >
              Únete a la lista de espera →
            </button>
          </div>
        </div>

        {/* Powered by */}
        <div className="mt-10 pb-safe animate-poweredIn flex items-center justify-center gap-1.5">
          <span className="text-[11px] text-lucy-muted">Powered by</span>
          <img
            src="/caribeno transparente.PNG"
            alt="Caribeño Fit Labs"
            className="h-6"
          />
          <span className="text-[11px] text-lucy-muted">Caribeño Fit Labs</span>
        </div>

        <p className="text-[10px] text-lucy-muted text-center mt-3 leading-relaxed animate-poweredIn mx-auto max-w-[280px]">
          Al usar Lucy aceptas que esta app es solo orientación general. Consulta a un profesional de la salud si tienes condiciones médicas.
        </p>

      </div>
    </div>
  )
}
