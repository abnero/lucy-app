'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getDestination } from '@/lib/routeUser'

export default function AuthHandlePage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (user) {
      getDestination(user.id).then(dest => router.push(dest))
    } else {
      // Wait a moment for Supabase to process the hash
      const timer = setTimeout(() => {
        router.push('/login')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [user, loading, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-lucy-muted text-sm">Autenticando...</p>
    </div>
  )
}
