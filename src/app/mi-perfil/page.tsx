'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'
import ChatPanel from '@/components/ChatPanel'

type UnidadPeso = 'lbs' | 'kg'
type UnidadAltura = 'ft' | 'cm'

const NIVELES_ACTIVIDAD = [
  { value: 'sedentario', label: 'Sedentaria', description: 'Poco o nada de ejercicio', factor: 1.2 },
  { value: 'ligero', label: 'Ligeramente activa', description: 'Ejercicio 1-3 días/semana', factor: 1.375 },
  { value: 'moderado', label: 'Moderadamente activa', description: 'Ejercicio 3-5 días/semana', factor: 1.55 },
  { value: 'activo', label: 'Muy activa', description: 'Ejercicio 6-7 días/semana', factor: 1.725 },
] as const

const METAS = [
  { value: 'perder_peso', label: 'Bajar de peso', calAdjust: -500 },
  { value: 'mantener_peso', label: 'Mantenerme', calAdjust: 0 },
  { value: 'ganar_masa', label: 'Ganar masa muscular', calAdjust: 300 },
] as const

function calcularMacros(pesoKg: number, alturaCm: number, edad: number, factorActividad: number, ajusteCalorias: number) {
  const bmr = 10 * pesoKg + 6.25 * alturaCm - 5 * edad - 161
  const tdee = bmr * factorActividad
  const calorias = Math.round(tdee + ajusteCalorias)
  const proteina = Math.round((calorias * 0.30) / 4)
  const carbs = Math.round((calorias * 0.40) / 4)
  const grasas = Math.round((calorias * 0.30) / 9)
  return { calorias, proteina, carbs, grasas }
}

interface UsuarioData {
  nombre: string
  peso_lbs: number | null
  peso_kg: number | null
  altura_pies: number | null
  altura_cm: number | null
  edad: number | null
  nivel_actividad: string | null
  meta: string | null
  calorias_objetivo: number | null
  proteina_objetivo: number | null
  carbs_objetivo: number | null
  grasas_objetivo: number | null
}

export default function MiPerfilPage() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()

  const [userData, setUserData] = useState<UsuarioData | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [nombre, setNombre] = useState('')
  const [peso, setPeso] = useState('')
  const [unidadPeso, setUnidadPeso] = useState<UnidadPeso>('lbs')
  const [pies, setPies] = useState('')
  const [pulgadas, setPulgadas] = useState('')
  const [alturaCm, setAlturaCm] = useState('')
  const [unidadAltura, setUnidadAltura] = useState<UnidadAltura>('ft')
  const [edad, setEdad] = useState('')
  const [nivelActividad, setNivelActividad] = useState('')
  const [meta, setMeta] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return }
    if (!loading && user) {
      supabase
        .from('usuarios')
        .select('nombre, peso_lbs, peso_kg, altura_pies, altura_cm, edad, nivel_actividad, meta, calorias_objetivo, proteina_objetivo, carbs_objetivo, grasas_objetivo')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            const u = data as UsuarioData
            setUserData(u)
            setNombre(u.nombre || '')
            setPeso(u.peso_lbs ? u.peso_lbs.toString() : '')
            setEdad(u.edad ? u.edad.toString() : '')
            setNivelActividad(u.nivel_actividad || '')
            setMeta(u.meta || '')
            if (u.altura_pies) {
              const totalInches = u.altura_pies * 12
              setPies(Math.floor(totalInches / 12).toString())
              setPulgadas(Math.round(totalInches % 12).toString())
            }
          }
          setLoadingData(false)
        })
    }
  }, [user, loading, router])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!nombre.trim() || !peso || !edad || !nivelActividad || !meta) {
      setError('Por favor completa todos los campos')
      return
    }
    if (unidadAltura === 'ft' && !pies) { setError('Por favor ingresa tu altura'); return }
    if (unidadAltura === 'cm' && !alturaCm) { setError('Por favor ingresa tu altura'); return }

    const pesoNum = parseFloat(peso)
    const edadNum = parseInt(edad)
    const pesoKg = unidadPeso === 'lbs' ? pesoNum * 0.453592 : pesoNum
    const pesoLbs = unidadPeso === 'lbs' ? pesoNum : pesoNum * 2.20462

    let altCm: number, altPies: number
    if (unidadAltura === 'ft') {
      const ft = parseInt(pies) || 0
      const inch = parseInt(pulgadas) || 0
      altCm = (ft * 12 + inch) * 2.54
      altPies = ft + inch / 12
    } else {
      altCm = parseFloat(alturaCm)
      altPies = altCm / 30.48
    }

    const nivel = NIVELES_ACTIVIDAD.find(n => n.value === nivelActividad)!
    const metaObj = METAS.find(m => m.value === meta)!
    const macros = calcularMacros(pesoKg, altCm, edadNum, nivel.factor, metaObj.calAdjust)

    setSaving(true)

    const { error: dbError } = await supabase
      .from('usuarios')
      .update({
        nombre: nombre.trim(),
        peso_lbs: pesoLbs, peso_kg: pesoKg,
        altura_pies: altPies, altura_cm: altCm,
        edad: edadNum, nivel_actividad: nivelActividad, meta,
        calorias_objetivo: macros.calorias,
        proteina_objetivo: macros.proteina,
        carbs_objetivo: macros.carbs,
        grasas_objetivo: macros.grasas,
      })
      .eq('id', user!.id)

    if (dbError) { setError('Error al guardar: ' + dbError.message); setSaving(false); return }

    // Clear calendar and shopping list so user re-generates
    await Promise.all([
      supabase.from('calendario').delete().eq('user_id', user!.id).select(),
      supabase.from('lista_compras').delete().eq('user_id', user!.id).select(),
      supabase.from('preferencias_usuario').delete().eq('user_id', user!.id).select(),
    ])

    router.push('/seleccion-alimentos')
  }

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lucy-muted text-sm">Cargando...</p>
      </div>
    )
  }

  if (!user || !userData) return null

  const inicial = (userData.nombre || 'U').charAt(0).toUpperCase()

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-logo text-xl text-lucy-text">Lucy</h1>
            <p className="text-lucy-soft text-[9px] tracking-[0.25em] uppercase">calendario metabólico</p>
          </div>
          <p className="text-sm text-lucy-text">Mi Perfil</p>
        </div>
      </div>

      <div className="px-4">
        <div className="max-w-lg mx-auto">
          {/* Avatar + name */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 rounded-full bg-lucy-accent flex items-center justify-center mb-2">
              <span className="font-logo text-white text-2xl">{inicial}</span>
            </div>
            <p className="text-sm text-lucy-text font-medium">{userData.nombre}</p>
            <p className="text-xs text-lucy-muted">{user.email}</p>
          </div>

          {/* Current macros */}
          <div className="mb-6">
            <p className="text-xs text-lucy-muted uppercase tracking-wider mb-2">Mis Macros</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Cal', value: userData.calorias_objetivo, unit: 'kcal' },
                { label: 'Prot', value: userData.proteina_objetivo, unit: 'g' },
                { label: 'Carbs', value: userData.carbs_objetivo, unit: 'g' },
                { label: 'Grasas', value: userData.grasas_objetivo, unit: 'g' },
              ].map(({ label, value, unit }) => (
                <div key={label} className="bg-lucy-white rounded-card border border-lucy-border p-3 text-center">
                  <p className="text-[10px] text-lucy-muted">{label}</p>
                  <p className="text-lg font-medium text-lucy-text leading-tight">{value ?? '—'}</p>
                  <p className="text-[10px] text-lucy-muted">{unit}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Editable form */}
          <form onSubmit={handleSave} className="space-y-5">
            <p className="text-xs text-lucy-muted uppercase tracking-wider">Mis Datos</p>

            {/* Nombre */}
            <div>
              <label className="block text-xs text-lucy-muted mb-1.5">Nombre</label>
              <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} className="w-full border border-lucy-border rounded-btn py-2.5 px-4 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors" />
            </div>

            {/* Peso */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-lucy-muted">Peso</label>
                <button type="button" onClick={() => {
                  if (peso) { const val = parseFloat(peso); setPeso(unidadPeso === 'lbs' ? (val * 0.453592).toFixed(1) : (val * 2.20462).toFixed(1)) }
                  setUnidadPeso(unidadPeso === 'lbs' ? 'kg' : 'lbs')
                }} className="text-[11px] text-lucy-accent hover:opacity-80 font-medium">
                  Cambiar a {unidadPeso === 'lbs' ? 'kg' : 'libras'}
                </button>
              </div>
              <div className="relative">
                <input type="number" step="0.1" value={peso} onChange={e => setPeso(e.target.value)} placeholder={unidadPeso === 'lbs' ? '150' : '68'} className="w-full border border-lucy-border rounded-btn py-2.5 px-4 pr-14 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lucy-muted text-xs">{unidadPeso}</span>
              </div>
            </div>

            {/* Altura */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-lucy-muted">Altura</label>
                <button type="button" onClick={() => {
                  if (unidadAltura === 'ft' && pies) {
                    const ft = parseInt(pies) || 0; const inch = parseInt(pulgadas) || 0
                    setAlturaCm(((ft * 12 + inch) * 2.54).toFixed(0))
                  } else if (unidadAltura === 'cm' && alturaCm) {
                    const totalInches = parseFloat(alturaCm) / 2.54
                    setPies(Math.floor(totalInches / 12).toString())
                    setPulgadas(Math.round(totalInches % 12).toString())
                  }
                  setUnidadAltura(unidadAltura === 'ft' ? 'cm' : 'ft')
                }} className="text-[11px] text-lucy-accent hover:opacity-80 font-medium">
                  Cambiar a {unidadAltura === 'ft' ? 'cm' : 'pies'}
                </button>
              </div>
              {unidadAltura === 'ft' ? (
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <input type="number" value={pies} onChange={e => setPies(e.target.value)} placeholder="5" min="3" max="7" className="w-full border border-lucy-border rounded-btn py-2.5 px-4 pr-12 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lucy-muted text-xs">pies</span>
                  </div>
                  <div className="relative flex-1">
                    <input type="number" value={pulgadas} onChange={e => setPulgadas(e.target.value)} placeholder="4" min="0" max="11" className="w-full border border-lucy-border rounded-btn py-2.5 px-4 pr-14 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lucy-muted text-xs">pulg</span>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <input type="number" value={alturaCm} onChange={e => setAlturaCm(e.target.value)} placeholder="163" className="w-full border border-lucy-border rounded-btn py-2.5 px-4 pr-12 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lucy-muted text-xs">cm</span>
                </div>
              )}
            </div>

            {/* Edad */}
            <div>
              <label className="block text-xs text-lucy-muted mb-1.5">Edad</label>
              <div className="relative">
                <input type="number" value={edad} onChange={e => setEdad(e.target.value)} placeholder="30" min="15" max="80" className="w-full border border-lucy-border rounded-btn py-2.5 px-4 pr-14 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lucy-muted text-xs">años</span>
              </div>
            </div>

            {/* Nivel de actividad */}
            <div>
              <label className="block text-xs text-lucy-muted mb-2">Nivel de actividad</label>
              <div className="space-y-2">
                {NIVELES_ACTIVIDAD.map(nivel => (
                  <button key={nivel.value} type="button" onClick={() => setNivelActividad(nivel.value)}
                    className={`w-full text-left px-4 py-3 rounded-btn border transition-colors ${
                      nivelActividad === nivel.value ? 'border-lucy-accent bg-lucy-accent/5 text-lucy-text' : 'border-lucy-border text-lucy-text hover:border-lucy-soft'
                    }`}>
                    <span className="text-sm font-medium">{nivel.label}</span>
                    <span className="text-xs text-lucy-muted ml-2">{nivel.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Meta */}
            <div>
              <label className="block text-xs text-lucy-muted mb-2">Mi meta es</label>
              <div className="space-y-2">
                {METAS.map(m => (
                  <button key={m.value} type="button" onClick={() => setMeta(m.value)}
                    className={`w-full text-left px-4 py-3 rounded-btn border transition-colors ${
                      meta === m.value ? 'border-lucy-accent bg-lucy-accent/5 text-lucy-text' : 'border-lucy-border text-lucy-text hover:border-lucy-soft'
                    }`}>
                    <span className="text-sm font-medium">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-red-500 text-xs bg-red-50 rounded-btn p-3">{error}</p>}

            <button type="submit" disabled={saving}
              className="w-full bg-lucy-accent text-white font-medium rounded-btn py-2.5 px-4 text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </form>

          {/* Sign out */}
          <button onClick={handleSignOut}
            className="w-full mt-4 mb-8 border border-red-200 text-red-400 font-medium rounded-btn py-2.5 px-4 text-sm hover:bg-red-50 transition-colors">
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Chat */}
      <ChatPanel />

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-lucy-white border-t border-lucy-border">
        <div className="max-w-lg mx-auto flex">
          <button onClick={() => router.push('/mi-calendario')} className="flex-1 py-3 flex flex-col items-center gap-0.5">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="3" width="16" height="14" rx="2" stroke="#9896B0" strokeWidth="1.5" fill="none" />
              <line x1="2" y1="7" x2="18" y2="7" stroke="#9896B0" strokeWidth="1.5" />
              <line x1="7" y1="3" x2="7" y2="7" stroke="#9896B0" strokeWidth="1.5" />
              <line x1="13" y1="3" x2="13" y2="7" stroke="#9896B0" strokeWidth="1.5" />
            </svg>
            <span className="text-[10px] text-lucy-muted">Calendario</span>
          </button>
          <button onClick={() => router.push('/lista-compras')} className="flex-1 py-3 flex flex-col items-center gap-0.5">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M6 4h12l-1.5 9H7.5L6 4z" stroke="#9896B0" strokeWidth="1.5" fill="none" />
              <circle cx="8.5" cy="16" r="1.5" stroke="#9896B0" strokeWidth="1.5" fill="none" />
              <circle cx="15" cy="16" r="1.5" stroke="#9896B0" strokeWidth="1.5" fill="none" />
              <path d="M6 4L5 2H2" stroke="#9896B0" strokeWidth="1.5" fill="none" />
            </svg>
            <span className="text-[10px] text-lucy-muted">Compras</span>
          </button>
          <button className="flex-1 py-3 flex flex-col items-center gap-0.5">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="7" r="3.5" stroke="#7B7FC4" strokeWidth="1.5" fill="none" />
              <path d="M3 17.5c0-3 3.13-5.5 7-5.5s7 2.5 7 5.5" stroke="#7B7FC4" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
            <span className="text-[10px] text-lucy-accent font-medium">Perfil</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
