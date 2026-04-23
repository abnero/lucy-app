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
  meta: 'nueva' | 'vieja'
  pctCal: number | null
  pctProt: number | null
  comPrinc: number
  subMins: number
  pool: number
  entries: number
  veredicto: string
}

interface SinCalendario {
  email: string
  nombre: string
  diasDesdeSingup: number
  ultimaInteraccion: string | null
}

interface RequiereAtencion {
  nombre: string
  email: string
  veredicto: string
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
  saludOk: number
  saludWarning: number
  saludCritical: number
}

interface MetricasData {
  resumen: Resumen
  usuarios: UserMetric[]
  sinCalendario: SinCalendario[]
  requierenAtencion: RequiereAtencion[]
}

function pctColor(val: number | null, thresholdYellow: number, thresholdRed: number): string {
  if (val === null) return '#9896B0'
  const abs = Math.abs(val)
  if (abs > thresholdRed) return '#DC2626'
  if (abs > thresholdYellow) return '#D97706'
  return '#2D2B45'
}

function pctBg(val: number | null, thresholdYellow: number, thresholdRed: number): string {
  if (val === null) return 'transparent'
  const abs = Math.abs(val)
  if (abs > thresholdRed) return '#FEF2F2'
  if (abs > thresholdYellow) return '#FFFBEB'
  return 'transparent'
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

  const { resumen, usuarios, sinCalendario, requierenAtencion } = data
  const reales = usuarios.filter(u => !u.isInternal)

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const formatDateShort = (d: string) => {
    return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  }

  const formatPct = (val: number | null) => {
    if (val === null) return '—'
    return (val >= 0 ? '+' : '') + val + '%'
  }

  const td = { padding: '8px 6px', fontSize: '12px' } as const
  const thStyle = { textAlign: 'left' as const, padding: '8px 6px', color: '#6B6889', fontWeight: 500, fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.03em', whiteSpace: 'nowrap' as const }

  return (
    <div style={{ backgroundColor: '#F8F7FC', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 20px' }}>

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

        {/* Resumen ejecutivo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '32px' }}>
          {[
            { label: 'Beta testers', value: resumen.totalBeta, sub: 'reales' },
            { label: 'Onboarding', value: `${resumen.completaronOnboarding}`, sub: `${resumen.completaronOnboardingPct}%` },
            { label: 'Con calendario', value: `${resumen.generaronCalendario}`, sub: `${resumen.generaronCalendarioPct}%` },
            { label: 'DAU (24h)', value: resumen.dau, sub: 'activas' },
            { label: 'WAU (7d)', value: resumen.wau, sub: 'activas' },
            { label: 'Retención 7d', value: `${resumen.retencion7d}%`, sub: 'volvieron' },
            { label: 'Retención 14d', value: `${resumen.retencion14d}%`, sub: 'volvieron' },
            { label: 'Salud ✅', value: resumen.saludOk, sub: `de ${resumen.totalBeta}` },
            { label: 'Salud 🟡', value: resumen.saludWarning, sub: 'atención' },
            { label: 'Salud 🔴', value: resumen.saludCritical, sub: 'crítico' },
          ].map((m, i) => (
            <div key={i} style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E8E6F4',
              padding: '16px 12px',
              textAlign: 'center',
            }}>
              <p style={{ fontSize: '28px', fontWeight: 700, color: '#2D2B45', lineHeight: 1 }}>{m.value}</p>
              <p style={{ fontSize: '10px', color: '#6B6889', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</p>
              <p style={{ fontSize: '10px', color: '#9896B0', marginTop: '2px' }}>{m.sub}</p>
            </div>
          ))}
        </div>

        {/* Requieren atención */}
        {requierenAtencion.length > 0 && (
          <div style={{ backgroundColor: '#FEF2F2', borderRadius: '16px', border: '1px solid #FECACA', padding: '20px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#991B1B', marginBottom: '12px' }}>
              Requieren atención ({requierenAtencion.length})
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {requierenAtencion.map((u, i) => (
                <div key={i} style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', border: '1px solid #FECACA' }}>
                  <span style={{ fontWeight: 600, color: '#2D2B45' }}>{u.nombre}</span>
                  <span style={{ color: '#6B6889', marginLeft: '6px' }}>{u.veredicto}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sin calendario */}
        {sinCalendario.length > 0 && (
          <div style={{ backgroundColor: '#FFF8F0', borderRadius: '16px', border: '1px solid #F5D0A9', padding: '20px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#2D2B45', marginBottom: '12px' }}>
              Sin calendario ({sinCalendario.length})
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #F5D0A9' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6B6889', fontWeight: 500 }}>Email</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6B6889', fontWeight: 500 }}>Nombre</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', color: '#6B6889', fontWeight: 500 }}>Días</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6B6889', fontWeight: 500 }}>Última</th>
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

        {/* Tabla completa */}
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E8E6F4', padding: '20px', overflowX: 'auto' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#2D2B45', marginBottom: '16px' }}>
            Usuarias reales ({reales.length})
          </h2>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', minWidth: '1300px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E8E6F4' }}>
                {['Nombre', 'Signup', 'Meta', '% Cal', '% Prot', 'Comidas', 'Sub-min', 'Pool', 'Veredicto', 'Última', 'Msgs', '7d'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reales.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #E8E6F4' }}>
                  <td style={{ ...td, color: '#2D2B45', fontWeight: 500, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={u.email}>{u.nombre}</td>
                  <td style={{ ...td, color: '#6B6889' }}>{formatDateShort(u.createdAt)}</td>
                  <td style={td}>
                    <span style={{
                      padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 500,
                      backgroundColor: u.meta === 'nueva' ? '#E8E6F4' : '#FFFBEB',
                      color: u.meta === 'nueva' ? '#6B6889' : '#D97706',
                    }}>{u.meta}</span>
                  </td>
                  <td style={{ ...td, textAlign: 'center', color: pctColor(u.pctCal, 10, 20), backgroundColor: pctBg(u.pctCal, 10, 20), fontWeight: 600 }}>
                    {formatPct(u.pctCal)}
                  </td>
                  <td style={{ ...td, textAlign: 'center', color: pctColor(u.pctProt, 15, 25), backgroundColor: pctBg(u.pctProt, 15, 25), fontWeight: 600 }}>
                    {formatPct(u.pctProt)}
                  </td>
                  <td style={{ ...td, textAlign: 'center', color: u.comPrinc < 21 ? '#DC2626' : '#2D2B45', fontWeight: u.comPrinc < 21 ? 600 : 400 }}>
                    {u.comPrinc}/21
                  </td>
                  <td style={{ ...td, textAlign: 'center', color: u.subMins >= 5 ? '#DC2626' : u.subMins >= 1 ? '#D97706' : '#2D2B45', fontWeight: u.subMins > 0 ? 600 : 400 }}>
                    {u.subMins}
                  </td>
                  <td style={{ ...td, textAlign: 'center', color: u.pool < 18 ? '#D97706' : '#2D2B45' }}>
                    {u.pool}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {u.veredicto}
                  </td>
                  <td style={{ ...td, color: '#6B6889', whiteSpace: 'nowrap' }}>{formatDate(u.ultimaInteraccion)}</td>
                  <td style={{ ...td, textAlign: 'center', color: '#2D2B45' }}>{u.totalMensajes}</td>
                  <td style={{ ...td, textAlign: 'center', color: '#2D2B45' }}>{u.diasActivos7d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
