'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'

const ADMIN_EMAIL = 'coachabner@caribeno.fit'

interface WaitlistItem {
  id: string
  email: string
  created_at: string
}

interface UsuarioItem {
  id: string
  email: string
  nombre: string
  aprobado: boolean
  created_at: string
  onboarding_completado?: boolean
}


export default function AdminPage() {
  const { user, session, loading } = useAuth()
  const router = useRouter()

  const [waitlist, setWaitlist] = useState<WaitlistItem[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([])
  const [aprobados, setAprobados] = useState<Set<string>>(new Set())
  const [coaches, setCoaches] = useState<Set<string>>(new Set())
  const [loadingData, setLoadingData] = useState(true)

  const fetchData = useCallback(async () => {
    // Waitlist, emails_aprobados, and coaches use client-side Supabase
    const [wl, ap, co] = await Promise.all([
      supabase.from('waitlist').select('id, email, created_at').order('created_at', { ascending: false }),
      supabase.from('emails_aprobados').select('email'),
      supabase.from('coaches').select('user_id'),
    ])
    if (wl.data) setWaitlist(wl.data)
    if (ap.data) setAprobados(new Set(ap.data.map(a => a.email)))
    if (co.data) setCoaches(new Set(co.data.map(c => c.user_id)))

    // Usuarios uses service role endpoint to bypass RLS
    if (session?.access_token) {
      const res = await fetch('/api/admin/usuarios', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (data.usuarios) setUsuarios(data.usuarios)
    }

    setLoadingData(false)
  }, [session])

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return }
    if (!loading && user && user.email !== ADMIN_EMAIL) { router.push('/mi-calendario'); return }
    if (!loading && user) fetchData()
  }, [user, loading, router, fetchData])

  const handleAprobar = async (email: string) => {
    // Add to emails_aprobados
    await supabase.from('emails_aprobados').insert({ email: email.toLowerCase() }).select()

    // If user already exists in usuarios, set aprobado=true
    const { data: existingUser } = await supabase
      .from('usuarios')
      .select('nombre')
      .eq('email', email.toLowerCase())
      .single()

    await supabase.from('usuarios').update({ aprobado: true }).eq('email', email.toLowerCase())

    // Send approval email (non-blocking)
    console.log('[admin] Calling send-approval-email for:', email)
    fetch('/api/send-approval-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.toLowerCase(), nombre: existingUser?.nombre }),
    })
      .then(r => r.json())
      .then(data => console.log('[admin] Approval email response:', data))
      .catch(err => console.error('[admin] Approval email failed:', err))

    // Remove from waitlist
    await supabase.from('waitlist').delete().eq('email', email.toLowerCase())

    setAprobados(prev => { const n = new Set(prev); n.add(email.toLowerCase()); return n })
    setUsuarios(prev => prev.map(u => u.email?.toLowerCase() === email.toLowerCase() ? { ...u, aprobado: true } : u))
    setWaitlist(prev => prev.filter(w => w.email.toLowerCase() !== email.toLowerCase()))
  }

  const handleHacerCoach = async (u: UsuarioItem) => {
    if (!session?.access_token) return
    const res = await fetch('/api/admin/hacer-coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ userId: u.id, email: u.email, nombre: u.nombre }),
    })
    const data = await res.json()
    if (data.success) {
      setCoaches(prev => { const n = new Set(prev); n.add(u.id); return n })
    }
  }

  const handleRevocar = async (email: string) => {
    await supabase.from('emails_aprobados').delete().eq('email', email.toLowerCase())
    await supabase.from('usuarios').update({ aprobado: false }).eq('email', email.toLowerCase())

    setAprobados(prev => { const n = new Set(prev); n.delete(email.toLowerCase()); return n })
    setUsuarios(prev => prev.map(u => u.email?.toLowerCase() === email.toLowerCase() ? { ...u, aprobado: false } : u))
  }

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lucy-muted text-sm">Cargando...</p>
      </div>
    )
  }

  if (!user || user.email !== ADMIN_EMAIL) return null

  const totalWaitlist = waitlist.length
  const pendientes = waitlist.filter(w => !aprobados.has(w.email.toLowerCase())).length
  const aprobadosCount = aprobados.size

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-logo text-2xl text-lucy-text">Lucy Admin</h1>
            <p className="text-lucy-soft text-[10px] tracking-[0.25em] uppercase">panel de administración</p>
          </div>
          <button onClick={() => router.push('/mi-calendario')} className="text-xs text-lucy-muted hover:text-lucy-accent">
            ← Volver al calendario
          </button>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-lucy-white rounded-card border border-lucy-border p-6 text-center" style={{ backgroundColor: '#F0EFFA' }}>
            <p className="text-[64px] font-bold text-lucy-text leading-none">{totalWaitlist}</p>
            <p className="text-sm text-lucy-muted mt-2">🔥 Total en waitlist</p>
          </div>
          <div className="bg-lucy-white rounded-card border border-lucy-border p-6 text-center" style={{ backgroundColor: '#FFF8E1' }}>
            <p className="text-[64px] font-bold text-lucy-text leading-none">{pendientes}</p>
            <p className="text-sm text-lucy-muted mt-2">⏳ Pendientes</p>
          </div>
          <div className="bg-lucy-white rounded-card border border-lucy-border p-6 text-center" style={{ backgroundColor: '#E8F5E9' }}>
            <p className="text-[64px] font-bold text-lucy-text leading-none">{aprobadosCount}</p>
            <p className="text-sm text-lucy-muted mt-2">✅ Aprobadas</p>
          </div>
        </div>

        {/* Waitlist */}
        <div className="bg-lucy-white rounded-card border border-lucy-border p-6 mb-8">
          <h2 className="text-base text-lucy-text mb-4">Lista de Espera</h2>
          {waitlist.length === 0 ? (
            <p className="text-sm text-lucy-muted">No hay emails en la lista de espera.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-lucy-border">
                    <th className="text-left py-2 text-xs text-lucy-muted font-medium">Email</th>
                    <th className="text-left py-2 text-xs text-lucy-muted font-medium">Fecha</th>
                    <th className="text-right py-2 text-xs text-lucy-muted font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlist.map(item => {
                    const isAprobado = aprobados.has(item.email.toLowerCase())
                    return (
                      <tr key={item.id} className="border-b border-lucy-border/50">
                        <td className="py-3 text-lucy-text">{item.email}</td>
                        <td className="py-3 text-lucy-muted">{new Date(item.created_at).toLocaleDateString('es-ES')}</td>
                        <td className="py-3 text-right">
                          {isAprobado ? (
                            <span className="text-xs text-lucy-muted">Ya aprobado</span>
                          ) : (
                            <button
                              onClick={() => handleAprobar(item.email)}
                              className="text-xs bg-lucy-accent text-white px-3 py-1 rounded-btn hover:opacity-90"
                            >
                              Aprobar ✓
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Usuarios */}
        <div className="bg-lucy-white rounded-card border border-lucy-border p-6">
          <h2 className="text-base text-lucy-text mb-4">Usuarias Activas</h2>
          {usuarios.length === 0 ? (
            <p className="text-sm text-lucy-muted">No hay usuarias registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-lucy-border">
                    <th className="text-left py-2 text-xs text-lucy-muted font-medium">Email</th>
                    <th className="text-left py-2 text-xs text-lucy-muted font-medium">Nombre</th>
                    <th className="text-left py-2 text-xs text-lucy-muted font-medium">Fecha</th>
                    <th className="text-left py-2 text-xs text-lucy-muted font-medium">Estado</th>
                    <th className="text-right py-2 text-xs text-lucy-muted font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map(u => (
                    <tr key={u.id} className="border-b border-lucy-border/50">
                      <td className="py-3 text-lucy-text">{u.email}</td>
                      <td className="py-3 text-lucy-text">
                        {u.nombre}
                        {coaches.has(u.id) && (
                          <span className="ml-2 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">Coach</span>
                        )}
                      </td>
                      <td className="py-3 text-lucy-muted">{new Date(u.created_at).toLocaleDateString('es-ES')}</td>
                      <td className="py-3">
                        {u.aprobado ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Aprobada</span>
                        ) : (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Pendiente</span>
                        )}
                      </td>
                      <td className="py-3 text-right flex items-center justify-end gap-2">
                        {!coaches.has(u.id) && (
                          <button
                            onClick={() => handleHacerCoach(u)}
                            className="text-xs text-purple-500 hover:text-purple-700"
                          >
                            Hacer coach
                          </button>
                        )}
                        {u.aprobado ? (
                          <button
                            onClick={() => handleRevocar(u.email)}
                            className="text-xs text-red-400 hover:text-red-600"
                          >
                            Revocar
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAprobar(u.email)}
                            className="text-xs bg-lucy-accent text-white px-3 py-1 rounded-btn hover:opacity-90"
                          >
                            Aprobar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
