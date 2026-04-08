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
      // Check if user has a profile in usuarios
      supabase
        .from('usuarios')
        .select('id')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            // Existing user → route normally
            getDestination(user.id).then(dest => router.push(dest))
          } else {
            // New user without profile → waitlist
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
