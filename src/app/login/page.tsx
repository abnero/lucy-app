'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { getDestination } from '@/lib/routeUser'

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)

  const { signInWithEmail, signUpWithEmail } = useAuth()
  const router = useRouter()

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
        setError(error.message)
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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="font-logo text-4xl text-lucy-text">Lucy</h1>
          <p className="text-lucy-soft text-[11px] tracking-[0.25em] uppercase mt-1">calendario metabólico</p>
        </div>

        <div className="bg-lucy-white rounded-card border border-lucy-border p-8">
          {/* Email Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-xs text-lucy-muted mb-1.5">Nombre</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full border border-lucy-border rounded-btn py-2.5 px-4 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors"
                />
              </div>
            )}
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
              <p className="text-red-500 text-xs bg-red-50 rounded-btn p-3">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-lucy-accent text-white font-medium rounded-btn py-2.5 px-4 text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Cargando...' : isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
            </button>
          </form>

          {/* Forgot password */}
          {!isRegister && (
            <p className="text-center mt-3">
              <button
                onClick={() => router.push('/recuperar-contrasena')}
                className="text-xs text-lucy-muted hover:text-lucy-accent transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </p>
          )}

          {/* Toggle */}
          <p className="text-center text-xs text-lucy-muted mt-5">
            {isRegister ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
            <button
              onClick={() => { setIsRegister(!isRegister); setError('') }}
              className="text-lucy-accent font-medium hover:opacity-80"
            >
              {isRegister ? 'Inicia sesión' : 'Regístrate'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
