'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'

type UnidadPeso = 'lbs' | 'kg'
type UnidadAltura = 'ft' | 'cm'

const NIVELES_ACTIVIDAD = [
  { value: 'sedentario', label: 'Sedentaria', description: 'Poco o nada de ejercicio', factor: 1.2 },
  { value: 'ligero', label: 'Ligeramente activa', description: 'Ejercicio 1-3 días/semana', factor: 1.375 },
  { value: 'moderado', label: 'Moderadamente activa', description: 'Ejercicio 3-5 días/semana', factor: 1.55 },
  { value: 'activo', label: 'Muy activa', description: 'Ejercicio 6-7 días/semana', factor: 1.725 },
] as const

const METAS = [
  { value: 'perder_peso', label: 'Bajar de peso' },
  { value: 'mantener_peso', label: 'Mantenerme' },
  { value: 'ganar_masa', label: 'Ganar masa muscular' },
] as const

function calcularMacros(
  pesoKg: number,
  alturaCm: number,
  edad: number,
  factorActividad: number,
  meta: string,
  genero: string = 'femenino'
) {
  const bmr = 10 * pesoKg + 6.25 * alturaCm - 5 * edad + (genero === 'masculino' ? 5 : -161)
  const tdee = bmr * factorActividad
  let calorias: number
  if (meta === 'perder_peso') calorias = Math.max(Math.round(tdee * 0.9), 1200)
  else if (meta === 'ganar_masa') calorias = Math.round(tdee * 1.2)
  else calorias = Math.round(tdee * 1.0)
  const proteina = Math.round((calorias * 0.30) / 4)
  const carbs = Math.round((calorias * 0.40) / 4)
  const grasas = Math.round((calorias * 0.30) / 9)
  return { calorias, proteina, carbs, grasas }
}

export default function OnboardingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [nombre, setNombre] = useState('')
  const [peso, setPeso] = useState('')
  const [unidadPeso, setUnidadPeso] = useState<UnidadPeso>('lbs')
  const [pies, setPies] = useState('')
  const [pulgadas, setPulgadas] = useState('')
  const [alturaCm, setAlturaCm] = useState('')
  const [unidadAltura, setUnidadAltura] = useState<UnidadAltura>('ft')
  const [edad, setEdad] = useState('')
  const [genero, setGenero] = useState('femenino')
  const [nivelActividad, setNivelActividad] = useState('')
  const [meta, setMeta] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
      return
    }
    if (!loading && user) {
      supabase.from('usuarios').select('aprobado').eq('id', user.id).single().then(({ data }) => {
        if (data && !data.aprobado) {
          router.push('/waitlist')
        }
      })
    }
    if (user?.user_metadata?.nombre) {
      setNombre(user.user_metadata.nombre)
    }
  }, [user, loading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!nombre.trim() || !peso || !edad || !nivelActividad || !meta) {
      setError('Por favor completa todos los campos')
      return
    }

    if (unidadAltura === 'ft' && !pies) {
      setError('Por favor ingresa tu altura')
      return
    }
    if (unidadAltura === 'cm' && !alturaCm) {
      setError('Por favor ingresa tu altura')
      return
    }

    const pesoNum = parseFloat(peso)
    const edadNum = parseInt(edad)

    const pesoKg = unidadPeso === 'lbs' ? Math.round(pesoNum * 0.453592 * 10) / 10 : pesoNum
    const pesoLbs = unidadPeso === 'lbs' ? pesoNum : Math.round(pesoNum * 2.20462 * 10) / 10

    let altCm: number
    let altPies: number
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
    const macros = calcularMacros(pesoKg, altCm, edadNum, nivel.factor, meta, genero)

    setSaving(true)

    const { error: dbError } = await supabase
      .from('usuarios')
      .update({
        nombre: nombre.trim(),
        genero,
        peso_lbs: pesoLbs,
        peso_kg: pesoKg,
        altura_pies: altPies,
        altura_cm: altCm,
        edad: edadNum,
        nivel_actividad: nivelActividad,
        meta,
        calorias_objetivo: macros.calorias,
        proteina_objetivo: macros.proteina,
        carbs_objetivo: macros.carbs,
        grasas_objetivo: macros.grasas,
        onboarding_completado: true,
        aprobado: true,
      })
      .eq('id', user!.id)

    if (dbError) {
      setError('Error al guardar: ' + dbError.message)
      setSaving(false)
      return
    }

    // Send welcome email (non-blocking)
    if (user?.email) {
      fetch('/api/send-welcome-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, nombre: nombre.trim() }),
      }).catch(err => console.error('Welcome email failed:', err))
    }

    router.push('/mis-macros')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lucy-muted text-sm">Cargando...</p>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-lg mx-auto">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-logo text-2xl text-lucy-text">Lucy</h1>
          <p className="text-lucy-soft text-[10px] tracking-[0.25em] uppercase">calendario metabólico</p>
        </div>

        <div className="bg-lucy-white rounded-card border border-lucy-border p-8">
          <div className="mb-8">
            <h2 className="text-lg text-lucy-text mb-1">Cuéntame sobre ti</h2>
            <p className="text-lucy-muted text-xs">Voy a calcular tus macros personalizados</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Nombre */}
            <div>
              <label className="block text-xs text-lucy-muted mb-1.5">Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Tu nombre"
                className="w-full border border-lucy-border rounded-btn py-2.5 px-4 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors"
              />
            </div>

            {/* Peso */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-lucy-muted">Peso</label>
                <button
                  type="button"
                  onClick={() => {
                    if (peso) {
                      const val = parseFloat(peso)
                      setPeso(
                        unidadPeso === 'lbs'
                          ? (val * 0.453592).toFixed(1)
                          : (val * 2.20462).toFixed(1)
                      )
                    }
                    setUnidadPeso(unidadPeso === 'lbs' ? 'kg' : 'lbs')
                  }}
                  className="text-[11px] text-lucy-accent hover:opacity-80 font-medium"
                >
                  Cambiar a {unidadPeso === 'lbs' ? 'kg' : 'libras'}
                </button>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  value={peso}
                  onChange={e => setPeso(e.target.value)}
                  placeholder={unidadPeso === 'lbs' ? '150' : '68'}
                  className="w-full border border-lucy-border rounded-btn py-2.5 px-4 pr-14 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lucy-muted text-xs">
                  {unidadPeso}
                </span>
              </div>
            </div>

            {/* Altura */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-lucy-muted">Altura</label>
                <button
                  type="button"
                  onClick={() => {
                    if (unidadAltura === 'ft' && pies) {
                      const ft = parseInt(pies) || 0
                      const inch = parseInt(pulgadas) || 0
                      setAlturaCm(((ft * 12 + inch) * 2.54).toFixed(0))
                    } else if (unidadAltura === 'cm' && alturaCm) {
                      const totalInches = parseFloat(alturaCm) / 2.54
                      setPies(Math.floor(totalInches / 12).toString())
                      setPulgadas(Math.round(totalInches % 12).toString())
                    }
                    setUnidadAltura(unidadAltura === 'ft' ? 'cm' : 'ft')
                  }}
                  className="text-[11px] text-lucy-accent hover:opacity-80 font-medium"
                >
                  Cambiar a {unidadAltura === 'ft' ? 'cm' : 'pies'}
                </button>
              </div>
              {unidadAltura === 'ft' ? (
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      value={pies}
                      onChange={e => setPies(e.target.value)}
                      placeholder="5"
                      min="3"
                      max="7"
                      className="w-full border border-lucy-border rounded-btn py-2.5 px-4 pr-12 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lucy-muted text-xs">pies</span>
                  </div>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      value={pulgadas}
                      onChange={e => setPulgadas(e.target.value)}
                      placeholder="4"
                      min="0"
                      max="11"
                      className="w-full border border-lucy-border rounded-btn py-2.5 px-4 pr-14 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lucy-muted text-xs">pulg</span>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="number"
                    value={alturaCm}
                    onChange={e => setAlturaCm(e.target.value)}
                    placeholder="163"
                    className="w-full border border-lucy-border rounded-btn py-2.5 px-4 pr-12 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lucy-muted text-xs">cm</span>
                </div>
              )}
            </div>

            {/* Edad */}
            <div>
              <label className="block text-xs text-lucy-muted mb-1.5">Edad</label>
              <div className="relative">
                <input
                  type="number"
                  value={edad}
                  onChange={e => setEdad(e.target.value)}
                  placeholder="30"
                  min="15"
                  max="80"
                  className="w-full border border-lucy-border rounded-btn py-2.5 px-4 pr-14 text-sm text-lucy-text bg-lucy-white placeholder:text-lucy-muted/50 focus:outline-none focus:border-lucy-accent transition-colors"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lucy-muted text-xs">años</span>
              </div>
            </div>

            {/* Género */}
            <div>
              <label className="block text-xs text-lucy-muted mb-2">Género</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'femenino', label: 'Mujer' },
                  { value: 'masculino', label: 'Hombre' },
                ].map(g => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setGenero(g.value)}
                    className={`px-4 py-3 rounded-btn border transition-colors text-sm font-medium ${
                      genero === g.value
                        ? 'border-lucy-accent bg-lucy-accent/5 text-lucy-text'
                        : 'border-lucy-border text-lucy-text hover:border-lucy-soft'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Nivel de actividad */}
            <div>
              <label className="block text-xs text-lucy-muted mb-2">Nivel de actividad</label>
              <div className="space-y-2">
                {NIVELES_ACTIVIDAD.map(nivel => (
                  <button
                    key={nivel.value}
                    type="button"
                    onClick={() => setNivelActividad(nivel.value)}
                    className={`w-full text-left px-4 py-3 rounded-btn border transition-colors ${
                      nivelActividad === nivel.value
                        ? 'border-lucy-accent bg-lucy-accent/5 text-lucy-text'
                        : 'border-lucy-border text-lucy-text hover:border-lucy-soft'
                    }`}
                  >
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
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMeta(m.value)}
                    className={`w-full text-left px-4 py-3 rounded-btn border transition-colors ${
                      meta === m.value
                        ? 'border-lucy-accent bg-lucy-accent/5 text-lucy-text'
                        : 'border-lucy-border text-lucy-text hover:border-lucy-soft'
                    }`}
                  >
                    <span className="text-sm font-medium">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-xs bg-red-50 rounded-btn p-3">{error}</p>
            )}

            <p className="text-[11px] text-lucy-muted text-center leading-relaxed mb-3">
              &#9432; Lucy es una herramienta de orientación nutricional general. Si tienes alguna condición de salud, estás embarazada, o tomas medicamentos, consulta con tu médico o nutricionista antes de seguir este plan.
            </p>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-lucy-accent text-white font-medium rounded-btn py-2.5 px-4 text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Calculando...' : 'Calcular mis macros'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
