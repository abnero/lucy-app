'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

const ADMIN_USER_ID = '57c22f0f-5d15-4b8e-ba80-070383f8c11e'

interface UserMetric {
  id: string
  email: string
  nombre: string
  isInternal: boolean
  createdAt: string
  onboardingCompleto: boolean
  tieneCalendario: boolean
  ultimaInteraccion: string | null
  totalMensajes: number
  diasActivos7d: number
  diasActivos14d: number
  diasActivos30d: number
  modificacionesCalendario: number
}

interface SinCalendario {
  email: string
  nombre: string
  diasDesdeSingup: number
  ultimaInteraccion: string | null
}

interface Resumen {
  totalBeta: number
  completaronOnboarding: number
  completaronOnboardingPct: number
  generaronCalendario: number
  generaronCalendarioPct: number
  dau: number
  wau: number
  retencion7d: number
  retencion14d: number
}

interface MetricasData {
  resumen: Resumen
  usuarios: UserMetric[]
  sinCalendario: SinCalendario[]
}

export default function MetricasBetaPage() {
  const { user, session, loading } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<MetricasData | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading) return
    if (!user || user.id !== ADMIN_USER_ID) {
      router.push('/mi-calendario')
      return
    }
    if (!session?.access_token) return

    fetch('/api/admin/metricas', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoadingData(false); return }
        setData(d)
        setLoadingData(false)
      })
      .catch(() => { setError('Error cargando métricas'); setLoadingData(false) })
  }, [user, session, loading, router])

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F7FC' }}>
        <p style={{ color: '#6B6889', fontSize: '14px' }}>Cargando métricas...</p>
      </div>
    )
  }

  if (!user || user.id !== ADMIN_USER_ID) return null
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F7FC' }}>
        <p style={{ color: '#e53e3e', fontSize: '14px' }}>{error}</p>
      </div>
    )
  }
  if (!data) return null

  const { resumen, usuarios, sinCalendario } = data

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const formatDateShort = (d: string) => {
    return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  }

  return (
    <div style={{ backgroundColor: '#F8F7FC', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '28px', color: '#2D2B45', margin: 0 }}>Métricas Beta</h1>
            <p style={{ fontSize: '12px', color: '#6B6889', marginTop: '4px' }}>Solo visible para admin</p>
          </div>
          <button onClick={() => router.push('/admin')} style={{ fontSize: '12px', color: '#7B7FC4', background: 'none', border: 'none', cursor: 'pointer' }}>
            ← Admin panel
          </button>
        </div>

        {/* SECCIÓN 1 — Resumen ejecutivo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '32px' }}>
          {[
            { label: 'Beta testers', value: resumen.totalBeta, sub: 'reales' },
            { label: 'Onboarding', value: `${resumen.completaronOnboarding}`, sub: `${resumen.completaronOnboardingPct}%` },
            { label: 'Con calendario', value: `${resumen.generaronCalendario}`, sub: `${resumen.generaronCalendarioPct}%` },
            { label: 'DAU (24h)', value: resumen.dau, sub: 'activas' },
            { label: 'WAU (7d)', value: resumen.wau, sub: 'activas' },
            { label: 'Retención 7d', value: `${resumen.retencion7d}%`, sub: 'volvieron' },
            { label: 'Retención 14d', value: `${resumen.retencion14d}%`, sub: 'volvieron' },
          ].map((m, i) => (
            <div key={i} style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E8E6F4',
              padding: '20px 16px',
              textAlign: 'center',
            }}>
              <p style={{ fontSize: '32px', fontWeight: 700, color: '#2D2B45', lineHeight: 1 }}>{m.value}</p>
              <p style={{ fontSize: '11px', color: '#6B6889', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</p>
              <p style={{ fontSize: '11px', color: '#9896B0', marginTop: '2px' }}>{m.sub}</p>
            </div>
          ))}
        </div>

        {/* SECCIÓN 3 — Sin calendario (urgente) */}
        {sinCalendario.length > 0 && (
          <div style={{ backgroundColor: '#FFF8F0', borderRadius: '16px', border: '1px solid #F5D0A9', padding: '20px', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#2D2B45', marginBottom: '12px' }}>
              ⚠️ No han generado calendario ({sinCalendario.length})
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #F5D0A9' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6B6889', fontWeight: 500 }}>Email</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6B6889', fontWeight: 500 }}>Nombre</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', color: '#6B6889', fontWeight: 500 }}>Días desde signup</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6B6889', fontWeight: 500 }}>Última interacción</th>
                  </tr>
                </thead>
                <tbody>
                  {sinCalendario.map((u, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F5D0A9' }}>
                      <td style={{ padding: '8px 12px', color: '#2D2B45' }}>{u.email}</td>
                      <td style={{ padding: '8px 12px', color: '#2D2B45' }}>{u.nombre}</td>
                      <td style={{ padding: '8px 12px', color: '#2D2B45', textAlign: 'center' }}>{u.diasDesdeSingup}d</td>
                      <td style={{ padding: '8px 12px', color: '#6B6889' }}>{formatDate(u.ultimaInteraccion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECCIÓN 2 — Tabla completa */}
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E8E6F4', padding: '20px', overflowX: 'auto' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#2D2B45', marginBottom: '16px' }}>
            Todas las cuentas ({usuarios.length})
          </h2>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', minWidth: '1000px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E8E6F4' }}>
                {['Email', 'Nombre', 'Tipo', 'Signup', 'Onb', 'Cal', 'Última interacción', 'Msgs', '7d', '14d', '30d', 'Mods'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 6px', color: '#6B6889', fontWeight: 500, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} style={{
                  borderBottom: '1px solid #E8E6F4',
                  backgroundColor: u.isInternal ? '#F0F0F0' : 'transparent',
                }}>
                  <td style={{ padding: '8px 6px', color: '#2D2B45', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</td>
                  <td style={{ padding: '8px 6px', color: '#2D2B45' }}>{u.nombre}</td>
                  <td style={{ padding: '8px 6px' }}>
                    {u.isInternal
                      ? <span style={{ backgroundColor: '#E8E6F4', color: '#6B6889', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Interno</span>
                      : <span style={{ backgroundColor: '#E8F5E9', color: '#2E7D32', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>Beta</span>
                    }
                  </td>
                  <td style={{ padding: '8px 6px', color: '#6B6889' }}>{formatDateShort(u.createdAt)}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{u.onboardingCompleto ? '✅' : '❌'}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{u.tieneCalendario ? '✅' : '❌'}</td>
                  <td style={{ padding: '8px 6px', color: '#6B6889' }}>{formatDate(u.ultimaInteraccion)}</td>
                  <td style={{ padding: '8px 6px', color: '#2D2B45', textAlign: 'center' }}>{u.totalMensajes}</td>
                  <td style={{ padding: '8px 6px', color: '#2D2B45', textAlign: 'center' }}>{u.diasActivos7d}</td>
                  <td style={{ padding: '8px 6px', color: '#2D2B45', textAlign: 'center' }}>{u.diasActivos14d}</td>
                  <td style={{ padding: '8px 6px', color: '#2D2B45', textAlign: 'center' }}>{u.diasActivos30d}</td>
                  <td style={{ padding: '8px 6px', color: '#2D2B45', textAlign: 'center' }}>{u.modificacionesCalendario}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
