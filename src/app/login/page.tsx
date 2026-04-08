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
          {/* Google Sign In */}
          <button
            onClick={async () => {
              setError('')
              try {
                const { error } = await signInWithGoogle()
                if (error) {
                  console.error('Google Sign-In error:', error)
                  setError(error.message)
                }
              } catch (err) {
                console.error('Google Sign-In exception:', err)
                setError('Error conectando con Google. Intenta de nuevo.')
              }
            }}
            className="w-full flex items-center justify-center gap-2.5 border border-lucy-border rounded-btn py-2.5 px-4 text-sm text-lucy-text hover:border-lucy-soft transition-colors mb-5"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuar con Google
          </button>

          {/* Divider */}
          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-lucy-border"></div>
            </div>
            <div className="relative flex justify-center text-[10px]">
              <span className="bg-lucy-white px-3 text-lucy-muted">o</span>
            </div>
          </div>

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
