'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'

const ADMIN_USER_ID = '57c22f0f-5d15-4b8e-ba80-070383f8c11e'

type Range = '7d' | '30d' | '90d'
type Tab = 'overview' | 'adquisicion' | 'engagement' | 'salud' | 'reengagement'

interface MetricasV2 {
  range: string
  adquisicion: {
    signupsPorDia: { dia: string; cnt: number }[]
    funnel: { total: number; onboarded: number; chatted: number }
  }
  engagement: {
    dauSeries: { dia: string; count: number }[]
    wau: number
    mau: number
    topActions: { tipo: string; count: number }[]
  }
  saludCalendario: {
    user_id: string
    nombre: string
    meta_cal: number
    meta_prot: number
    dias: number
    dias_ok: number
  }[]
  reEngagement: {
    id: string
    nombre: string
    email: string
    last_activity: string
    days_since: number
    status: string
  }[]
}

const COLORS = ['#7B7FC4', '#B8B5E0', '#F4845F', '#F7B267', '#56B4D3', '#82ca9d', '#ffc658']
const STATUS_COLORS: Record<string, string> = {
  activa: '#22C55E',
  lurker: '#F59E0B',
  churned: '#EF4444',
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E8E6F4',
      padding: '16px 14px', textAlign: 'center', minWidth: 0,
    }}>
      <p style={{ fontSize: '28px', fontWeight: 700, color: '#2D2B45', lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: '10px', color: '#6B6889', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      {sub && <p style={{ fontSize: '10px', color: '#9896B0', marginTop: '2px' }}>{sub}</p>}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E8E6F4',
      padding: '20px', marginBottom: '16px',
    }}>
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#2D2B45', marginBottom: '16px' }}>{title}</h3>
      {children}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ padding: '32px', textAlign: 'center' }}>
      <p style={{ fontSize: '13px', color: '#9896B0' }}>{message}</p>
    </div>
  )
}

export default function MetricasBetaPage() {
  const { user, session, loading } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<MetricasV2 | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState('')
  const [range, setRange] = useState<Range>('7d')
  const [incluirInternos, setIncluirInternos] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')

  const fetchData = useCallback(async () => {
    if (!session?.access_token) return
    setLoadingData(true)
    setError('')
    try {
      const params = new URLSearchParams({ range, incluir_internos: String(incluirInternos) })
      const res = await fetch(`/api/admin/metricas-v2?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const d = await res.json()
      if (d.error) { setError(d.error); setData(null) }
      else setData(d)
    } catch {
      setError('Error cargando métricas')
      setData(null)
    }
    setLoadingData(false)
  }, [session?.access_token, range, incluirInternos])

  useEffect(() => {
    if (loading) return
    if (!user || user.id !== ADMIN_USER_ID) { router.push('/mi-calendario'); return }
    fetchData()
  }, [user, loading, router, fetchData])

  if (loading || (loadingData && !data)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F7FC' }}>
        <p style={{ color: '#6B6889', fontSize: '14px' }}>Cargando métricas...</p>
      </div>
    )
  }

  if (!user || user.id !== ADMIN_USER_ID) return null
  if (error && !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F7FC' }}>
        <p style={{ color: '#e53e3e', fontSize: '14px' }}>{error}</p>
      </div>
    )
  }

  const funnel = data?.adquisicion.funnel || { total: 0, onboarded: 0, chatted: 0 }
  const engagement = data?.engagement || { dauSeries: [], wau: 0, mau: 0, topActions: [] }
  const calHealth = data?.saludCalendario || []
  const reEng = data?.reEngagement || []

  // Derived stats
  const totalBilateralOk = calHealth.filter(u => u.dias > 0 && u.dias_ok === u.dias).length
  const totalWithCal = calHealth.filter(u => u.dias > 0).length
  const activas = reEng.filter(u => u.status === 'activa').length
  const lurkers = reEng.filter(u => u.status === 'lurker').length
  const churned = reEng.filter(u => u.status === 'churned').length

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'adquisicion', label: 'Adquisicion' },
    { key: 'engagement', label: 'Engagement' },
    { key: 'salud', label: 'Salud Calendario' },
    { key: 'reengagement', label: 'Re-engagement' },
  ]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatDay = (d: any) => {
    const date = new Date(String(d) + 'T00:00:00')
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  }

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ backgroundColor: '#F8F7FC', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '24px', color: '#2D2B45', margin: 0 }}>Metricas v2</h1>
            <p style={{ fontSize: '11px', color: '#6B6889', marginTop: '4px' }}>Telemetria + salud calendario</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Range selector */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['7d', '30d', '90d'] as Range[]).map(r => (
                <button key={r} onClick={() => setRange(r)} style={{
                  padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, border: 'none', cursor: 'pointer',
                  backgroundColor: range === r ? '#7B7FC4' : '#FFFFFF',
                  color: range === r ? '#FFFFFF' : '#6B6889',
                }}>
                  {r}
                </button>
              ))}
            </div>
            {/* Include internos */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6B6889', cursor: 'pointer' }}>
              <input type="checkbox" checked={incluirInternos} onChange={e => setIncluirInternos(e.target.checked)}
                style={{ accentColor: '#7B7FC4' }} />
              Internos
            </label>
            {/* Refresh */}
            <button onClick={fetchData} disabled={loadingData} style={{
              padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, border: '1px solid #E8E6F4',
              backgroundColor: '#FFFFFF', color: '#6B6889', cursor: loadingData ? 'wait' : 'pointer',
            }}>
              {loadingData ? '...' : 'Refresh'}
            </button>
            {/* Back */}
            <button onClick={() => router.push('/admin')} style={{ fontSize: '12px', color: '#7B7FC4', background: 'none', border: 'none', cursor: 'pointer' }}>
              Admin
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', overflowX: 'auto' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, border: 'none', cursor: 'pointer',
              whiteSpace: 'nowrap',
              backgroundColor: tab === t.key ? '#2D2B45' : '#FFFFFF',
              color: tab === t.key ? '#FFFFFF' : '#6B6889',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ==================== OVERVIEW ==================== */}
        {tab === 'overview' && (
          <>
            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              <StatCard label="Usuarios" value={funnel.total} />
              <StatCard label="Onboarded" value={funnel.onboarded} sub={funnel.total > 0 ? `${Math.round(funnel.onboarded / funnel.total * 100)}%` : '—'} />
              <StatCard label="Chatearon" value={funnel.chatted} sub={funnel.onboarded > 0 ? `${Math.round(funnel.chatted / funnel.onboarded * 100)}%` : '—'} />
              <StatCard label="WAU" value={engagement.wau} />
              <StatCard label="MAU" value={engagement.mau} />
              <StatCard label="100% bilateral" value={totalBilateralOk} sub={totalWithCal > 0 ? `de ${totalWithCal}` : '—'} />
            </div>

            {/* Signups chart */}
            <ChartCard title={`Signups (${range})`}>
              {data?.adquisicion.signupsPorDia.length ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.adquisicion.signupsPorDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
                    <XAxis dataKey="dia" tickFormatter={formatDay} tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip labelFormatter={formatDay} />
                    <Bar dataKey="cnt" fill="#7B7FC4" radius={[4, 4, 0, 0]} name="Signups" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No hay signups en este rango" />
              )}
            </ChartCard>

            {/* DAU chart */}
            <ChartCard title={`DAU (${range})`}>
              {engagement.dauSeries.length ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={engagement.dauSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
                    <XAxis dataKey="dia" tickFormatter={formatDay} tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip labelFormatter={formatDay} />
                    <Line type="monotone" dataKey="count" stroke="#7B7FC4" strokeWidth={2} dot={{ r: 3, fill: '#7B7FC4' }} name="Usuarios activos" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No hay eventos en este rango" />
              )}
            </ChartCard>

            {/* Re-engagement summary */}
            <ChartCard title="Estado usuarias">
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {[
                  { label: 'Activas (<=7d)', count: activas, color: STATUS_COLORS.activa },
                  { label: 'Lurkers (8-13d)', count: lurkers, color: STATUS_COLORS.lurker },
                  { label: 'Churned (14d+)', count: churned, color: STATUS_COLORS.churned },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: s.color }} />
                    <span style={{ fontSize: '13px', color: '#2D2B45' }}>{s.count} {s.label}</span>
                  </div>
                ))}
              </div>
            </ChartCard>

            {/* Salud compacta */}
            <ChartCard title="Salud bilateral (top 10 peor)">
              {calHealth.length ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #E8E6F4' }}>
                        {['Nombre', 'Meta kcal', 'Meta prot', 'Dias', 'Dias OK', '%'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 6px', color: '#6B6889', fontWeight: 500, fontSize: '10px', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {calHealth.slice(0, 10).map(u => {
                        const pct = u.dias > 0 ? Math.round(u.dias_ok / u.dias * 100) : 0
                        return (
                          <tr key={u.user_id} style={{ borderBottom: '1px solid #E8E6F4' }}>
                            <td style={{ padding: '8px 6px', color: '#2D2B45', fontWeight: 500 }}>{u.nombre}</td>
                            <td style={{ padding: '8px 6px', color: '#6B6889' }}>{u.meta_cal}</td>
                            <td style={{ padding: '8px 6px', color: '#6B6889' }}>{Math.round(u.meta_prot)}g</td>
                            <td style={{ padding: '8px 6px', color: '#2D2B45', textAlign: 'center' }}>{u.dias}</td>
                            <td style={{ padding: '8px 6px', color: pct < 50 ? '#EF4444' : pct < 80 ? '#F59E0B' : '#22C55E', textAlign: 'center', fontWeight: 600 }}>{u.dias_ok}</td>
                            <td style={{ padding: '8px 6px', color: pct < 50 ? '#EF4444' : pct < 80 ? '#F59E0B' : '#22C55E', fontWeight: 600 }}>{pct}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState message="No hay datos de calendario" />
              )}
            </ChartCard>
          </>
        )}

        {/* ==================== ADQUISICION ==================== */}
        {tab === 'adquisicion' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              <StatCard label="Total registrados" value={funnel.total} />
              <StatCard label="Onboarded" value={funnel.onboarded} sub={funnel.total > 0 ? `${Math.round(funnel.onboarded / funnel.total * 100)}%` : '—'} />
              <StatCard label="Chatearon" value={funnel.chatted} sub={funnel.onboarded > 0 ? `${Math.round(funnel.chatted / funnel.onboarded * 100)}% de onboarded` : '—'} />
            </div>

            {/* Funnel visual */}
            <ChartCard title="Funnel de conversión">
              {funnel.total > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={[
                    { step: 'Registradas', count: funnel.total },
                    { step: 'Onboarded', count: funnel.onboarded },
                    { step: 'Chatearon', count: funnel.chatted },
                  ]} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="step" type="category" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#7B7FC4" radius={[0, 4, 4, 0]} name="Usuarios" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="Sin datos de funnel" />
              )}
            </ChartCard>

            {/* Signups por dia */}
            <ChartCard title={`Signups diarios (${range})`}>
              {data?.adquisicion.signupsPorDia.length ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.adquisicion.signupsPorDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
                    <XAxis dataKey="dia" tickFormatter={formatDay} tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip labelFormatter={formatDay} />
                    <Bar dataKey="cnt" fill="#7B7FC4" radius={[4, 4, 0, 0]} name="Signups" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No hay signups en este rango" />
              )}
            </ChartCard>
          </>
        )}

        {/* ==================== ENGAGEMENT ==================== */}
        {tab === 'engagement' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              <StatCard label="WAU (7d)" value={engagement.wau} />
              <StatCard label="MAU (30d)" value={engagement.mau} />
              <StatCard label="Stickiness" value={engagement.mau > 0 ? `${Math.round(engagement.wau / engagement.mau * 100)}%` : '—'} sub="WAU/MAU" />
            </div>

            {/* DAU series */}
            <ChartCard title={`Usuarios activos por dia (${range})`}>
              {engagement.dauSeries.length ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={engagement.dauSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
                    <XAxis dataKey="dia" tickFormatter={formatDay} tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip labelFormatter={formatDay} />
                    <Line type="monotone" dataKey="count" stroke="#7B7FC4" strokeWidth={2} dot={{ r: 3, fill: '#7B7FC4' }} name="DAU" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No hay datos de actividad en este rango" />
              )}
            </ChartCard>

            {/* Top actions pie */}
            <ChartCard title="Acciones mas frecuentes (7d)">
              {engagement.topActions.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Pie data={engagement.topActions} dataKey="count" nameKey="tipo" cx="50%" cy="50%" outerRadius={90} label={({ payload }: any) => `${(payload?.tipo || '').replace('page_view_', '').replace('action_', '')} (${payload?.count || 0})`}>
                      {engagement.topActions.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Legend formatter={(v: any) => String(v).replace('page_view_', '').replace('action_', '')} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No hay eventos de accion en este rango" />
              )}
            </ChartCard>
          </>
        )}

        {/* ==================== SALUD CALENDARIO ==================== */}
        {tab === 'salud' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              <StatCard label="Con calendario" value={totalWithCal} />
              <StatCard label="100% bilateral" value={totalBilateralOk} sub={totalWithCal > 0 ? `${Math.round(totalBilateralOk / totalWithCal * 100)}%` : '—'} />
              <StatCard label="<50% bilateral" value={calHealth.filter(u => u.dias > 0 && (u.dias_ok / u.dias) < 0.5).length} sub="necesitan atencion" />
            </div>

            {/* Bilateral bar chart per user */}
            <ChartCard title="% dias bilaterales OK por usuaria">
              {calHealth.length ? (
                <ResponsiveContainer width="100%" height={Math.max(200, calHealth.length * 28)}>
                  <BarChart data={calHealth.filter(u => u.dias > 0).map(u => ({
                    nombre: u.nombre?.split(' ')[0] || u.user_id.slice(0, 8),
                    pct: Math.round(u.dias_ok / u.dias * 100),
                    dias_ok: u.dias_ok,
                    dias: u.dias,
                  }))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F4" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis dataKey="nombre" type="category" tick={{ fontSize: 10 }} width={80} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Tooltip formatter={(v: any, _: any, entry: any) => [`${v}% (${entry?.payload?.dias_ok ?? '?'}/${entry?.payload?.dias ?? '?'} dias)`, 'Bilateral OK']} />
                    <Bar dataKey="pct" radius={[0, 4, 4, 0]} name="% OK">
                      {calHealth.filter(u => u.dias > 0).map((u, i) => {
                        const pct = u.dias > 0 ? u.dias_ok / u.dias : 0
                        return <Cell key={i} fill={pct < 0.5 ? '#EF4444' : pct < 0.8 ? '#F59E0B' : '#22C55E'} />
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No hay datos de calendario" />
              )}
            </ChartCard>

            {/* Full table */}
            <ChartCard title="Detalle por usuaria">
              {calHealth.length ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #E8E6F4' }}>
                        {['Nombre', 'Meta kcal', 'Meta prot', 'Dias totales', 'Dias OK', '% bilateral'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 6px', color: '#6B6889', fontWeight: 500, fontSize: '10px', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {calHealth.map(u => {
                        const pct = u.dias > 0 ? Math.round(u.dias_ok / u.dias * 100) : 0
                        return (
                          <tr key={u.user_id} style={{ borderBottom: '1px solid #E8E6F4' }}>
                            <td style={{ padding: '8px 6px', color: '#2D2B45', fontWeight: 500 }}>{u.nombre}</td>
                            <td style={{ padding: '8px 6px', color: '#6B6889' }}>{u.meta_cal}</td>
                            <td style={{ padding: '8px 6px', color: '#6B6889' }}>{Math.round(u.meta_prot)}g</td>
                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>{u.dias}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'center', color: pct < 50 ? '#EF4444' : pct < 80 ? '#F59E0B' : '#22C55E', fontWeight: 600 }}>{u.dias_ok}</td>
                            <td style={{ padding: '8px 6px', color: pct < 50 ? '#EF4444' : pct < 80 ? '#F59E0B' : '#22C55E', fontWeight: 600 }}>{pct}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState message="No hay datos de calendario" />
              )}
            </ChartCard>
          </>
        )}

        {/* ==================== RE-ENGAGEMENT ==================== */}
        {tab === 'reengagement' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              <StatCard label="Activas" value={activas} sub="<= 7 dias" />
              <StatCard label="Lurkers" value={lurkers} sub="8-13 dias" />
              <StatCard label="Churned" value={churned} sub="14+ dias" />
            </div>

            {/* Status pie */}
            <ChartCard title="Distribucion de estados">
              {reEng.length ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={[
                      { name: 'Activas', value: activas },
                      { name: 'Lurkers', value: lurkers },
                      { name: 'Churned', value: churned },
                    ].filter(d => d.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      <Cell fill={STATUS_COLORS.activa} />
                      <Cell fill={STATUS_COLORS.lurker} />
                      <Cell fill={STATUS_COLORS.churned} />
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState message="No hay datos de re-engagement" />
              )}
            </ChartCard>

            {/* User table */}
            <ChartCard title="Detalle por usuaria">
              {reEng.length ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #E8E6F4' }}>
                        {['Nombre', 'Email', 'Ultima actividad', 'Dias sin actividad', 'Estado'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 6px', color: '#6B6889', fontWeight: 500, fontSize: '10px', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reEng.map(u => (
                        <tr key={u.id} style={{ borderBottom: '1px solid #E8E6F4' }}>
                          <td style={{ padding: '8px 6px', color: '#2D2B45', fontWeight: 500 }}>{u.nombre}</td>
                          <td style={{ padding: '8px 6px', color: '#6B6889', fontSize: '11px' }}>{u.email}</td>
                          <td style={{ padding: '8px 6px', color: '#6B6889', whiteSpace: 'nowrap' }}>{formatDate(u.last_activity)}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 600, color: u.days_since > 13 ? '#EF4444' : u.days_since > 7 ? '#F59E0B' : '#2D2B45' }}>{u.days_since}d</td>
                          <td style={{ padding: '8px 6px' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 600,
                              backgroundColor: u.status === 'activa' ? '#DCFCE7' : u.status === 'lurker' ? '#FEF3C7' : '#FEE2E2',
                              color: STATUS_COLORS[u.status] || '#6B6889',
                            }}>
                              {u.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState message="No hay datos de re-engagement" />
              )}
            </ChartCard>
          </>
        )}
      </div>
    </div>
  )
}
