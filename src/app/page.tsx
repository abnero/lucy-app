'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getDestination } from '@/lib/routeUser'

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (user) {
      getDestination(user.id).then(dest => router.push(dest))
    } else {
      router.push('/login')
    }
  }, [user, loading, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-lucy-muted text-sm">Cargando...</p>
    </div>
  )
}
