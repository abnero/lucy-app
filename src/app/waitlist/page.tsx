'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Editable testimonials (Abner: reemplaza con fotos y comentarios reales) ───
const TESTIMONIOS = [
  {
    nombre: 'Arlene',
    texto: 'Nunca pensé que cambiar mis comidas fuera tan fácil. Le digo a Lucy lo que quiero y ella calcula todo.',
  },
  {
    nombre: 'Zuleima',
    texto: 'Por fin puedo ver mi plan de toda la semana e imprimirlo. Lo tengo en la nevera todos los días.',
  },
  {
    nombre: 'Airdalery',
    texto: 'Me explica exactamente cuántas calorías quemo y por qué mi plan es así. Eso me da confianza.',
  },
]

const PROBLEMAS = [
  { emoji: '🤯', texto: 'Los planes genéricos no funcionan para tu cuerpo' },
  { emoji: '⏰', texto: 'Tu coach no está disponible a las 9pm cuando tienes hambre' },
  { emoji: '😩', texto: 'Contar calorías es agotador y no es sostenible' },
]

const BENEFICIOS = [
  {
    emoji: '📅',
    titulo: 'Tu plan, tu comida',
    texto: 'Lucy genera tu calendario metabólico personalizado basado en tu cuerpo y tus objetivos. Tú escoges los alimentos que te gustan.',
  },
  {
    emoji: '💬',
    titulo: 'Cámbialo en segundos',
    texto: '¿No quieres pollo hoy? Díselo a Lucy o cámbialo tú mismo. El plan se ajusta automáticamente sin perder tus macros.',
  },
  {
    emoji: '🛒',
    titulo: 'Lista de compras incluida',
    texto: 'Lucy genera tu lista de supermercado automáticamente. Sin sorpresas, sin desperdicio.',
  },
]

export default function WaitlistPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F7FC' }}><p style={{ color: '#6B6889', fontSize: '14px' }}>Cargando...</p></div>}>
      <WaitlistContent />
    </Suspense>
  )
}

function WaitlistContent() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromGoogle = searchParams.get('from') === 'google'

  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'exists' | 'error'>('idle')
  const [count, setCount] = useState(200)
  const [showSticky, setShowSticky] = useState(false)

  const heroFormRef = useRef<HTMLDivElement>(null)
  const ctaFormRef = useRef<HTMLDivElement>(null)

  // Redirect authenticated users
  useEffect(() => {
    if (!authLoading && user) {
      router.push('/mi-calendario')
    }
  }, [user, authLoading, router])

  // Fetch waitlist count
  useEffect(() => {
    supabase
      .from('waitlist')
      .select('id', { count: 'exact', head: true })
      .then(({ count: c }) => {
        if (c !== null) setCount(200 + c)
      })
  }, [])

  // Intersection observer for sticky CTA
  useEffect(() => {
    const heroEl = heroFormRef.current
    const ctaEl = ctaFormRef.current
    if (!heroEl || !ctaEl) return

    const observer = new IntersectionObserver(
      (entries) => {
        const heroVisible = entries.some(e => e.target === heroEl && e.isIntersecting)
        const ctaVisible = entries.some(e => e.target === ctaEl && e.isIntersecting)
        setShowSticky(!heroVisible && !ctaVisible)
      },
      { threshold: 0.2 }
    )
    observer.observe(heroEl)
    observer.observe(ctaEl)
    return () => observer.disconnect()
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('loading')

    const { error } = await supabase.from('waitlist').insert({ email: email.trim().toLowerCase() })

    if (error) {
      if (error.code === '23505') {
        setStatus('exists')
      } else {
        setStatus('error')
      }
    } else {
      setStatus('success')
      setCount(prev => prev + 1)

      // Send confirmation email (non-blocking)
      fetch('/api/send-waitlist-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      }).catch(err => console.error('[waitlist] Confirmation email failed:', err))
    }
  }, [email])

  const scrollToHeroForm = () => {
    heroFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // Show loading while checking auth, redirect if authenticated
  if (authLoading) {
    return (
      <div style={{ backgroundColor: '#F8F7FC', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6B6889', fontSize: '14px' }}>Cargando...</p>
      </div>
    )
  }
  if (user) return null

  const isRegistered = status === 'success' || status === 'exists'

  const renderForm = () => {
    if (isRegistered) {
      return (
        <div className="text-center py-4 animate-fadeUp">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3" style={{ backgroundColor: '#EAE9F4' }}>
            <span className="text-xl">✅</span>
          </div>
          <p style={{ color: '#2D2B45', fontSize: '15px', fontWeight: 500 }}>
            {status === 'exists' ? '¡Ya estás en la lista!' : '¡Ya estás en la lista!'}
          </p>
          <p style={{ color: '#6B6889', fontSize: '13px', marginTop: '6px' }}>
            Te avisamos cuando abra el acceso.
          </p>
        </div>
      )
    }

    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="tu@email.com"
          required
          style={{
            border: '1px solid #EAE9F4',
            borderRadius: '12px',
            padding: '14px 16px',
            fontSize: '15px',
            color: '#2D2B45',
            backgroundColor: '#FFFFFF',
            outline: 'none',
            width: '100%',
          }}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          style={{
            backgroundColor: '#7B7FC4',
            color: '#FFFFFF',
            fontWeight: 600,
            borderRadius: '12px',
            padding: '14px 20px',
            fontSize: '15px',
            border: 'none',
            cursor: 'pointer',
            opacity: status === 'loading' ? 0.6 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          {status === 'loading' ? 'Guardando...' : 'Quiero acceso anticipado →'}
        </button>
        {status === 'error' && (
          <p style={{ color: '#e53e3e', fontSize: '13px', textAlign: 'center' }}>Hubo un error. Intenta de nuevo.</p>
        )}
      </form>
    )
  }

  return (
    <div style={{ backgroundColor: '#F8F7FC', minHeight: '100vh' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>

        {/* ═══ SECCIÓN 1 — HERO ═══ */}
        <section style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 20px 32px' }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '48px', color: '#2D2B45', margin: 0, lineHeight: 1 }}>
              Lucy
            </h1>
            <p style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#7B7FC4', marginTop: '8px', fontWeight: 500 }}>
              CALENDARIO METABÓLICO
            </p>
          </div>

          {/* Google redirect message */}
          {fromGoogle && (
            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #EAE9F4', borderRadius: '16px', padding: '16px', marginBottom: '24px', textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: '#2D2B45', margin: 0 }}>Gracias por tu interés. Estamos en beta — únete a la lista de espera y te avisamos cuando tu acceso esté listo.</p>
            </div>
          )}

          {/* Headline */}
          <h2 style={{ fontSize: '28px', fontWeight: 700, color: '#2D2B45', lineHeight: 1.2, textAlign: 'center', marginBottom: '16px' }}>
            Tu asistente nutricional personal con IA — disponible cuando tú lo necesitas
          </h2>
          <p style={{ fontSize: '15px', color: '#6B6889', textAlign: 'center', lineHeight: 1.6, marginBottom: '28px' }}>
            Un plan de nutrición personalizado, calculado para tu cuerpo, que puedes ajustar en segundos desde tu teléfono.
          </p>

          {/* Badge */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <span className="animate-pulse-soft" style={{
              display: 'inline-block',
              backgroundColor: '#FFFFFF',
              border: '1px solid #EAE9F4',
              borderRadius: '100px',
              padding: '8px 16px',
              fontSize: '13px',
              color: '#2D2B45',
              fontWeight: 500,
            }}>
              🔥 Más de <strong>{count.toLocaleString()}</strong> personas en espera
            </span>
          </div>

          {/* Form */}
          <div ref={heroFormRef} style={{ marginBottom: '12px' }}>
            {renderForm()}
          </div>

          {!isRegistered && (
            <p style={{ fontSize: '12px', color: '#6B6889', textAlign: 'center' }}>
              Gratis unirte. Sin spam. Te avisamos primero.
            </p>
          )}

          {/* iPhone mockup */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '40px' }}>
            <div style={{
              width: '180px',
              height: '340px',
              borderRadius: '28px',
              border: '3px solid #2D2B45',
              backgroundColor: '#F8F7FC',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(45,43,69,0.1)',
            }}>
              {/* Notch */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: '60px',
                height: '16px',
                backgroundColor: '#2D2B45',
                borderRadius: '0 0 12px 12px',
              }} />
              {/* Screen content */}
              <div style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 16px 20px',
              }}>
                <p style={{ fontFamily: 'Georgia, serif', fontSize: '24px', color: '#2D2B45', marginBottom: '4px' }}>Lucy</p>
                <p style={{ fontSize: '5px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#7B7FC4', fontWeight: 500, marginBottom: '20px' }}>CALENDARIO METABÓLICO</p>
                {/* Mini calendar preview */}
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {['Desayuno', 'Almuerzo', 'Cena'].map(meal => (
                    <div key={meal} style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      border: '1px solid #EAE9F4',
                    }}>
                      <p style={{ fontSize: '6px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B6889', marginBottom: '3px' }}>{meal}</p>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#EAE9F4', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ height: '4px', backgroundColor: '#EAE9F4', borderRadius: '2px', width: '70%' }} />
                          <div style={{ height: '3px', backgroundColor: '#EAE9F4', borderRadius: '2px', width: '40%', marginTop: '3px', opacity: 0.5 }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SECCIÓN 2 — EL PROBLEMA ═══ */}
        <section style={{ padding: '64px 20px' }}>
          <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#2D2B45', textAlign: 'center', lineHeight: 1.3, marginBottom: '32px' }}>
            Sabes que debes comer bien. El problema es el <em>cómo</em>.
          </h3>
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px', scrollSnapType: 'x mandatory' }} className="scrollbar-hide">
            {PROBLEMAS.map((p, i) => (
              <div key={i} style={{
                minWidth: '260px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #EAE9F4',
                borderRadius: '16px',
                padding: '24px 20px',
                scrollSnapAlign: 'start',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: '28px', display: 'block', marginBottom: '12px' }}>{p.emoji}</span>
                <p style={{ fontSize: '15px', color: '#2D2B45', fontWeight: 500, lineHeight: 1.5 }}>{p.texto}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ SECCIÓN 3 — LA SOLUCIÓN ═══ */}
        <section style={{ padding: '64px 20px' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#7B7FC4', fontWeight: 500, textAlign: 'center', marginBottom: '12px' }}>
            LA SOLUCIÓN
          </p>
          <h3 style={{ fontSize: '24px', fontWeight: 700, color: '#2D2B45', textAlign: 'center', marginBottom: '40px' }}>
            Lucy lo hace por ti.
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {BENEFICIOS.map((b, i) => (
              <div key={i} style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #EAE9F4',
                borderRadius: '16px',
                padding: '28px 24px',
              }}>
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '12px' }}>{b.emoji}</span>
                <p style={{ fontSize: '17px', fontWeight: 600, color: '#2D2B45', marginBottom: '8px' }}>{b.titulo}</p>
                <p style={{ fontSize: '14px', color: '#6B6889', lineHeight: 1.6 }}>{b.texto}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ SECCIÓN 4 — TESTIMONIOS ═══ */}
        <section style={{ padding: '64px 20px' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#7B7FC4', fontWeight: 500, textAlign: 'center', marginBottom: '12px' }}>
            PRUEBA SOCIAL
          </p>
          <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#2D2B45', textAlign: 'center', lineHeight: 1.3, marginBottom: '32px' }}>
            Las primeras en probarlo ya lo aman.
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {TESTIMONIOS.map((t, i) => (
              <div key={i} style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #EAE9F4',
                borderRadius: '16px',
                padding: '24px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: '#EAE9F4',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <span style={{ fontWeight: 600, color: '#7B7FC4', fontSize: '16px' }}>
                      {t.nombre.charAt(0)}
                    </span>
                  </div>
                  <p style={{ fontWeight: 600, fontSize: '14px', color: '#2D2B45' }}>{t.nombre}</p>
                </div>
                <p style={{ fontSize: '14px', color: '#6B6889', lineHeight: 1.6, fontStyle: 'italic' }}>
                  &ldquo;{t.texto}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ SECCIÓN 5 — CTA FINAL ═══ */}
        <section style={{ padding: '64px 20px 40px' }}>
          <h3 style={{ fontSize: '24px', fontWeight: 700, color: '#2D2B45', textAlign: 'center', marginBottom: '12px' }}>
            Sé de las primeras en acceder.
          </h3>
          <p style={{ fontSize: '14px', color: '#6B6889', textAlign: 'center', lineHeight: 1.6, marginBottom: '24px' }}>
            El acceso anticipado es limitado. Las personas en la lista de espera entran primero.
          </p>

          <div ref={ctaFormRef} style={{ marginBottom: '16px' }}>
            {renderForm()}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span style={{
              display: 'inline-block',
              backgroundColor: '#EAE9F4',
              borderRadius: '100px',
              padding: '6px 14px',
              fontSize: '12px',
              color: '#6B6889',
              fontWeight: 500,
            }}>
              🔒 Acceso por invitación
            </span>
          </div>
        </section>

        {/* ═══ FOOTER ═══ */}
        <footer style={{ borderTop: '1px solid #EAE9F4', padding: '32px 20px 40px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'Georgia, serif', fontSize: '20px', color: '#2D2B45', marginBottom: '16px' }}>Lucy</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '20px' }}>
            <span style={{ fontSize: '11px', color: '#6B6889' }}>Powered by</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/caribeno-fit-labs.png" alt="Caribeño Fit Labs" style={{ height: '20px' }} />
            <span style={{ fontSize: '11px', color: '#2D2B45', fontWeight: 500 }}>Caribeño Fit Labs</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
            <a href="#" style={{ fontSize: '12px', color: '#6B6889', textDecoration: 'none' }}>Política de privacidad</a>
            <a href="#" style={{ fontSize: '12px', color: '#6B6889', textDecoration: 'none' }}>Términos</a>
          </div>
        </footer>
      </div>

      {/* ═══ STICKY CTA (mobile) ═══ */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid #EAE9F4',
          padding: '12px 20px calc(12px + env(safe-area-inset-bottom))',
          transform: showSticky ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s ease',
          zIndex: 40,
        }}
      >
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <button
            onClick={scrollToHeroForm}
            style={{
              width: '100%',
              backgroundColor: '#7B7FC4',
              color: '#FFFFFF',
              fontWeight: 600,
              borderRadius: '12px',
              padding: '14px 20px',
              fontSize: '15px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Únete al waitlist
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeUp {
          animation: fadeUp 0.4s ease-out;
        }
        @keyframes pulseSoft {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .animate-pulse-soft {
          animation: pulseSoft 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
