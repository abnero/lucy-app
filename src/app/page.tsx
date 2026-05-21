'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getDestination } from '@/lib/routeUser'
import LandingPage from '@/components/LandingPage'

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [showLanding, setShowLanding] = useState(false)

  useEffect(() => {
    if (loading) return
    if (user) {
      getDestination(user.id).then(dest => router.push(dest))
    } else {
      setShowLanding(true)
    }
  }, [user, loading, router])

  // Logged-in user: show spinner while redirecting
  if (loading || (user && !showLanding)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lucy-muted text-sm">Cargando...</p>
      </div>
    )
  }

  // Not logged in: render landing
  return <LandingPage />
}
