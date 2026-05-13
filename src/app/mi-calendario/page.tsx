'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'
import ChatPanel from '@/components/ChatPanel'
import FoodAvatar from '@/components/FoodAvatar'
import FoodWizard, { WizardAlimento } from '@/components/FoodWizard'
import { toImperial } from '@/lib/units'
import { useAnalisisCalorico } from '@/hooks/useAnalisisCalorico'
import { BannerResumen, BannerAnalisisDia } from '@/components/AnalisisCalorico'
import { useTrackEvent } from '@/hooks/useTrackEvent'
import { registrarCambioEnChat } from '@/lib/registrar-cambio-lucy'
import { nombreDiaCompleto, type AlimentoCalendario, type CandidatoSnack } from '@/lib/analisis-calorico'
import BannerReOnboarding from '@/components/BannerReOnboarding'
import ModalReOnboarding from '@/components/ModalReOnboarding'
import type { Meta, Genero } from '@/lib/calculo-macros'

interface CalendarioItem {
  id: string
  alimento_id: string
  dia: number
  comida: string
  cantidad: number
  unidad: string
  alimento: {
    nombre: string
    foto_url: string | null
    categoria_comida: string
    calorias_por_unidad: number
    proteina_por_unidad: number
    carbs_por_unidad: number
    grasas_por_unidad: number
    porcion_base: number
    porcion_min: number
    porcion_max: number
    unidad_medida: string
    unidad_display: string | null
    factor_conversion: number | null
    rol_permitido: string[]
  }
}

const ORDEN_CATEGORIA: Record<string, number> = {
  proteina: 1, carbohidrato: 2, vegetal: 3, grasa: 4,
  fruta: 5, lacteo: 5, bebida: 5, condimento: 5, otro: 6,
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const COMIDAS = [
  { key: 'desayuno', label: 'Desayuno' },
  { key: 'almuerzo', label: 'Almuerzo' },
  { key: 'cena', label: 'Cena' },
  { key: 'snack', label: 'Snack' },
]
const COMIDAS_BASE = COMIDAS.slice(0, 3)
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function getWeekDates(): Date[] {
  const today = new Date()
  const day = today.getDay() // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function formatShortDate(d: Date): string {
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`
}

function getSwapRoles(comida: string, rolPermitido: string[]): string[] {
  if (comida === 'desayuno') {
    const breakfast = rolPermitido.filter(r => r.startsWith('Desayuno'))
    return breakfast.length > 0 ? breakfast : ['Desayuno_1']
  }
  const main = rolPermitido.filter(r => !r.startsWith('Desayuno'))
  return main.length > 0 ? main : rolPermitido
}

const ROL_LABELS: Record<string, string> = {
  Desayuno_1: 'Desayuno',
  Desayuno_2: 'Acompañante',
  Proteina: 'Proteína',
  Carbohidrato: 'Carbs',
  Fibra: 'Fibra',
  Grasa: 'Grasa',
}

export default function MiCalendarioPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const trackEvent = useTrackEvent()
  useEffect(() => { trackEvent('page_view_plan') }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [items, setItems] = useState<CalendarioItem[]>([])
  const [diaActivo, setDiaActivo] = useState(() => {
    const jsDay = new Date().getDay() // 0=Sun, 1=Mon, ..., 6=Sat
    return jsDay === 0 ? 7 : jsDay // 1=Mon, ..., 7=Sun
  })
  const [loadingData, setLoadingData] = useState(true)
  const [nombre, setNombre] = useState('')
  const [showHint, setShowHint] = useState(true)
  const [mostrarBannerResumen, setMostrarBannerResumen] = useState(true)
  const [macroPopup, setMacroPopup] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<CalendarioItem | null>(null)
  const [showDayMacros, setShowDayMacros] = useState(false)
  const [objetivos, setObjetivos] = useState({ cal: 0, prot: 0, carbs: 0, grasas: 0 })
  const [slideClass, setSlideClass] = useState('')
  const [vista, setVista] = useState<'dia' | 'semana'>('dia')
  const [exportingPdf, setExportingPdf] = useState(false)
  const [wizardTarget, setWizardTarget] = useState<CalendarioItem | null>(null)
  const [showReOnboarding, setShowReOnboarding] = useState(false)
  const [needsReOnboarding, setNeedsReOnboarding] = useState(false)
  const [reOnboardingUserData, setReOnboardingUserData] = useState<{ peso_kg: number; altura_cm: number; edad: number; meta: Meta; genero: Genero } | null>(null)
  const animating = useRef(false)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const mealsRef = useRef<HTMLDivElement>(null)
  const pdfContainerRef = useRef<HTMLDivElement>(null)
  const weekDates = useRef(getWeekDates()).current
  const [candidatosSnack, setCandidatosSnack] = useState<CandidatoSnack[]>([])

  // Fetch snack candidates: pool personal first, fallback to catalog
  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function fetchSnackCandidates() {
      if (!user) return
      // 1. Pool personal: alimentos in preferencias_usuario that have 'Snack' in rol_permitido
      const { data: poolData } = await supabase
        .from('preferencias_usuario')
        .select('alimento:alimentos(id, nombre, foto_url, calorias_por_unidad, proteina_por_unidad, porcion_base, porcion_min, porcion_max, unidad_medida, unidad_display, factor_conversion, rol_permitido)')
        .eq('user_id', user.id)

      const poolSnacks: CandidatoSnack[] = (poolData || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => {
          const a = Array.isArray(r.alimento) ? r.alimento[0] : r.alimento
          if (!a || !(a.rol_permitido || []).includes('Snack')) return null
          return {
            alimento_id: a.id,
            nombre: a.nombre,
            foto_url: a.foto_url,
            calorias_por_unidad: a.calorias_por_unidad,
            proteina_por_unidad: a.proteina_por_unidad,
            porcion_base: a.porcion_base,
            porcion_min: a.porcion_min,
            porcion_max: a.porcion_max,
            unidad_medida: a.unidad_medida,
            unidad_display: a.unidad_display ?? null,
            factor_conversion: a.factor_conversion ?? null,
            es_del_pool: true,
          } as CandidatoSnack
        })
        .filter((x: CandidatoSnack | null): x is CandidatoSnack => x !== null)

      // 2. Catalog fallback: if pool has <2 snack options, fill from general catalog
      let catalogSnacks: CandidatoSnack[] = []
      if (poolSnacks.length < 2) {
        const poolIds = new Set(poolSnacks.map(s => s.alimento_id))
        const { data: catData } = await supabase
          .from('alimentos')
          .select('id, nombre, foto_url, calorias_por_unidad, proteina_por_unidad, porcion_base, porcion_min, porcion_max, unidad_medida, unidad_display, factor_conversion, rol_permitido')
          .contains('rol_permitido', ['Snack'])

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        catalogSnacks = (catData || [])
          .filter((a: any) => !poolIds.has(a.id)) // eslint-disable-line @typescript-eslint/no-explicit-any
          .map((a: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
            alimento_id: a.id,
            nombre: a.nombre,
            foto_url: a.foto_url,
            calorias_por_unidad: a.calorias_por_unidad,
            proteina_por_unidad: a.proteina_por_unidad,
            porcion_base: a.porcion_base,
            porcion_min: a.porcion_min,
            porcion_max: a.porcion_max,
            unidad_medida: a.unidad_medida,
            unidad_display: a.unidad_display ?? null,
            factor_conversion: a.factor_conversion ?? null,
            es_del_pool: false,
          } as CandidatoSnack))
      }

      if (!cancelled) {
        setCandidatosSnack([...poolSnacks, ...catalogSnacks])
      }
    }

    fetchSnackCandidates()
    return () => { cancelled = true }
  }, [user])

  const fetchCalendar = useCallback(() => {
    if (!user) return
    console.log('[Calendar] fetchCalendar triggered')
    setMostrarBannerResumen(true)
    supabase
      .from('calendario')
      .select('id, alimento_id, dia, comida, cantidad, unidad, alimento:alimentos(nombre, foto_url, categoria_comida, calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad, porcion_base, porcion_min, porcion_max, unidad_medida, unidad_display, factor_conversion, rol_permitido)')
      .eq('user_id', user.id)
      .order('dia')
      .order('comida')
      .then(({ data }) => {
        if (data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setItems(data.map((r: any) => ({
            ...r,
            alimento: Array.isArray(r.alimento) ? r.alimento[0] : r.alimento,
          })))
        }
      })
  }, [user])

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
      return
    }
    if (!loading && user) {
      Promise.all([
        supabase
          .from('calendario')
          .select('id, alimento_id, dia, comida, cantidad, unidad, alimento:alimentos(nombre, foto_url, categoria_comida, calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad, porcion_base, porcion_min, porcion_max, unidad_medida, unidad_display, factor_conversion, rol_permitido)')
          .eq('user_id', user.id)
          .order('dia')
          .order('comida'),
        supabase
          .from('usuarios')
          .select('nombre, calorias_objetivo, proteina_objetivo, carbs_objetivo, grasas_objetivo, onboarding_completado, re_onboarding_completado, peso_kg, altura_cm, edad, meta, genero')
          .eq('id', user.id)
          .single(),
      ]).then(([calRes, userRes]) => {
        if (!userRes.data || !userRes.data.onboarding_completado) {
          router.push('/onboarding')
          return
        }
        if (userRes.data && !userRes.data.re_onboarding_completado) {
          setNeedsReOnboarding(true)
          setReOnboardingUserData({
            peso_kg: userRes.data.peso_kg || 60,
            altura_cm: userRes.data.altura_cm || 160,
            edad: userRes.data.edad || 30,
            meta: (userRes.data.meta as Meta) || 'mantener_peso',
            genero: (userRes.data.genero as Genero) || 'femenino',
          })
        }
        if (calRes.error) console.error('Calendar fetch error:', calRes.error.message)
        if (calRes.data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setItems(calRes.data.map((r: any) => ({
            ...r,
            alimento: Array.isArray(r.alimento) ? r.alimento[0] : r.alimento,
          })))
        }
        if (userRes.data) {
          setNombre(userRes.data.nombre)
          setObjetivos({
            cal: userRes.data.calorias_objetivo || 0,
            prot: userRes.data.proteina_objetivo || 0,
            carbs: userRes.data.carbs_objetivo || 0,
            grasas: userRes.data.grasas_objetivo || 0,
          })
        }
        setLoadingData(false)
      }).catch(err => {
        console.error('Calendar load failed:', err)
        setLoadingData(false)
      })
    }
  }, [user, loading, router])

  // Hide swipe hint after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  // Swipe with slide animation
  const changeDia = useCallback((newDia: number, direction: 'left' | 'right') => {
    if (animating.current) return
    animating.current = true
    setMostrarBannerResumen(false)
    // Exit: slide current content out
    setSlideClass(direction === 'left' ? '-translate-x-full opacity-0' : 'translate-x-full opacity-0')
    setTimeout(() => {
      // Swap day, position new content on opposite side instantly
      setDiaActivo(newDia)
      setMacroPopup(null)
      setShowDayMacros(false)
      setSlideClass(
        (direction === 'left' ? 'translate-x-full' : '-translate-x-full') + ' opacity-0 !duration-0'
      )
      // Next frame: slide in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSlideClass('translate-x-0 opacity-100')
          setTimeout(() => { animating.current = false }, 150)
        })
      })
    }, 150)
  }, [])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (animating.current) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && diaActivo < 7) changeDia(diaActivo + 1, 'left')
      if (dx > 0 && diaActivo > 1) changeDia(diaActivo - 1, 'right')
    }
  }, [diaActivo, changeDia])

  const itemsDelDia = items.filter(i => i.dia === diaActivo)
  const hasSnacks = items.some(i => i.comida === 'snack')
  const comidasSemana = hasSnacks ? [...COMIDAS_BASE, { key: 'snack', label: 'Snack' }] : COMIDAS_BASE

  // Map calendar items to AlimentoCalendario format for analysis hook
  const alimentosParaAnalisis: AlimentoCalendario[] = items
    .filter(i => i.alimento)
    .map(i => ({
      alimento_id: i.alimento_id,
      nombre: i.alimento.nombre,
      cantidad: i.cantidad,
      unidad_medida: (i.alimento.unidad_medida as 'gramos' | 'ml' | 'unidad'),
      porcion_base: i.alimento.porcion_base,
      porcion_min: i.alimento.porcion_min,
      porcion_max: i.alimento.porcion_max,
      calorias_por_unidad: i.alimento.calorias_por_unidad,
      proteina_por_unidad: i.alimento.proteina_por_unidad,
      comida: i.comida as 'desayuno' | 'almuerzo' | 'cena' | 'snack',
      dia: i.dia,
      rol_permitido: i.alimento.rol_permitido ?? [],
    }))

  const { resultado, diasProblematicos, getDiaDato, aplicarSugerencia } = useAnalisisCalorico({
    alimentos: alimentosParaAnalisis,
    objetivo_calorias: objetivos.cal,
    objetivo_proteina: objetivos.prot,
    candidatosSnack,
    onCambiarCantidad: async ({ alimento_id, nombre, comida, dia, cantidad_nueva }) => {
      if (!user) return
      const target = items.find(i => i.alimento_id === alimento_id && i.comida === comida && i.dia === dia)
      if (!target) return

      await supabase
        .from('calendario')
        .update({ cantidad: cantidad_nueva, origen: 'sugerencia' })
        .eq('id', target.id)

      const cpu = target.alimento.unidad_medida === 'unidad'
        ? target.alimento.calorias_por_unidad
        : target.alimento.calorias_por_unidad / (target.alimento.porcion_base || 100)
      const impacto_calorias = Math.round((cantidad_nueva - target.cantidad) * cpu)

      await registrarCambioEnChat({
        user_id: user.id,
        nombre_alimento: nombre,
        comida,
        dia_nombre: nombreDiaCompleto(dia),
        cantidad_anterior: target.cantidad,
        cantidad_nueva,
        unidad_medida: target.alimento.unidad_medida,
        impacto_calorias,
      })

      setItems(prev => prev.map(it =>
        it.id === target.id ? { ...it, cantidad: cantidad_nueva } : it
      ))
    },
  })

  const agregarSnack = useCallback(async (opcion: import('@/lib/analisis-calorico').OpcionSnack, dia: number): Promise<{ compensaciones: import('@/lib/analisis-calorico').Compensacion[] }> => {
    if (!user) return { compensaciones: [] }
    const { data: session } = await supabase.auth.getSession()
    const token = session?.session?.access_token
    if (!token) return { compensaciones: [] }

    const res = await fetch('/api/agregar-snack', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        user_id: user.id,
        alimento_id: opcion.alimento_id,
        cantidad: opcion.cantidad,
        dia,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Error al agregar snack')
    }

    const result = await res.json()
    const compensaciones: import('@/lib/analisis-calorico').Compensacion[] = result.compensaciones || []

    // Refresh calendar to pick up snack + compensation changes
    fetchCalendar()

    return { compensaciones }
  }, [user, fetchCalendar])

  const exportarPdf = useCallback(async () => {
    if (exportingPdf) return
    const node = pdfContainerRef.current
    if (!node) return
    setExportingPdf(true)
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ])
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgRatio = canvas.width / canvas.height
      const pageRatio = pageW / pageH
      let renderW: number, renderH: number
      if (imgRatio > pageRatio) {
        renderW = pageW
        renderH = pageW / imgRatio
      } else {
        renderH = pageH
        renderW = pageH * imgRatio
      }
      const x = (pageW - renderW) / 2
      const y = (pageH - renderH) / 2
      pdf.addImage(imgData, 'PNG', x, y, renderW, renderH)
      const fechaStr = new Date().toISOString().slice(0, 10)
      const safeName = (nombre || 'usuaria').replace(/\s+/g, '-')
      pdf.save(`Lucy-Calendario-${safeName}-${fechaStr}.pdf`)
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setExportingPdf(false)
    }
  }, [exportingPdf, nombre])

  const handleSwapAlimento = useCallback(async (nuevoAlimento: WizardAlimento) => {
    if (!wizardTarget || !user) return
    const original = wizardTarget
    const a = original.alimento
    trackEvent('action_swap_card', { dia: original.dia, comida: original.comida, anterior: a.nombre, nuevo: nuevoAlimento.nombre })

    // Recalculate quantity to match original calories
    const calOrig = a.calorias_por_unidad
    const calNuevo = nuevoAlimento.calorias_por_unidad
    let cantidadNueva = calNuevo > 0
      ? Math.round((original.cantidad * calOrig) / calNuevo)
      : nuevoAlimento.porcion_base || 100

    // Clamp to porcion_min / porcion_max
    const pMin = nuevoAlimento.porcion_min || 0
    const pMax = nuevoAlimento.porcion_max || Infinity
    if (cantidadNueva < pMin) cantidadNueva = pMin
    if (cantidadNueva > pMax) cantidadNueva = pMax

    // Update Supabase
    const { error: dbErr } = await supabase
      .from('calendario')
      .update({ alimento_id: nuevoAlimento.id, cantidad: cantidadNueva })
      .eq('id', original.id)

    if (dbErr) {
      console.error('Swap failed:', dbErr)
      return
    }

    // Update shopping list — subtract old, add new
    const uid = user.id
    const oldAlimentoId = original.alimento_id
    const cantidadOrig = original.cantidad

    // 1. Subtract old food
    const { data: oldRow } = await supabase
      .from('lista_compras')
      .select('id, cantidad_total')
      .eq('user_id', uid)
      .eq('alimento_id', oldAlimentoId)
      .single()

    if (oldRow) {
      const remaining = oldRow.cantidad_total - cantidadOrig
      if (remaining <= 0) {
        await supabase.from('lista_compras').delete().eq('id', oldRow.id)
      } else {
        await supabase.from('lista_compras').update({ cantidad_total: remaining }).eq('id', oldRow.id)
      }
    }

    // 2. Add new food
    const { data: newRow } = await supabase
      .from('lista_compras')
      .select('id, cantidad_total')
      .eq('user_id', uid)
      .eq('alimento_id', nuevoAlimento.id)
      .single()

    if (newRow) {
      await supabase.from('lista_compras').update({ cantidad_total: newRow.cantidad_total + cantidadNueva }).eq('id', newRow.id)
    } else {
      await supabase.from('lista_compras').insert({
        user_id: uid,
        alimento_id: nuevoAlimento.id,
        cantidad_total: cantidadNueva,
        unidad: nuevoAlimento.unidad_medida,
        comprado: false,
      })
    }

    // Update local state
    setItems(prev => prev.map(item => {
      if (item.id !== original.id) return item
      return {
        ...item,
        alimento_id: nuevoAlimento.id,
        cantidad: cantidadNueva,
        alimento: {
          nombre: nuevoAlimento.nombre,
          foto_url: nuevoAlimento.foto_url,
          categoria_comida: nuevoAlimento.categoria_comida,
          calorias_por_unidad: nuevoAlimento.calorias_por_unidad,
          proteina_por_unidad: nuevoAlimento.proteina_por_unidad,
          carbs_por_unidad: nuevoAlimento.carbs_por_unidad,
          grasas_por_unidad: nuevoAlimento.grasas_por_unidad,
          porcion_base: nuevoAlimento.porcion_base,
          porcion_min: nuevoAlimento.porcion_min,
          porcion_max: nuevoAlimento.porcion_max,
          unidad_medida: nuevoAlimento.unidad_medida,
          unidad_display: nuevoAlimento.unidad_display,
          factor_conversion: nuevoAlimento.factor_conversion,
          rol_permitido: nuevoAlimento.rol_permitido,
        },
      }
    }))

    setWizardTarget(null)
    setSelectedItem(null)
  }, [wizardTarget, user])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lucy-muted text-sm">Cargando...</p>
      </div>
    )
  }

  if (!user) {
    router.push('/login')
    return null
  }

  if (loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lucy-muted text-sm">Cargando calendario...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Re-onboarding banner */}
      {needsReOnboarding && !showReOnboarding && (
        <BannerReOnboarding onOpen={() => setShowReOnboarding(true)} />
      )}

      {/* Re-onboarding modal */}
      {showReOnboarding && user && reOnboardingUserData && (
        <ModalReOnboarding
          userId={user.id}
          userData={reOnboardingUserData}
          onComplete={() => {
            setShowReOnboarding(false)
            setNeedsReOnboarding(false)
            fetchCalendar()
          }}
        />
      )}

      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          <div>
            <h1 className="font-logo text-xl text-lucy-text">Lucy</h1>
            <p className="text-lucy-soft text-[9px] tracking-[0.25em] uppercase">calendario metabólico</p>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm text-lucy-text hidden xs:block">Hola, <span className="font-medium">{nombre}</span></p>
            <div className="flex items-center gap-0.5 bg-lucy-border/30 rounded-btn p-0.5">
              <button
                onClick={() => setVista('dia')}
                aria-label="Vista día"
                className={`p-1.5 rounded ${vista === 'dia' ? 'bg-lucy-white' : ''}`}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="2" y="2" width="10" height="10" rx="1.5" stroke={vista === 'dia' ? '#7B7FC4' : '#9896B0'} strokeWidth="1.5" />
                </svg>
              </button>
              <button
                onClick={() => setVista('semana')}
                aria-label="Vista semanal"
                className={`p-1.5 rounded ${vista === 'semana' ? 'bg-lucy-white' : ''}`}
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
      </div>

      {vista === 'dia' && (<>
      {/* Banner resumen análisis calórico */}
      {resultado && mostrarBannerResumen && <BannerResumen resultado={resultado} onVerDetalle={() => {
        if (!resultado.dias_problematicos.length || animating.current) return
        // Find first problematic day that is NOT the current day, fallback to first
        const target = resultado.dias_problematicos.find(d => d.dia !== diaActivo) ?? resultado.dias_problematicos[0]
        if (target.dia === diaActivo) return
        changeDia(target.dia, target.dia > diaActivo ? 'left' : 'right')
      }} />}

      {/* Day tabs */}
      <div className="px-4 mb-4">
        <div className="max-w-lg mx-auto">
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
            {DIAS.map((dia, i) => {
              const diaNum = i + 1
              const esProblematico = diasProblematicos.has(diaNum)
              return (
                <button
                  key={i}
                  onClick={() => {
                    if (diaNum === diaActivo || animating.current) return
                    changeDia(diaNum, diaNum > diaActivo ? 'left' : 'right')
                  }}
                  className={`relative shrink-0 px-3 py-2 rounded-btn text-xs transition-colors ${
                    diaActivo === diaNum
                      ? 'bg-lucy-accent text-white'
                      : 'bg-lucy-white border border-lucy-border text-lucy-muted hover:border-lucy-soft'
                  }`}
                >
                  {dia.slice(0, 3)}
                  {esProblematico && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-lucy-bg" aria-label="Día fuera de meta" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Day title */}
      <div className="px-4 mb-4">
        <div className="max-w-lg mx-auto">
          <button onClick={() => setShowDayMacros(true)}>
            <h2 className="text-base text-lucy-text">{DIAS[diaActivo - 1]}</h2>
          </button>
        </div>
      </div>

      {/* Banner análisis día */}
      {(() => {
        const diaDato = getDiaDato(diaActivo)
        return diaDato ? (
          <BannerAnalisisDia key={diaDato.dia} diaDato={diaDato} onAplicarSugerencia={aplicarSugerencia} onAgregarSnack={agregarSnack} />
        ) : null
      })()}

      {/* Day macros modal */}
      {showDayMacros && (() => {
        const dayMacros = itemsDelDia.reduce((acc, item) => {
          const a = item.alimento
          if (!a) return acc
          const ratio = a.unidad_medida === 'unidad' ? item.cantidad : item.cantidad / (a.porcion_base || 100)
          return {
            cal: acc.cal + a.calorias_por_unidad * ratio,
            prot: acc.prot + a.proteina_por_unidad * ratio,
            carbs: acc.carbs + a.carbs_por_unidad * ratio,
            grasas: acc.grasas + a.grasas_por_unidad * ratio,
          }
        }, { cal: 0, prot: 0, carbs: 0, grasas: 0 })

        return (
          <>
            <div className="fixed inset-0 bg-black/20 z-30" onClick={() => setShowDayMacros(false)} />
            <div className="fixed inset-0 z-40 flex items-center justify-center px-6 pointer-events-none">
              <div className="bg-lucy-white rounded-card border border-lucy-border p-6 w-full max-w-xs pointer-events-auto animate-macroIn">
                <div className="text-center mb-4">
                  <p className="text-2xl mb-1">📅</p>
                  <p className="text-sm font-medium text-lucy-text">Macros del día</p>
                  <p className="text-xs text-lucy-muted">{DIAS[diaActivo - 1]}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { label: 'Calorías', value: Math.round(dayMacros.cal), target: objetivos.cal, unit: 'kcal' },
                    { label: 'Proteína', value: Math.round(dayMacros.prot), target: objetivos.prot, unit: 'g' },
                    { label: 'Carbs', value: Math.round(dayMacros.carbs), target: objetivos.carbs, unit: 'g' },
                    { label: 'Grasas', value: Math.round(dayMacros.grasas), target: objetivos.grasas, unit: 'g' },
                  ].map(m => (
                    <div key={m.label} className="border border-lucy-border rounded-btn p-3 text-center">
                      <p className="text-[11px] text-lucy-muted mb-1">{m.label}</p>
                      <p className="text-[32px] font-semibold text-lucy-text leading-none">{m.value.toLocaleString()}</p>
                      <p className="text-[11px] text-lucy-muted mt-0.5">{m.unit}</p>
                      <p className="text-[13px] text-lucy-soft">/ {m.target.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowDayMacros(false)}
                  className="w-full text-xs text-lucy-muted hover:text-lucy-accent transition-colors py-1"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </>
        )
      })()}

      {/* Swipe hint */}
      {showHint && (
        <div className="px-4 mb-3 transition-opacity duration-500">
          <p className="text-center text-[11px] text-lucy-soft">Desliza para ver los demás días →</p>
        </div>
      )}

      {/* Meals — swipeable */}
      <div
        ref={mealsRef}
        className="px-4 overflow-x-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={`max-w-lg mx-auto space-y-4 transition-all duration-150 ease-in-out ${slideClass}`}
        >
          {COMIDAS.map(({ key, label }) => {
            const comidaItems = itemsDelDia
              .filter(i => i.comida === key)
              .sort((a, b) => (ORDEN_CATEGORIA[a.alimento?.categoria_comida] || 6) - (ORDEN_CATEGORIA[b.alimento?.categoria_comida] || 6))
            if (comidaItems.length === 0) return null
            // Calculate macros for this meal
            const mealMacros = comidaItems.reduce((acc, item) => {
              const a = item.alimento
              if (!a) return acc
              const ratio = a.unidad_medida === 'unidad' ? item.cantidad : item.cantidad / (a.porcion_base || 100)
              return {
                cal: acc.cal + a.calorias_por_unidad * ratio,
                prot: acc.prot + a.proteina_por_unidad * ratio,
                carbs: acc.carbs + a.carbs_por_unidad * ratio,
                grasas: acc.grasas + a.grasas_por_unidad * ratio,
              }
            }, { cal: 0, prot: 0, carbs: 0, grasas: 0 })

            const popupKey = `${diaActivo}-${key}`
            const isPopupOpen = macroPopup === popupKey

            return (
              <div key={key} className="bg-lucy-white rounded-card border border-lucy-border p-4">
                <button
                  onClick={() => setMacroPopup(isPopupOpen ? null : popupKey)}
                  className="text-xs text-lucy-muted mb-3 uppercase tracking-wider flex items-center gap-1.5"
                >
                  {label}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform ${isPopupOpen ? 'rotate-180' : ''}`}>
                    <path d="M2 4l3 3 3-3" stroke="#9896B0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Macro popup */}
                {isPopupOpen && (
                  <div className="mb-3 grid grid-cols-4 gap-1.5 animate-macroIn">
                    {[
                      { label: 'Cal', value: Math.round(mealMacros.cal), unit: 'kcal' },
                      { label: 'Prot', value: Math.round(mealMacros.prot), unit: 'g' },
                      { label: 'Carbs', value: Math.round(mealMacros.carbs), unit: 'g' },
                      { label: 'Grasas', value: Math.round(mealMacros.grasas), unit: 'g' },
                    ].map(m => (
                      <div key={m.label} className="border border-lucy-border rounded-btn p-2 text-center">
                        <p className="text-sm font-medium text-lucy-text leading-tight">{m.value}</p>
                        <p className="text-[9px] text-lucy-muted">{m.label}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  {comidaItems.map((item, idx) => (
                    <button key={idx} className="flex items-center gap-3 w-full text-left" onClick={() => setSelectedItem(item)}>
                      <FoodAvatar nombre={item.alimento?.nombre || '?'} foto_url={item.alimento?.foto_url} />
                      <div>
                        <p className="text-sm text-lucy-text">{item.alimento?.nombre}</p>
                        <p className="text-xs text-lucy-muted">
                          {item.alimento ? toImperial(item.cantidad, item.alimento) : `${item.cantidad} ${item.unidad}`}
                        </p>
                      </div>
                    </button>
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
      </div>

      {/* Food detail modal */}
      {selectedItem && selectedItem.alimento && (() => {
        const a = selectedItem.alimento
        const ratio = a.unidad_medida === 'unidad' ? selectedItem.cantidad : selectedItem.cantidad / (a.porcion_base || 100)
        const r1 = (n: number) => Math.round(n * ratio * 10) / 10
        return (
          <>
            <div className="fixed inset-0 bg-black/20 z-30" onClick={() => setSelectedItem(null)} />
            <div className="fixed inset-0 z-40 flex items-center justify-center px-6 pointer-events-none">
              <div className="bg-lucy-white rounded-card border border-lucy-border p-6 w-full max-w-xs pointer-events-auto animate-macroIn">
                <div className="flex flex-col items-center mb-4">
                  <div className="mb-2">
                    <FoodAvatar nombre={a.nombre} foto_url={a.foto_url} size="lg" />
                  </div>
                  <p className="text-sm font-medium text-lucy-text">{a.nombre}</p>
                  <p className="text-lg text-lucy-accent font-medium">{toImperial(selectedItem.cantidad, a)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { label: 'Calorías', value: r1(a.calorias_por_unidad), unit: 'kcal' },
                    { label: 'Proteína', value: r1(a.proteina_por_unidad), unit: 'g' },
                    { label: 'Carbs', value: r1(a.carbs_por_unidad), unit: 'g' },
                    { label: 'Grasas', value: r1(a.grasas_por_unidad), unit: 'g' },
                  ].map(m => (
                    <div key={m.label} className="border border-lucy-border rounded-btn p-3 text-center">
                      <p className="text-xl font-medium text-lucy-text leading-tight">{m.value}</p>
                      <p className="text-[10px] text-lucy-muted">{m.unit}</p>
                      <p className="text-[10px] text-lucy-muted">{m.label}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setWizardTarget(selectedItem)
                    setSelectedItem(null)
                  }}
                  className="w-full bg-lucy-accent text-white font-medium rounded-btn py-2.5 px-4 text-sm hover:opacity-90 transition-opacity mb-2"
                >
                  Cambiar alimento
                </button>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="w-full text-xs text-lucy-muted hover:text-lucy-accent transition-colors py-1"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </>
        )
      })()}

      </>)}

      {vista === 'semana' && (<>
      {/* Weekly view */}
      <div className="px-4 mb-6">
        <div className="max-w-lg mx-auto overflow-x-auto scrollbar-hide -mx-4 px-6">
          <div className="bg-lucy-white rounded-card border border-lucy-border" style={{ minWidth: 'max-content' }}>
            {/* Header row */}
            <div className="flex border-b border-lucy-border">
              <div style={{ width: '80px' }} className="shrink-0 px-2 py-2" />
              {weekDates.map((date, i) => (
                <div key={i} style={{ width: '130px' }} className="shrink-0 px-2 py-2 text-center border-l border-lucy-border">
                  <p className="text-[11px] text-lucy-muted uppercase tracking-wider">{DIAS[i].slice(0, 3)}</p>
                  <p className="text-[10px] text-lucy-soft">{formatShortDate(date)}</p>
                </div>
              ))}
            </div>
            {/* Meal rows */}
            {comidasSemana.map(({ key, label }) => (
              <div key={key} className="flex border-b border-lucy-border last:border-b-0">
                <div style={{ width: '80px' }} className="shrink-0 px-2 py-3 flex items-start">
                  <p className="text-[11px] text-lucy-muted uppercase tracking-wider">{label}</p>
                </div>
                {weekDates.map((_, i) => {
                  const dia = i + 1
                  const cellItems = items
                    .filter(it => it.dia === dia && it.comida === key)
                    .sort((a, b) => (ORDEN_CATEGORIA[a.alimento?.categoria_comida] || 6) - (ORDEN_CATEGORIA[b.alimento?.categoria_comida] || 6))
                  return (
                    <div key={i} style={{ width: '130px' }} className="shrink-0 px-2 py-2 border-l border-lucy-border space-y-1.5">
                      {cellItems.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <FoodAvatar nombre={item.alimento?.nombre || '?'} foto_url={item.alimento?.foto_url} size="xs" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-lucy-text leading-tight" style={{ whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'visible' }}>{item.alimento?.nombre}</p>
                            <p className="text-[9px] text-lucy-muted leading-tight">
                              {item.alimento ? toImperial(item.cantidad, item.alimento) : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="text-center text-[10px] text-lucy-soft mt-2">Desliza horizontalmente para ver toda la semana →</p>
      </div>

      {/* Floating PDF export button */}
      <div className="fixed bottom-44 right-4 z-20">
        <button
          onClick={exportarPdf}
          disabled={exportingPdf}
          aria-label="Exportar PDF"
          className="w-16 h-16 rounded-full bg-lucy-accent flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-60 shadow-lg"
        >
          {exportingPdf ? (
            <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2.5" strokeOpacity="0.3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 4v11M12 15l-4-4M12 15l4-4M5 19h14" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Hidden offscreen PDF render */}
      <div
        ref={pdfContainerRef}
        style={{
          position: 'fixed',
          left: '-10000px',
          top: 0,
          width: '1100px',
          backgroundColor: '#ffffff',
          padding: '32px 36px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#2D2B45',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lucy-logo.svg" alt="Lucy" style={{ height: '70px', display: 'inline-block' }} />
        </div>

        {/* Table */}
        <div style={{ border: '1px solid #E5E3F0', borderRadius: '8px', overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{ display: 'flex', backgroundColor: '#7B7FC4', color: '#ffffff' }}>
            <div style={{ width: '95px', flexShrink: 0, padding: '12px 8px' }} />
            {weekDates.map((date, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  padding: '12px 8px',
                  textAlign: 'center',
                  borderLeft: '1px solid rgba(255,255,255,0.25)',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{DIAS[i].slice(0, 3)}</div>
                <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '2px' }}>{formatShortDate(date)}</div>
              </div>
            ))}
          </div>
          {/* Meal rows */}
          {comidasSemana.map(({ key, label }, rowIdx) => (
            <div
              key={key}
              style={{
                display: 'flex',
                borderTop: rowIdx === 0 ? 'none' : '1px solid #E5E3F0',
                backgroundColor: rowIdx % 2 === 0 ? '#ffffff' : '#FAFAFE',
              }}
            >
              <div
                style={{
                  width: '95px',
                  flexShrink: 0,
                  padding: '14px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#7B7FC4',
                  display: 'flex',
                  alignItems: 'flex-start',
                }}
              >
                {label}
              </div>
              {weekDates.map((_, i) => {
                const dia = i + 1
                const cellItems = items
                  .filter(it => it.dia === dia && it.comida === key)
                  .sort((a, b) => (ORDEN_CATEGORIA[a.alimento?.categoria_comida] || 6) - (ORDEN_CATEGORIA[b.alimento?.categoria_comida] || 6))
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      padding: '10px 8px',
                      borderLeft: '1px solid #E5E3F0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    {cellItems.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FoodAvatar nombre={item.alimento?.nombre || '?'} foto_url={item.alimento?.foto_url} size="xs" />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '10px', color: '#2D2B45', lineHeight: 1.2, whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'visible' }}>
                            {item.alimento?.nombre}
                          </div>
                          <div style={{ fontSize: '9px', color: '#9896B0', lineHeight: 1.2 }}>
                            {item.alimento ? toImperial(item.cantidad, item.alimento) : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '11px',
            color: '#9896B0',
          }}
        >
          <span>Powered by</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/caribeno-fit-labs.png" alt="Caribeño Fit Labs" style={{ height: '24px' }} />
          <span style={{ color: '#2D2B45', fontWeight: 500 }}>Caribeño Fit Labs</span>
        </div>
      </div>
      </>)}

      {/* Food swap wizard */}
      {wizardTarget && user && (
        <FoodWizard
          rolPermitido={getSwapRoles(wizardTarget.comida, wizardTarget.alimento.rol_permitido)}
          userId={user.id}
          titulo={`Cambiar ${ROL_LABELS[getSwapRoles(wizardTarget.comida, wizardTarget.alimento.rol_permitido)[0]] || 'Alimento'} — ${DIAS[wizardTarget.dia - 1]}`}
          onSelect={handleSwapAlimento}
          onClose={() => setWizardTarget(null)}
        />
      )}

      <ChatPanel onDataChange={fetchCalendar} />

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-lucy-white border-t border-lucy-border pb-safe">
        <div className="max-w-lg mx-auto flex">
          <button
            className="flex-1 py-3 flex flex-col items-center gap-0.5"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="3" width="16" height="14" rx="2" stroke="#7B7FC4" strokeWidth="1.5" fill="none" />
              <line x1="2" y1="7" x2="18" y2="7" stroke="#7B7FC4" strokeWidth="1.5" />
              <line x1="7" y1="3" x2="7" y2="7" stroke="#7B7FC4" strokeWidth="1.5" />
              <line x1="13" y1="3" x2="13" y2="7" stroke="#7B7FC4" strokeWidth="1.5" />
            </svg>
            <span className="text-[10px] text-lucy-accent font-medium">Calendario</span>
          </button>
          <button
            onClick={() => router.push('/lista-compras')}
            className="flex-1 py-3 flex flex-col items-center gap-0.5"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M6 4h12l-1.5 9H7.5L6 4z" stroke="#9896B0" strokeWidth="1.5" fill="none" />
              <circle cx="8.5" cy="16" r="1.5" stroke="#9896B0" strokeWidth="1.5" fill="none" />
              <circle cx="15" cy="16" r="1.5" stroke="#9896B0" strokeWidth="1.5" fill="none" />
              <path d="M6 4L5 2H2" stroke="#9896B0" strokeWidth="1.5" fill="none" />
            </svg>
            <span className="text-[10px] text-lucy-muted">Compras</span>
          </button>
          <button
            onClick={() => router.push('/educacion')}
            className="flex-1 py-3 flex flex-col items-center gap-0.5"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 17h14M5 17V9l5-5 5 5v8" stroke="#9896B0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <rect x="8" y="12" width="4" height="5" rx="0.5" stroke="#9896B0" strokeWidth="1.5" fill="none" />
            </svg>
            <span className="text-[10px] text-lucy-muted">Educación</span>
          </button>
          <button
            onClick={() => router.push('/mi-perfil')}
            className="flex-1 py-3 flex flex-col items-center gap-0.5"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="7" r="3.5" stroke="#9896B0" strokeWidth="1.5" fill="none" />
              <path d="M3 17.5c0-3 3.13-5.5 7-5.5s7 2.5 7 5.5" stroke="#9896B0" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
            <span className="text-[10px] text-lucy-muted">Perfil</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
