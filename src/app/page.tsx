'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getDestination } from '@/lib/routeUser'
import LandingPage from '@/components/LandingPage'

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [showLanding, setShowLanding] = useState(false)
  const tracked = useRef(false)

  useEffect(() => {
    if (loading) return
    if (user) {
      getDestination(user.id).then(dest => router.push(dest))
    } else {
      setShowLanding(true)
    }
  }, [user, loading, router])

  // Track anonymous landing visit (fire-and-forget, once per mount)
  useEffect(() => {
    if (!showLanding || tracked.current) return
    tracked.current = true
    const params = new URLSearchParams(window.location.search)
    fetch('/api/track/visita', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        utm_source: params.get('utm_source') || null,
        utm_medium: params.get('utm_medium') || null,
        utm_campaign: params.get('utm_campaign') || null,
        referer: document.referrer || null,
        path: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => {})
  }, [showLanding])

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
