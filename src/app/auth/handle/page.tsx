'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { getDestination } from '@/lib/routeUser'

export default function AuthHandlePage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (user) {
      supabase
        .from('usuarios')
        .select('aprobado')
        .eq('id', user.id)
        .single()
        .then(({ data, error }) => {
          console.log('[auth/handle] Query result:', { email: user.email, aprobado: data?.aprobado, error: error?.message })
          console.log('[auth/handle] Decision:', data?.aprobado ? 'PERMITIR' : 'BLOQUEAR → waitlist')

          if (data?.aprobado === true) {
            getDestination(user.id).then(dest => {
              console.log('[auth/handle] Routing to:', dest)
              router.push(dest)
            })
          } else {
            console.log('[auth/handle] Signing out and redirecting to waitlist')
            supabase.auth.signOut().then(() => {
              router.push('/waitlist?from=google')
            })
          }
        })
    } else {
      const timer = setTimeout(() => router.push('/login'), 3000)
      return () => clearTimeout(timer)
    }
  }, [user, loading, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-lucy-muted text-sm">Autenticando...</p>
    </div>
  )
}
