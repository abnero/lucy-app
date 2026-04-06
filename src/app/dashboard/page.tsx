'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getDestination } from '@/lib/routeUser'

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
      return
    }
    if (!loading && user) {
      getDestination(user.id).then(dest => router.push(dest))
    }
  }, [user, loading, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-lucy-muted text-sm">Redirigiendo...</p>
    </div>
  )
}
