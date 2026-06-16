'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import FoodAvatar from '@/components/FoodAvatar'
import { toImperial } from '@/lib/units'

interface Clienta {
  id: string
  email: string
  nombre: string
  calorias_objetivo: number | null
  proteina_objetivo: number | null
  carbs_objetivo: number | null
  grasas_objetivo: number | null
  meta: string | null
}

interface AlimentoData {
  nombre: string
  foto_url: string | null
  categoria_comida: string
  calorias_por_unidad: number
  proteina_por_unidad: number
  carbs_por_unidad: number
  grasas_por_unidad: number
  porcion_base: number
  unidad_medida: string
  unidad_display: string | null
  factor_conversion: number | null
}

interface CalItem {
  id: string
  dia: number
  comida: string
  cantidad: number
  unidad: string
  origen: string
  alimento: AlimentoData
}

interface HistorialItem {
  id: string
  created_at: string
  coach?: { email: string } | null
  tipo?: string
  calorias_antes: number
  calorias_despues: number
  proteina_antes: number
  proteina_despues: number
  carbs_antes: number
  carbs_despues: number
  grasas_antes: number
  grasas_despues: number
  alimento_nombre?: string | null
  cantidad_antes?: number | null
  cantidad_despues?: number | null
  nota: string | null
}

interface MacroTotals {
  cal: number
  prot: number
  carbs: number
  grasas: number
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const COMIDAS = [
  { key: 'desayuno', label: 'Desayuno' },
  { key: 'almuerzo', label: 'Almuerzo' },
  { key: 'cena', label: 'Cena' },
  { key: 'snack', label: 'Snack' },
]

function calcItemMacros(cantidad: number, a: AlimentoData): MacroTotals {
  const ratio = a.unidad_medida === 'unidad' ? cantidad : cantidad / (a.porcion_base || 100)
  return {
    cal: Math.round(a.calorias_por_unidad * ratio),
    prot: Math.round(a.proteina_por_unidad * ratio),
    carbs: Math.round(a.carbs_por_unidad * ratio),
    grasas: Math.round(a.grasas_por_unidad * ratio),
  }
}

function sumMacros(items: CalItem[]): MacroTotals {
  const totals = { cal: 0, prot: 0, carbs: 0, grasas: 0 }
  for (const item of items) {
    if (!item.alimento) continue
    const m = calcItemMacros(item.cantidad, item.alimento)
    totals.cal += m.cal
    totals.prot += m.prot
    totals.carbs += m.carbs
    totals.grasas += m.grasas
  }
  return totals
}

function EditableQuantityInput({
  item,
  mode,
  onSave,
}: {
  item: CalItem
  mode: 'coach' | 'clienta'
  onSave: (itemId: string, newCantidad: number) => Promise<void>
}) {
  const isUnit = item.alimento?.unidad_medida === 'unidad'
  const max = isUnit ? 50 : 2000
  const step = isUnit ? 1 : 10
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(item.cantidad.toString())
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync when item.cantidad changes from outside (e.g. after server response)
  useEffect(() => {
    if (!editing) setValue(item.cantidad.toString())
  }, [item.cantidad, editing])

  if (mode === 'clienta') {
    return (
      <p className="text-xs text-lucy-muted">
        {item.alimento ? toImperial(item.cantidad, item.alimento) : `${item.cantidad} ${item.unidad}`}
      </p>
    )
  }

  const commitEdit = async () => {
    const parsed = parseFloat(value)
    // Revert if empty, 0, negative, NaN, or unchanged
    if (!parsed || parsed <= 0 || isNaN(parsed) || parsed === item.cantidad) {
      setValue(item.cantidad.toString())
      setEditing(false)
      return
    }
    const clamped = Math.min(parsed, max)
    setSaving(true)
    await onSave(item.id, clamped)
    setSaving(false)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 0) }}
        className="text-xs text-lucy-muted hover:text-lucy-accent transition-colors text-left"
        disabled={saving}
      >
        {item.alimento ? toImperial(item.cantidad, item.alimento) : `${item.cantidad} ${item.unidad}`}
        {saving && <span className="ml-1 text-lucy-accent">...</span>}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="number"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setValue(item.cantidad.toString()); setEditing(false) } }}
        min={step}
        max={max}
        step={step}
        className="w-16 border border-lucy-accent rounded px-1.5 py-0.5 text-xs text-lucy-text focus:outline-none focus:ring-1 focus:ring-lucy-accent"
        autoFocus
      />
      <span className="text-[10px] text-lucy-muted">{isUnit ? 'uds' : 'g'}</span>
    </div>
  )
}

function MacroBar({ label, totals }: { label: string; totals: MacroTotals }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-lucy-soft">
      <span className="text-lucy-muted">{label}:</span>
      <span>{totals.cal} cal</span>
      <span className="text-lucy-border">|</span>
      <span>{totals.prot}p</span>
      <span className="text-lucy-border">|</span>
      <span>{totals.carbs}c</span>
      <span className="text-lucy-border">|</span>
      <span>{totals.grasas}g</span>
    </div>
  )
}

export default function CoachPage() {
  const { user, session, loading } = useAuth()
  const router = useRouter()

  const [isCoach, setIsCoach] = useState<boolean | null>(null)
  const [clientas, setClientas] = useState<Clienta[]>([])
  const [selected, setSelected] = useState<Clienta | null>(null)
  const [calItems, setCalItems] = useState<CalItem[]>([])
  const [historial, setHistorial] = useState<HistorialItem[]>([])
  const [diaActivo, setDiaActivo] = useState(1)
  const [vista, setVista] = useState<'dia' | 'semana'>('dia')
  const [loadingCal, setLoadingCal] = useState(false)

  // Adjustment form
  const [calorias, setCalorias] = useState('')
  const [protPct, setProtPct] = useState(30)
  const [carbsPct, setCarbsPct] = useState(40)
  const [grasasPct, setGrasasPct] = useState(30)
  const [nota, setNota] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [adjustMsg, setAdjustMsg] = useState('')

  // Verify coach status
  useEffect(() => {
    if (loading) return
    if (!user) { router.push('/login'); return }
    if (!session?.access_token) return

    fetch('/api/coach/clientas', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setIsCoach(false)
          return
        }
        setIsCoach(true)
        setClientas(data.clientas || [])
      })
      .catch(() => setIsCoach(false))
  }, [user, session, loading, router])

  const selectClienta = useCallback((clienta: Clienta) => {
    setSelected(clienta)
    setDiaActivo(1)
    setAdjustMsg('')
    setNota('')
    setCalorias(clienta.calorias_objetivo?.toString() || '')

    const cal = clienta.calorias_objetivo || 1800
    if (clienta.proteina_objetivo && clienta.carbs_objetivo && clienta.grasas_objetivo) {
      const pPct = Math.round((clienta.proteina_objetivo * 4 / cal) * 100)
      const cPct = Math.round((clienta.carbs_objetivo * 4 / cal) * 100)
      const gPct = 100 - pPct - cPct
      setProtPct(pPct)
      setCarbsPct(cPct)
      setGrasasPct(gPct)
    }
  }, [])

  // Fetch calendar + historial for selected clienta
  useEffect(() => {
    if (!selected || !session?.access_token) return
    setLoadingCal(true)

    fetch(`/api/coach/clientas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ clientaId: selected.id }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.calendario) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setCalItems(data.calendario.map((r: any) => ({
            ...r,
            alimento: Array.isArray(r.alimento) ? r.alimento[0] : r.alimento,
          })))
        }
        if (data.historial) setHistorial(data.historial)
        setLoadingCal(false)
      })
      .catch(() => setLoadingCal(false))
  }, [selected, session])

  const handleSaveQuantity = useCallback(async (itemId: string, newCantidad: number) => {
    if (!selected || !session?.access_token) return

    const res = await fetch('/api/coach/ajustar-cantidad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        clientaUserId: selected.id,
        calendarioRowId: itemId,
        cantidadNueva: newCantidad,
      }),
    })

    const data = await res.json()
    if (!data.success) return

    // Update local state: quantity + origen for the edited item
    setCalItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, cantidad: newCantidad, origen: 'coach' } : item
    ))
  }, [selected, session])

  const handleSlider = (which: 'prot' | 'carbs' | 'grasas', value: number) => {
    if (which === 'prot') {
      const remaining = 100 - value
      const ratio = carbsPct + grasasPct > 0 ? remaining / (carbsPct + grasasPct) : 0.5
      const newCarbs = Math.round(carbsPct * ratio)
      setProtPct(value)
      setCarbsPct(newCarbs)
      setGrasasPct(100 - value - newCarbs)
    } else if (which === 'carbs') {
      const remaining = 100 - value
      const ratio = protPct + grasasPct > 0 ? remaining / (protPct + grasasPct) : 0.5
      const newProt = Math.round(protPct * ratio)
      setCarbsPct(value)
      setProtPct(newProt)
      setGrasasPct(100 - value - newProt)
    } else {
      const remaining = 100 - value
      const ratio = protPct + carbsPct > 0 ? remaining / (protPct + carbsPct) : 0.5
      const newProt = Math.round(protPct * ratio)
      setGrasasPct(value)
      setProtPct(newProt)
      setCarbsPct(100 - value - newProt)
    }
  }

  const handleAjustar = async () => {
    if (!selected || !session?.access_token || !calorias) return
    setAdjusting(true)
    setAdjustMsg('')

    const res = await fetch('/api/coach/ajustar-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        clientaUserId: selected.id,
        caloriasNuevas: parseInt(calorias),
        proteinaPct: protPct,
        carbsPct: carbsPct,
        grasasPct: grasasPct,
        nota: nota || undefined,
      }),
    })

    const data = await res.json()
    setAdjusting(false)

    if (data.success) {
      setAdjustMsg('Plan actualizado exitosamente')
      setNota('')
      // Refresh calendar + historial
      setSelected({ ...selected, calorias_objetivo: parseInt(calorias) })
      setClientas(prev => prev.map(c => c.id === selected.id ? { ...c, calorias_objetivo: parseInt(calorias) } : c))
      // Re-fetch calendario + historial
      if (session?.access_token) {
        fetch('/api/coach/clientas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ clientaId: selected.id }),
        })
          .then(r => r.json())
          .then(d => {
            if (d.historial) setHistorial(d.historial)
            if (d.calendario) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              setCalItems(d.calendario.map((r: any) => ({
                ...r,
                alimento: Array.isArray(r.alimento) ? r.alimento[0] : r.alimento,
              })))
            }
          })
          .catch(() => {})
      }
    } else {
      setAdjustMsg('Error: ' + (data.error || 'Intenta de nuevo'))
    }
  }

  if (loading || isCoach === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F7FC' }}>
        <p className="text-lucy-muted text-sm">Cargando...</p>
      </div>
    )
  }

  if (!isCoach) {
    router.push('/mi-calendario')
    return null
  }

  const itemsDelDia = calItems.filter(i => i.dia === diaActivo)
  const macrosDia = sumMacros(itemsDelDia)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8F7FC' }}>
      {/* Header */}
      <div className="px-4 py-4 bg-white border-b border-lucy-border">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-logo text-xl text-lucy-text">Lucy</h1>
            <p className="text-lucy-soft text-[9px] tracking-[0.25em] uppercase">Dashboard de Coach</p>
          </div>
          <button onClick={() => router.push('/mi-calendario')} className="text-xs text-lucy-muted hover:text-lucy-accent">
            ← Mi calendario
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Clientas list */}
          <div className="lg:w-1/3">
            <div className="bg-white rounded-2xl border border-lucy-border p-4">
              <h2 className="text-sm font-medium text-lucy-text mb-3">Clientas ({clientas.length})</h2>
              <div className="space-y-1 max-h-[70vh] overflow-y-auto">
                {clientas.map(c => (
                  <button
                    key={c.id}
                    onClick={() => selectClienta(c)}
                    className={`w-full text-left px-3 py-3 rounded-xl transition-colors ${
                      selected?.id === c.id ? 'bg-lucy-accent/10 border border-lucy-accent' : 'hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <p className="text-sm text-lucy-text font-medium truncate">{c.nombre}</p>
                    <p className="text-[11px] text-lucy-muted truncate">{c.email}</p>
                    {c.calorias_objetivo && (
                      <p className="text-[11px] text-lucy-soft mt-0.5">{c.calorias_objetivo} kcal/día</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Clienta detail */}
          <div className="lg:w-2/3">
            {!selected ? (
              <div className="bg-white rounded-2xl border border-lucy-border p-12 text-center">
                <p className="text-lucy-muted text-sm">Selecciona una clienta para ver su calendario</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Clienta header */}
                <div className="bg-white rounded-2xl border border-lucy-border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-medium text-lucy-text">{selected.nombre}</h2>
                      <p className="text-xs text-lucy-muted">{selected.email}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setVista('dia')}
                        className={`p-1.5 rounded ${vista === 'dia' ? 'bg-lucy-accent/10' : ''}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <rect x="2" y="2" width="10" height="10" rx="1.5" stroke={vista === 'dia' ? '#7B7FC4' : '#9896B0'} strokeWidth="1.5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setVista('semana')}
                        className={`p-1.5 rounded ${vista === 'semana' ? 'bg-lucy-accent/10' : ''}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <rect x="2" y="2" width="4" height="4" rx="0.5" stroke={vista === 'semana' ? '#7B7FC4' : '#9896B0'} strokeWidth="1.3" />
                          <rect x="8" y="2" width="4" height="4" rx="0.5" stroke={vista === 'semana' ? '#7B7FC4' : '#9896B0'} strokeWidth="1.3" />
                          <rect x="2" y="8" width="4" height="4" rx="0.5" stroke={vista === 'semana' ? '#7B7FC4' : '#9896B0'} strokeWidth="1.3" />
                          <rect x="8" y="8" width="4" height="4" rx="0.5" stroke={vista === 'semana' ? '#7B7FC4' : '#9896B0'} strokeWidth="1.3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Calendar */}
                <div className="bg-white rounded-2xl border border-lucy-border p-4">
                  {loadingCal ? (
                    <p className="text-lucy-muted text-sm text-center py-8">Cargando calendario...</p>
                  ) : calItems.length === 0 ? (
                    <p className="text-lucy-muted text-sm text-center py-8">Esta clienta no tiene calendario generado</p>
                  ) : vista === 'dia' ? (
                    <>
                      {/* Day tabs */}
                      <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-hide">
                        {DIAS.map((d, i) => (
                          <button
                            key={i}
                            onClick={() => setDiaActivo(i + 1)}
                            className={`shrink-0 px-3 py-1.5 rounded-btn text-xs transition-colors ${
                              diaActivo === i + 1 ? 'bg-lucy-accent text-white' : 'bg-gray-50 text-lucy-muted hover:bg-gray-100'
                            }`}
                          >
                            {d.slice(0, 3)}
                          </button>
                        ))}
                      </div>
                      {/* Meals */}
                      <div className="space-y-4">
                        {COMIDAS.map(({ key, label }) => {
                          const items = itemsDelDia.filter(i => i.comida === key)
                          if (items.length === 0) return null
                          const macrosComida = sumMacros(items)
                          return (
                            <div key={key}>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[11px] text-lucy-muted uppercase tracking-wider">{label}</p>
                                <MacroBar label="" totals={macrosComida} />
                              </div>
                              <div className="space-y-2">
                                {items.map(item => (
                                  <div key={item.id} className={`flex items-center gap-2 ${item.origen === 'coach' ? 'pl-1 border-l-2 border-lucy-accent' : ''}`}>
                                    <FoodAvatar nombre={item.alimento?.nombre || '?'} foto_url={item.alimento?.foto_url} size="sm" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-lucy-text">{item.alimento?.nombre}</p>
                                      <EditableQuantityInput item={item} mode="coach" onSave={handleSaveQuantity} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {/* Day totals */}
                      <div className="mt-4 pt-3 border-t border-lucy-border">
                        <MacroBar label="Total del día" totals={macrosDia} />
                      </div>
                    </>
                  ) : (
                    /* Weekly view — read-only, tap navigates to day */
                    <div className="overflow-x-auto scrollbar-hide">
                      <div style={{ minWidth: 'max-content' }}>
                        <div className="flex border-b border-lucy-border">
                          <div style={{ width: '70px' }} className="shrink-0" />
                          {DIAS.map((d, i) => (
                            <div key={i} style={{ width: '120px' }} className="shrink-0 px-2 py-2 text-center">
                              <p className="text-[11px] text-lucy-muted uppercase">{d.slice(0, 3)}</p>
                            </div>
                          ))}
                        </div>
                        {COMIDAS.slice(0, 3).map(({ key, label }) => (
                          <div key={key} className="flex border-b border-lucy-border/50">
                            <div style={{ width: '70px' }} className="shrink-0 px-2 py-2 text-[10px] text-lucy-muted uppercase">{label}</div>
                            {DIAS.map((_, i) => {
                              const items = calItems.filter(it => it.dia === i + 1 && it.comida === key)
                              return (
                                <button
                                  key={i}
                                  onClick={() => { setDiaActivo(i + 1); setVista('dia') }}
                                  style={{ width: '120px' }}
                                  className="shrink-0 px-2 py-2 border-l border-lucy-border/30 space-y-1 text-left hover:bg-gray-50 transition-colors"
                                >
                                  {items.map((item, idx) => (
                                    <div key={idx}>
                                      <p className="text-[10px] text-lucy-text leading-tight">{item.alimento?.nombre}</p>
                                      <p className="text-[9px] text-lucy-muted">{item.alimento ? toImperial(item.cantidad, item.alimento) : ''}</p>
                                    </div>
                                  ))}
                                </button>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Adjustment panel */}
                <div className="bg-white rounded-2xl border border-lucy-border p-4">
                  <h3 className="text-sm font-medium text-lucy-text mb-4">Ajustar plan de {selected.nombre}</h3>

                  <div className="space-y-4">
                    {/* Calories */}
                    <div>
                      <label className="block text-xs text-lucy-muted mb-1">Calorías objetivo</label>
                      <input
                        type="number"
                        value={calorias}
                        onChange={e => setCalorias(e.target.value)}
                        className="w-full border border-lucy-border rounded-btn py-2 px-3 text-sm text-lucy-text focus:outline-none focus:border-lucy-accent"
                      />
                    </div>

                    {/* Macro sliders */}
                    {[
                      { label: 'Proteína', value: protPct, key: 'prot' as const, color: '#7B7FC4' },
                      { label: 'Carbohidratos', value: carbsPct, key: 'carbs' as const, color: '#9896B0' },
                      { label: 'Grasas', value: grasasPct, key: 'grasas' as const, color: '#B8B5E0' },
                    ].map(s => (
                      <div key={s.key}>
                        <div className="flex justify-between mb-1">
                          <label className="text-xs text-lucy-muted">{s.label}</label>
                          <span className="text-xs font-medium text-lucy-text">{s.value}%</span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={60}
                          value={s.value}
                          onChange={e => handleSlider(s.key, parseInt(e.target.value))}
                          className="w-full accent-lucy-accent"
                          style={{ accentColor: s.color }}
                        />
                      </div>
                    ))}

                    <p className="text-[11px] text-lucy-muted text-right">
                      Total: {protPct + carbsPct + grasasPct}%
                      {protPct + carbsPct + grasasPct !== 100 && <span className="text-red-400 ml-1">(debe ser 100%)</span>}
                    </p>

                    {/* Nota */}
                    <div>
                      <label className="block text-xs text-lucy-muted mb-1">Nota para la clienta (opcional)</label>
                      <textarea
                        value={nota}
                        onChange={e => setNota(e.target.value)}
                        placeholder="Ej: Bajé las calorías porque tu progreso va bien..."
                        rows={2}
                        className="w-full border border-lucy-border rounded-btn py-2 px-3 text-sm text-lucy-text focus:outline-none focus:border-lucy-accent resize-none"
                      />
                    </div>

                    {adjustMsg && (
                      <p className={`text-xs p-2 rounded-btn ${adjustMsg.startsWith('Error') ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                        {adjustMsg}
                      </p>
                    )}

                    <button
                      onClick={handleAjustar}
                      disabled={adjusting || !calorias || Math.abs(protPct + carbsPct + grasasPct - 100) > 1}
                      className="w-full bg-lucy-accent text-white font-medium rounded-btn py-2.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
                    >
                      {adjusting ? 'Procesando...' : 'Confirmar ajuste'}
                    </button>
                  </div>
                </div>

                {/* Historial */}
                {historial.length > 0 && (
                  <div className="bg-white rounded-2xl border border-lucy-border p-4">
                    <h3 className="text-sm font-medium text-lucy-text mb-3">Historial de ajustes</h3>
                    <div className="space-y-3">
                      {historial.map(h => (
                        <div key={h.id} className="border border-lucy-border/50 rounded-xl p-3 text-xs">
                          <div className="flex justify-between mb-1">
                            <span className="text-lucy-muted">{new Date(h.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            <span className="text-lucy-soft">{h.coach?.email}</span>
                          </div>
                          {h.tipo === 'cantidad' ? (
                            <p className="text-lucy-text">
                              {h.alimento_nombre}: {h.cantidad_antes} → {h.cantidad_despues}
                            </p>
                          ) : (
                            <p className="text-lucy-text">
                              Cal: {h.calorias_antes} → {h.calorias_despues} | Prot: {h.proteina_antes}g → {h.proteina_despues}g | Carbs: {h.carbs_antes}g → {h.carbs_despues}g | Grasas: {h.grasas_antes}g → {h.grasas_despues}g
                            </p>
                          )}
                          {h.nota && <p className="text-lucy-soft mt-1 italic">{h.nota}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
