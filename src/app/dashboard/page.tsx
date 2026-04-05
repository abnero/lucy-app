'use client'

import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
      return
    }
    if (!loading && user) {
      supabase
        .from('usuarios')
        .select('onboarding_completado')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (!data?.onboarding_completado) {
            router.push('/onboarding')
          } else {
            setChecking(false)
          }
        })
    }
  }, [user, loading, router])

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lucy-muted text-sm">Cargando...</p>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-logo text-2xl text-lucy-text">Lucy</h1>
            <p className="text-lucy-soft text-[10px] tracking-[0.25em] uppercase">calendario metabólico</p>
          </div>
          <button
            onClick={async () => { await signOut(); router.push('/login') }}
            className="text-xs text-lucy-muted hover:text-lucy-text transition-colors"
          >
            Cerrar sesión
          </button>
        </div>

        <div className="bg-lucy-white rounded-card border border-lucy-border p-8">
          <p className="text-lucy-text text-sm mb-1">
            Bienvenida, <span className="font-medium">{user.user_metadata?.nombre || user.email}</span>
          </p>
          <p className="text-lucy-muted text-xs">
            Dashboard en construcción
          </p>
        </div>
      </div>
    </div>
  )
}
