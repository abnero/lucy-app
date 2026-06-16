'use client'

import { useState, useEffect, useRef } from 'react'
import FoodAvatar from '@/components/FoodAvatar'
import { toImperial } from '@/lib/units'
import type { DiaProblemático } from '@/lib/analisis-calorico'

// ── Types ──

export interface CalendarAlimento {
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

export interface CalendarViewItem {
  id: string
  dia: number
  comida: string
  cantidad: number
  unidad: string
  origen?: string
  alimento: CalendarAlimento
}

export interface MacroTotals {
  cal: number
  prot: number
  carbs: number
  grasas: number
}

// ── Helpers ──

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const COMIDAS = [
  { key: 'desayuno', label: 'Desayuno' },
  { key: 'almuerzo', label: 'Almuerzo' },
  { key: 'cena', label: 'Cena' },
  { key: 'snack', label: 'Snack' },
]

const ORDEN_CATEGORIA: Record<string, number> = {
  proteina: 1, carbohidrato: 2, vegetal: 3, grasa: 4,
  fruta: 5, lacteo: 5, bebida: 5, condimento: 5, otro: 6,
}

export function calcItemMacros(cantidad: number, a: CalendarAlimento): MacroTotals {
  const ratio = a.unidad_medida === 'unidad' ? cantidad : cantidad / (a.porcion_base || 100)
  return {
    cal: Math.round(a.calorias_por_unidad * ratio),
    prot: Math.round(a.proteina_por_unidad * ratio),
    carbs: Math.round(a.carbs_por_unidad * ratio),
    grasas: Math.round(a.grasas_por_unidad * ratio),
  }
}

export function sumMacros(items: CalendarViewItem[]): MacroTotals {
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

function sortByCategory(items: CalendarViewItem[]): CalendarViewItem[] {
  return [...items].sort(
    (a, b) => (ORDEN_CATEGORIA[a.alimento?.categoria_comida] || 6) - (ORDEN_CATEGORIA[b.alimento?.categoria_comida] || 6)
  )
}

// ── Display unit conversion (for coach editable input) ──

function getDisplayUnit(a: CalendarAlimento): { label: string; step: number; toDisplay: (db: number) => number; toDb: (display: number) => number; maxDisplay: number } {
  if (a.unidad_medida === 'unidad') {
    return { label: 'uds', step: 1, toDisplay: v => v, toDb: v => v, maxDisplay: 50 }
  }

  const display = a.unidad_display
  const factor = a.factor_conversion
  if (!display || !factor || factor <= 0) {
    return { label: a.unidad_medida === 'ml' ? 'ml' : 'g', step: 10, toDisplay: v => v, toDb: v => v, maxDisplay: 2000 }
  }

  const toDisplay = (db: number) => Math.round((db / factor) * 100) / 100
  const toDb = (dv: number) => dv * factor
  const maxDisplay = Math.round(toDisplay(2000) * 10) / 10

  switch (display) {
    case 'oz':
    case 'fl_oz':
      return { label: display === 'fl_oz' ? 'fl oz' : 'oz', step: 0.5, toDisplay, toDb, maxDisplay }
    case 'cup':
      return { label: 'tazas', step: 0.25, toDisplay, toDb, maxDisplay }
    case 'tbsp':
      return { label: 'cdas', step: 1, toDisplay, toDb, maxDisplay }
    case 'scoop':
      return { label: 'scoops', step: 1, toDisplay, toDb, maxDisplay }
    case 'tajada':
      return { label: 'tajadas', step: 1, toDisplay, toDb, maxDisplay }
    case 'unidad':
      return { label: 'uds', step: 1, toDisplay, toDb, maxDisplay }
    default:
      return { label: 'g', step: 10, toDisplay: v => v, toDb: v => v, maxDisplay: 2000 }
  }
}

// ── Sub-components ──

function EditableQuantityInput({
  item,
  onSave,
}: {
  item: CalendarViewItem
  onSave: (itemId: string, newCantidadDb: number) => Promise<void>
}) {
  const unit = item.alimento ? getDisplayUnit(item.alimento) : null
  const displayValue = unit ? unit.toDisplay(item.cantidad) : item.cantidad
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(displayValue.toString())
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing && unit) setValue(unit.toDisplay(item.cantidad).toString())
  }, [item.cantidad, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const commitEdit = async () => {
    if (!unit) return
    const parsed = parseFloat(value)
    if (!parsed || parsed <= 0 || isNaN(parsed) || parsed === displayValue) {
      setValue(displayValue.toString())
      setEditing(false)
      return
    }
    const clamped = Math.min(parsed, unit.maxDisplay)
    const dbValue = Math.round(unit.toDb(clamped) * 10) / 10
    setSaving(true)
    await onSave(item.id, dbValue)
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
        onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setValue(displayValue.toString()); setEditing(false) } }}
        min={unit?.step || 1}
        max={unit?.maxDisplay || 2000}
        step={unit?.step || 1}
        className="w-16 border border-lucy-accent rounded px-1.5 py-0.5 text-xs text-lucy-text focus:outline-none focus:ring-1 focus:ring-lucy-accent"
        autoFocus
      />
      <span className="text-[10px] text-lucy-muted">{unit?.label || 'g'}</span>
    </div>
  )
}

function MacroBar({ label, totals }: { label: string; totals: MacroTotals }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-lucy-soft">
      {label && <span className="text-lucy-muted">{label}:</span>}
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

function QuantityDisplay({ item }: { item: CalendarViewItem }) {
  return (
    <p className="text-xs text-lucy-muted">
      {item.alimento ? toImperial(item.cantidad, item.alimento) : `${item.cantidad} ${item.unidad}`}
    </p>
  )
}

// ── Coach Analysis Banner (informational, no action buttons) ──

function BannerAnalisisCoach({ diaDato }: { diaDato: DiaProblemático }) {
  const tieneExcesoCal = diaDato.problemas.includes('exceso_calorias')
  const tieneDeficitCal = diaDato.problemas.includes('deficit_calorias')
  const tieneDeficitProt = diaDato.problemas.includes('deficit_proteina')
  const tieneExcesoProt = diaDato.problemas.includes('exceso_proteina')
  const kcalDiff = Math.abs(diaDato.diferencia_calorias)
  const protDiff = Math.abs(Math.round(diaDato.diferencia_proteina))

  const calProblem = tieneExcesoCal || tieneDeficitCal
  const protProblem = tieneDeficitProt || tieneExcesoProt
  const protMsg = tieneExcesoProt ? `${protDiff}g prot de más` : `${protDiff}g prot de menos`

  let mensaje: string
  if (calProblem && protProblem) {
    const calPart = tieneExcesoCal ? `${kcalDiff} kcal de más` : `${kcalDiff} kcal de menos`
    mensaje = `${calPart} · ${protMsg}`
  } else if (tieneExcesoCal) {
    mensaje = `${kcalDiff} kcal de más`
  } else if (tieneDeficitCal) {
    mensaje = `${kcalDiff} kcal de menos`
  } else {
    mensaje = protMsg
  }

  return (
    <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-red-500 text-sm">⚠️</span>
        <span className="text-xs font-medium text-red-700">{mensaje}</span>
      </div>
      <div className="flex gap-3 mt-1 text-[10px] text-red-600">
        <span>🔥 {Math.round(diaDato.macros.calorias)} / {diaDato.objetivo_calorias} kcal</span>
        <span>💪 {Math.round(diaDato.macros.proteina)}g / {Math.round(diaDato.objetivo_proteina)}g prot</span>
      </div>
    </div>
  )
}

// ── Day View ──

interface CalendarDayViewProps {
  items: CalendarViewItem[]
  diaActivo: number
  onChangeDia: (dia: number) => void
  mode: 'coach' | 'clienta'
  // Coach mode
  onSaveQuantity?: (itemId: string, newCantidadDb: number) => Promise<void>
  diaDato?: DiaProblemático | undefined
  // Clienta mode
  onItemClick?: (item: CalendarViewItem) => void
  macroPopup?: string | null
  onToggleMacroPopup?: (key: string | null) => void
  // Optional
  slideClass?: string
  diasProblematicos?: Set<number>
}

export function CalendarDayView({
  items,
  diaActivo,
  onChangeDia,
  mode,
  onSaveQuantity,
  diaDato,
  onItemClick,
  macroPopup,
  onToggleMacroPopup,
  slideClass,
  diasProblematicos,
}: CalendarDayViewProps) {
  const itemsDelDia = items.filter(i => i.dia === diaActivo)
  const macrosDia = sumMacros(itemsDelDia)

  return (
    <>
      {/* Coach analysis banner — informational, no action buttons */}
      {mode === 'coach' && diaDato && <BannerAnalisisCoach diaDato={diaDato} />}

      {/* Day tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-hide">
        {DIAS.map((d, i) => {
          const diaNum = i + 1
          const esProblematico = diasProblematicos?.has(diaNum)
          return (
            <button
              key={i}
              onClick={() => onChangeDia(diaNum)}
              className={`relative shrink-0 px-3 py-2 rounded-btn text-xs transition-colors ${
                diaActivo === diaNum
                  ? 'bg-lucy-accent text-white'
                  : 'bg-lucy-white border border-lucy-border text-lucy-muted hover:border-lucy-soft'
              }`}
            >
              {d.slice(0, 3)}
              {esProblematico && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-lucy-bg" />
              )}
            </button>
          )
        })}
      </div>

      {/* Meals */}
      <div className={slideClass ? `transition-all duration-150 ease-in-out ${slideClass}` : ''}>
        <div className="space-y-4">
          {COMIDAS.map(({ key, label }) => {
            const comidaItems = sortByCategory(itemsDelDia.filter(i => i.comida === key))
            if (comidaItems.length === 0) return null
            const mealMacros = sumMacros(comidaItems)
            const popupKey = `${diaActivo}-${key}`
            const isPopupOpen = macroPopup === popupKey

            return (
              <div key={key} className="bg-lucy-white rounded-card border border-lucy-border p-4">
                {/* Meal header */}
                {mode === 'clienta' ? (
                  <button
                    onClick={() => onToggleMacroPopup?.(isPopupOpen ? null : popupKey)}
                    className="text-xs text-lucy-muted mb-3 uppercase tracking-wider flex items-center gap-1.5"
                  >
                    {label}
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform ${isPopupOpen ? 'rotate-180' : ''}`}>
                      <path d="M2 4l3 3 3-3" stroke="#9896B0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ) : (
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-lucy-muted uppercase tracking-wider">{label}</p>
                    <MacroBar label="" totals={mealMacros} />
                  </div>
                )}

                {/* Clienta macro popup */}
                {mode === 'clienta' && isPopupOpen && (
                  <div className="mb-3 grid grid-cols-4 gap-1.5 animate-macroIn">
                    {[
                      { label: 'Cal', value: mealMacros.cal, unit: 'kcal' },
                      { label: 'Prot', value: mealMacros.prot, unit: 'g' },
                      { label: 'Carbs', value: mealMacros.carbs, unit: 'g' },
                      { label: 'Grasas', value: mealMacros.grasas, unit: 'g' },
                    ].map(m => (
                      <div key={m.label} className="border border-lucy-border rounded-btn p-2 text-center">
                        <p className="text-sm font-medium text-lucy-text leading-tight">{m.value}</p>
                        <p className="text-[9px] text-lucy-muted">{m.label}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Food items */}
                <div className="space-y-3">
                  {comidaItems.map(item => (
                    <div key={item.id} className={`flex items-center gap-3 ${mode === 'coach' && item.origen === 'coach' ? 'pl-1 border-l-2 border-lucy-accent' : ''}`}>
                      {mode === 'clienta' ? (
                        <button className="flex items-center gap-3 w-full text-left" onClick={() => onItemClick?.(item)}>
                          <FoodAvatar nombre={item.alimento?.nombre || '?'} foto_url={item.alimento?.foto_url} />
                          <div>
                            <p className="text-sm text-lucy-text">{item.alimento?.nombre}</p>
                            <QuantityDisplay item={item} />
                          </div>
                        </button>
                      ) : (
                        <>
                          <FoodAvatar nombre={item.alimento?.nombre || '?'} foto_url={item.alimento?.foto_url} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-lucy-text">{item.alimento?.nombre}</p>
                            {onSaveQuantity ? (
                              <EditableQuantityInput item={item} onSave={onSaveQuantity} />
                            ) : (
                              <QuantityDisplay item={item} />
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {itemsDelDia.length === 0 && (
            <div className="bg-lucy-white rounded-card border border-lucy-border p-8 text-center">
              <p className="text-sm text-lucy-muted">No hay comidas programadas para este día</p>
            </div>
          )}
        </div>

        {/* Day totals — coach only */}
        {mode === 'coach' && itemsDelDia.length > 0 && (
          <div className="mt-4 pt-3 border-t border-lucy-border">
            <MacroBar label="Total del día" totals={macrosDia} />
          </div>
        )}
      </div>
    </>
  )
}

// ── Week View ──

interface CalendarWeekViewProps {
  items: CalendarViewItem[]
  mode?: 'coach' | 'clienta'
  onCellClick?: (dia: number) => void
  weekDates?: Date[]
}

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function CalendarWeekView({ items, onCellClick, weekDates }: CalendarWeekViewProps) {
  const hasSnacks = items.some(i => i.comida === 'snack')
  const comidas = hasSnacks ? COMIDAS : COMIDAS.slice(0, 3)

  return (
    <div className="overflow-x-auto scrollbar-hide">
      <div className="bg-lucy-white rounded-card border border-lucy-border" style={{ minWidth: 'max-content' }}>
        {/* Header row */}
        <div className="flex border-b border-lucy-border">
          <div style={{ width: '80px' }} className="shrink-0 px-2 py-2" />
          {DIAS.map((d, i) => (
            <div key={i} style={{ width: '130px' }} className="shrink-0 px-2 py-2 text-center border-l border-lucy-border">
              <p className="text-[11px] text-lucy-muted uppercase tracking-wider">{d.slice(0, 3)}</p>
              {weekDates && (
                <p className="text-[10px] text-lucy-soft">{weekDates[i].getDate()} {MESES_CORTOS[weekDates[i].getMonth()]}</p>
              )}
            </div>
          ))}
        </div>
        {/* Meal rows */}
        {comidas.map(({ key, label }) => (
          <div key={key} className="flex border-b border-lucy-border last:border-b-0">
            <div style={{ width: '80px' }} className="shrink-0 px-2 py-3 flex items-start">
              <p className="text-[11px] text-lucy-muted uppercase tracking-wider">{label}</p>
            </div>
            {DIAS.map((_, i) => {
              const dia = i + 1
              const cellItems = sortByCategory(items.filter(it => it.dia === dia && it.comida === key))
              const CellTag = onCellClick ? 'button' : 'div'
              return (
                <CellTag
                  key={i}
                  onClick={onCellClick ? () => onCellClick(dia) : undefined}
                  style={{ width: '130px' }}
                  className={`shrink-0 px-2 py-2 border-l border-lucy-border space-y-1.5 text-left ${onCellClick ? 'hover:bg-gray-50 transition-colors' : ''}`}
                >
                  {cellItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <FoodAvatar nombre={item.alimento?.nombre || '?'} foto_url={item.alimento?.foto_url} size="xs" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-lucy-text leading-tight" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.alimento?.nombre}</p>
                        <p className="text-[9px] text-lucy-muted leading-tight">
                          {item.alimento ? toImperial(item.cantidad, item.alimento) : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </CellTag>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
