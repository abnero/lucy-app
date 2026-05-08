'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { APP_VERSION } from '@/lib/version'
import ChatPanel from '@/components/ChatPanel'
import PreguntasActividad from '@/components/PreguntasActividad'
import { calcularMacros, NivelActividad, Meta, Genero, DESCRIPCIONES_NIVEL } from '@/lib/calculo-macros'
import { useTrackEvent } from '@/hooks/useTrackEvent'

type UnidadPeso = 'lbs' | 'kg'
type UnidadAltura = 'ft' | 'cm'

const METAS = [
  { value: 'perder_peso' as Meta, label: 'Bajar de peso' },
  { value: 'mantener_peso' as Meta, label: 'Mantenerme' },
  { value: 'ganar_masa' as Meta, label: 'Ganar masa muscular' },
] as const

interface UsuarioData {
  nombre: string
  genero: string | null
  avatar_url: string | null
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
  const { user, session, loading, signOut } = useAuth()
  const router = useRouter()
  const trackEvent = useTrackEvent()
  useEffect(() => { trackEvent('page_view_perfil') }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
  const [genero, setGenero] = useState<Genero>('femenino')
  const [nivel, setNivel] = useState<NivelActividad | null>(null)
  const [meta, setMeta] = useState<Meta | ''>('')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [showRegenConfirm, setShowRegenConfirm] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const originalValues = useRef<{ nombre: string; peso: string; pies: string; pulgadas: string; edad: string; genero: Genero; nivel: NivelActividad | null; meta: string } | null>(null)

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    const path = `${user.id}.jpg`

    // Try upload — if bucket doesn't exist, error will show
    const { error: uploadErr } = await supabase.storage
      .from('avatares')
      .upload(path, file, { contentType: file.type, upsert: true })

    if (uploadErr) {
      console.error('Avatar upload error:', uploadErr.message)
      setError('Error subiendo foto: ' + uploadErr.message)
      return
    }

    const { data: urlData } = supabase.storage.from('avatares').getPublicUrl(path)
    const newUrl = `${urlData.publicUrl}?t=${Date.now()}`

    const { error: dbErr } = await supabase.from('usuarios').update({ avatar_url: newUrl }).eq('id', user.id)
    if (dbErr) {
      console.error('Avatar DB update error:', dbErr.message)
      setError('Error guardando foto: ' + dbErr.message)
      return
    }

    setAvatarUrl(newUrl)
    setUserData(prev => prev ? { ...prev, avatar_url: newUrl } : prev)
    setSuccessMsg('Foto actualizada')
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return }
    if (!loading && user) {
      supabase
        .from('usuarios')
        .select('nombre, genero, avatar_url, peso_lbs, peso_kg, altura_pies, altura_cm, edad, nivel_actividad, meta, calorias_objetivo, proteina_objetivo, carbs_objetivo, grasas_objetivo, onboarding_completado')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (!data || !data.onboarding_completado) {
            router.push('/onboarding')
            return
          }
          if (data) {
            const u = data as UsuarioData
            setUserData(u)
            setNombre(u.nombre || '')
            setGenero((u.genero as Genero) || 'femenino')
            setAvatarUrl(u.avatar_url || user?.user_metadata?.avatar_url || null)
            setPeso(u.peso_lbs ? u.peso_lbs.toString() : '')
            setEdad(u.edad ? u.edad.toString() : '')
            setNivel((u.nivel_actividad as NivelActividad) || null)
            setMeta((u.meta as Meta) || '')
            let origPies = ''
            let origPulgadas = ''
            if (u.altura_pies) {
              const totalInches = u.altura_pies * 12
              origPies = Math.floor(totalInches / 12).toString()
              origPulgadas = Math.round(totalInches % 12).toString()
              setPies(origPies)
              setPulgadas(origPulgadas)
            }
            originalValues.current = {
              nombre: u.nombre || '',
              peso: u.peso_lbs ? u.peso_lbs.toString() : '',
              pies: origPies,
              pulgadas: origPulgadas,
              edad: u.edad ? u.edad.toString() : '',
              genero: (u.genero as Genero) || 'femenino',
              nivel: (u.nivel_actividad as NivelActividad) || null,
              meta: u.meta || '',
            }
          }
          setLoadingData(false)
        })
    }
  }, [user, loading, router])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (!hasChanges) {
      if (regenPaused) {
        setError('Lucy está en mantenimiento. La regeneración de planes estará disponible pronto.')
        return
      }
      setShowRegenConfirm(true)
      return
    }

    if (!nombre.trim() || !peso || !edad || !nivel || !meta) {
      setError('Por favor completa todos los campos')
      return
    }
    if (unidadAltura === 'ft' && !pies) { setError('Por favor ingresa tu altura'); return }
    if (unidadAltura === 'cm' && !alturaCm) { setError('Por favor ingresa tu altura'); return }

    const pesoNum = parseFloat(peso)
    const edadNum = parseInt(edad)
    const pesoKg = unidadPeso === 'lbs' ? Math.round(pesoNum * 0.453592 * 10) / 10 : pesoNum
    const pesoLbs = unidadPeso === 'lbs' ? pesoNum : Math.round(pesoNum * 2.20462 * 10) / 10

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

    // Detect if metric data changed (round to avoid float precision issues)
    const round1 = (n: number) => Math.round(n * 10) / 10
    const metricChanged =
      genero !== (userData?.genero || 'femenino') ||
      round1(pesoKg) !== round1(userData?.peso_kg || 0) ||
      round1(altCm) !== round1(userData?.altura_cm || 0) ||
      edadNum !== (userData?.edad || 0) ||
      nivel !== (userData?.nivel_actividad || '') ||
      meta !== (userData?.meta || '')

    setSaving(true)

    if (metricChanged) {
      // Recalculate macros
      const macros = calcularMacros(pesoKg, altCm, edadNum, nivel!, meta as Meta, genero)

      const { error: dbError } = await supabase
        .from('usuarios')
        .update({
          nombre: nombre.trim(),
          genero,
          peso_lbs: pesoLbs, peso_kg: pesoKg,
          altura_pies: altPies, altura_cm: altCm,
          edad: edadNum, nivel_actividad: nivel, meta,
          calorias_objetivo: macros.calorias,
          proteina_objetivo: macros.proteina,
          carbs_objetivo: macros.carbs,
          grasas_objetivo: macros.grasas,
        })
        .eq('id', user!.id)

      if (dbError) { setError('Error al guardar: ' + dbError.message); setSaving(false); return }

      if (regenPaused) {
        // Save macros but don't regenerate plan
        setUserData(prev => prev ? { ...prev, calorias_objetivo: macros.calorias, proteina_objetivo: macros.proteina, carbs_objetivo: macros.carbs, grasas_objetivo: macros.grasas } : prev)
        setSuccessMsg('Tus macros se guardaron. Tu plan se actualizará cuando Lucy termine su mantenimiento.')
        setSaving(false)
        return
      }

      // generar-plan handles clearing calendario (filtered by origen='generado') and lista_compras
      router.push('/generando?modo=actualizacion')
    } else {
      // Only name changed — simple update, stay on page
      const { error: dbError } = await supabase
        .from('usuarios')
        .update({ nombre: nombre.trim() })
        .eq('id', user!.id)

      if (dbError) { setError('Error al guardar: ' + dbError.message); setSaving(false); return }

      setUserData(prev => prev ? { ...prev, nombre: nombre.trim() } : prev)
      setSuccessMsg('Tu perfil está actualizado.')
      setSaving(false)
      setTimeout(() => setSuccessMsg(''), 3000)
    }
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

  const hasChanges = originalValues.current ? (
    nombre !== originalValues.current.nombre ||
    peso !== originalValues.current.peso ||
    pies !== originalValues.current.pies ||
    pulgadas !== originalValues.current.pulgadas ||
    edad !== originalValues.current.edad ||
    genero !== originalValues.current.genero ||
    nivel !== originalValues.current.nivel ||
    meta !== originalValues.current.meta
  ) : true // default to true while loading

  const handleRegenerate = async () => {
    if (!user || !session) return
    setShowRegenConfirm(false)
    setRegenerating(true)
    try {
      const res = await fetch('/api/generar-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, accessToken: session.access_token }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        setRegenerating(false)
        return
      }
      router.push('/mi-calendario')
    } catch {
      setError('Error regenerando el plan. Intenta de nuevo.')
      setRegenerating(false)
    }
  }

  const regenPaused = process.env.NEXT_PUBLIC_LUCY_REGEN_PAUSED === 'true'

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
            <div className="relative mb-2">
              {avatarUrl ? (
                <img src={avatarUrl} alt={userData.nombre} className="w-16 h-16 rounded-full object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-lucy-accent flex items-center justify-center">
                  <span className="font-logo text-white text-2xl">{inicial}</span>
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-lucy-white border border-lucy-border flex items-center justify-center hover:bg-lucy-bg transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M9.5 1.5l1 1-7 7H2.5v-1l7-7z" stroke="#9896B0" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
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

            {/* Género */}
            <div>
              <label className="block text-xs text-lucy-muted mb-2">Género</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'femenino' as Genero, label: 'Mujer' },
                  { value: 'masculino' as Genero, label: 'Hombre' },
                ]).map(g => (
                  <button key={g.value} type="button" onClick={() => setGenero(g.value)}
                    className={`px-4 py-3 rounded-btn border transition-colors text-sm font-medium ${
                      genero === g.value ? 'border-lucy-accent bg-lucy-accent/5 text-lucy-text' : 'border-lucy-border text-lucy-text hover:border-lucy-soft'
                    }`}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Nivel de actividad */}
            <div>
              <label className="block text-xs text-lucy-muted mb-2">Nivel de actividad</label>
              {nivel && (
                <div className="bg-lucy-bg rounded-card border border-lucy-border p-3 mb-3">
                  <p className="text-xs text-lucy-muted">Nivel actual:</p>
                  <p className="text-sm text-lucy-text font-medium">{DESCRIPCIONES_NIVEL[nivel]}</p>
                </div>
              )}
              <PreguntasActividad
                onChange={(_respuestas, nivelCalculado) => setNivel(nivelCalculado)}
              />
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
            {successMsg && <p className="text-lucy-accent text-xs bg-lucy-accent/5 border border-lucy-accent/20 rounded-btn p-3">{successMsg}</p>}

            <button type="submit" disabled={saving || regenerating || (regenPaused && !hasChanges)}
              className="w-full bg-lucy-accent text-white font-medium rounded-btn py-2.5 px-4 text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? 'Guardando...' : regenerating ? 'Regenerando...' : hasChanges ? 'Guardar cambios' : regenPaused ? 'Mantenimiento — vuelve pronto' : 'Regenerar mi plan'}
            </button>
          </form>

          {/* Change foods */}
          <button
            onClick={() => router.push('/seleccion-alimentos')}
            className="w-full mt-3 border border-lucy-accent text-lucy-accent font-medium rounded-btn py-2.5 px-4 text-sm hover:bg-lucy-accent/5 transition-colors"
          >
            Cambiar mis alimentos
          </button>

          {/* Sign out */}
          <button onClick={handleSignOut}
            className="w-full mt-3 mb-8 border border-red-200 text-red-400 font-medium rounded-btn py-2.5 px-4 text-sm hover:bg-red-50 transition-colors">
            Cerrar sesión
          </button>

          <div className="text-center mt-8 mb-8">
            <p className="text-[11px] text-lucy-muted">Lucy v{APP_VERSION}</p>
            <p className="text-[10px] text-lucy-muted mt-0.5">&copy; 2026 Caribeño Fit Labs</p>
          </div>
        </div>
      </div>

      {/* Regen confirmation modal */}
      {showRegenConfirm && (
        <>
          <div className="fixed inset-0 bg-black/20 z-30" onClick={() => setShowRegenConfirm(false)} />
          <div className="fixed inset-0 z-40 flex items-center justify-center px-6 pointer-events-none">
            <div className="bg-lucy-white rounded-card border border-lucy-border p-6 w-full max-w-xs pointer-events-auto animate-macroIn">
              <div className="text-center mb-4">
                <p className="text-2xl mb-2">🔄</p>
                <p className="text-sm font-medium text-lucy-text">¿Regenerar tu plan?</p>
              </div>
              <p className="text-xs text-lucy-muted text-center leading-relaxed mb-5">
                Esto actualizará tu calendario con las últimas mejoras de Lucy. Tus snacks y cambios personalizados se mantendrán si son posibles.
              </p>
              <button
                onClick={handleRegenerate}
                className="w-full bg-lucy-accent text-white font-medium rounded-btn py-2.5 px-4 text-sm hover:opacity-90 transition-opacity mb-2"
              >
                Sí, regenerar
              </button>
              <button
                onClick={() => setShowRegenConfirm(false)}
                className="w-full text-xs text-lucy-muted hover:text-lucy-accent transition-colors py-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}

      {/* Chat */}
      <ChatPanel />

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-lucy-white border-t border-lucy-border pb-safe">
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
