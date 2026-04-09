'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'

export default function RegistroPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { signUpWithEmail } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)

    // Check if email is approved
    const { data: approved } = await supabase
      .from('emails_aprobados')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .single()

    if (!approved) {
      setError('NO_APROBADO')
      setLoading(false)
      return
    }

    // Create account
    const { error: authError, session } = await signUpWithEmail(email, password, '')
    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Auto-approve in usuarios table
    if (session?.user) {
      await supabase.from('usuarios').update({ aprobado: true }).eq('id', session.user.id)
    }

    setLoading(false)
    router.push('/onboarding')
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
          <div className="mb-6">
            <h2 className="text-base text-lucy-text mb-1">Crear tu cuenta</h2>
            <p className="text-xs text-lucy-muted">Ingresa el email con el que te registraste en la lista de espera</p>
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
            <div>
              <label className="block text-xs text-lucy-muted mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
                className="w-full border border-lucy-border rounded-btn py-2.5 px-4 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-lucy-muted mb-1.5">Confirmar contraseña</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repite tu contraseña"
                required
                minLength={6}
                className="w-full border border-lucy-border rounded-btn py-2.5 px-4 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors"
              />
            </div>

            {error && (
              error === 'NO_APROBADO' ? (
                <div className="text-xs bg-red-50 rounded-btn p-3">
                  <p className="text-red-500 mb-1">Tu email no está en la lista de acceso.</p>
                  <button type="button" onClick={() => router.push('/waitlist')} className="text-lucy-accent font-medium hover:opacity-80">
                    Únete a la lista de espera →
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
              {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>

          <p className="text-center text-xs text-lucy-muted mt-5">
            ¿Ya tienes cuenta?{' '}
            <button onClick={() => router.push('/login')} className="text-lucy-accent font-medium hover:opacity-80">
              Inicia sesión →
            </button>
          </p>
        </div>

        {/* Disclaimer */}
        <p className="text-[10px] text-lucy-muted text-center mt-6 leading-relaxed mx-auto max-w-[280px]">
          Al usar Lucy aceptas que esta app es solo orientación general. Consulta a un profesional de la salud si tienes condiciones médicas.
        </p>
      </div>
    </div>
  )
}
