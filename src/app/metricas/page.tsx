'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

const ADMIN_EMAIL = 'coachabner@caribeno.fit'

type Range = 'this_month' | '30d' | 'all'

interface FunnelData {
  range: string
  visitas: number
  checkoutIni: number
  checkoutComp: number
  ventasCount: number
  ventasMonto: number
  convVisitaCheckout: number | null
  convCheckoutComp: number | null
  convVisitaVenta: number | null
  utmTable: { source: string; visitas: number; completados: number }[]
  reconciliation: { ok: boolean; checkoutComp: number; ventasCount: number }
}

function pct(v: number | null): string {
  if (v === null) return '\u2014'
  return `${(v * 100).toFixed(1)}%`
}

export default function MetricasPage() {
  const { user, session, loading } = useAuth()
  const router = useRouter()
  const [range, setRange] = useState<Range>('this_month')
  const [data, setData] = useState<FunnelData | null>(null)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!loading && (!user || user.email !== ADMIN_EMAIL)) {
      router.push('/')
    }
  }, [user, loading, router])

  const fetchData = useCallback(async () => {
    if (!session?.access_token) return
    setFetching(true)
    try {
      const res = await fetch(`/api/metricas/funnel?range=${range}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        setData(await res.json())
      }
    } catch (err) {
      console.error('[metricas] fetch failed:', err)
    } finally {
      setFetching(false)
    }
  }, [range, session?.access_token])

  useEffect(() => {
    if (user?.email === ADMIN_EMAIL && session?.access_token) {
      fetchData()
    }
  }, [user, session, fetchData])

  if (loading || !user || user.email !== ADMIN_EMAIL) return null

  const rangeLabel: Record<Range, string> = {
    this_month: 'Este mes',
    '30d': 'Últimos 30 días',
    all: 'Todo',
  }

  return (
    <div className="min-h-screen bg-[#F8F7FF] px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-[#2D2B3D] mb-4">Funnel de Lucy</h1>

      {/* Range selector */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {(['this_month', '30d', 'all'] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              range === r
                ? 'bg-[#7B7FC4] text-white'
                : 'bg-white text-[#5C5A6F] border border-[#E0DFF0]'
            }`}
          >
            {rangeLabel[r]}
          </button>
        ))}
      </div>

      {fetching ? (
        <p className="text-sm text-[#8B89A1]">Cargando...</p>
      ) : !data ? (
        <p className="text-sm text-[#8B89A1]">Error al cargar datos.</p>
      ) : (
        <>
          {/* Funnel cards */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Card label="Visitas" value={data.visitas} />
            <Card label="Checkout ini." value={data.checkoutIni} />
            <Card label="Checkout comp." value={data.checkoutComp} />
            <Card label="Ventas" value={data.ventasCount} sub={`$${data.ventasMonto.toLocaleString()}`} />
          </div>

          {/* Conversions */}
          <div className="bg-white rounded-xl p-4 mb-6 border border-[#E0DFF0]">
            <h2 className="text-sm font-medium text-[#5C5A6F] mb-3">Conversiones</h2>
            <div className="space-y-2 text-sm">
              <ConvRow label="Visita → Checkout" value={pct(data.convVisitaCheckout)} />
              <ConvRow label="Checkout → Completado" value={pct(data.convCheckoutComp)} />
              <ConvRow label="Visita → Venta" value={pct(data.convVisitaVenta)} />
            </div>
          </div>

          {/* UTM table */}
          <div className="bg-white rounded-xl p-4 mb-6 border border-[#E0DFF0]">
            <h2 className="text-sm font-medium text-[#5C5A6F] mb-3">Por fuente (utm_source)</h2>
            {data.utmTable.length === 0 ? (
              <p className="text-sm text-[#8B89A1]">Sin datos</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#8B89A1]">
                    <th className="pb-2 font-medium">Fuente</th>
                    <th className="pb-2 font-medium text-right">Visitas</th>
                    <th className="pb-2 font-medium text-right">Ventas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.utmTable.map((row) => (
                    <tr key={row.source} className="border-t border-[#F0EFF5]">
                      <td className="py-1.5 text-[#2D2B3D]">{row.source}</td>
                      <td className="py-1.5 text-right text-[#2D2B3D]">{row.visitas}</td>
                      <td className="py-1.5 text-right text-[#2D2B3D]">{row.completados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Reconciliation */}
          {!data.reconciliation.ok && (
            <div className="bg-amber-50 rounded-xl p-3 mb-6 border border-amber-200 text-sm text-amber-800">
              ⚠ Reconciliación: checkout_completado={data.reconciliation.checkoutComp} vs suscripciones={data.reconciliation.ventasCount}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Card({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-[#E0DFF0]">
      <p className="text-xs text-[#8B89A1] mb-1">{label}</p>
      <p className="text-2xl font-semibold text-[#2D2B3D]">{value}</p>
      {sub && <p className="text-xs text-[#7B7FC4] mt-0.5">{sub}</p>}
    </div>
  )
}

function ConvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#5C5A6F]">{label}</span>
      <span className="font-medium text-[#2D2B3D]">{value}</span>
    </div>
  )
}
