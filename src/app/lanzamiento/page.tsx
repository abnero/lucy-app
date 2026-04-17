'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
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
  {
    nombre: 'Linette',
    texto: 'Ahora por fin me siento segura porque sé qué comer y las cantidades para bajar de peso.',
  },
]

const PROBLEMAS = [
  { emoji: '🤯', titulo: 'No sé qué comer ni en qué cantidades para bajar de peso', texto: 'El problema más común que escucho de mujeres que quieren bajar de peso es exactamente ese.' },
  { emoji: '😩', titulo: 'Contar calorías es agotador y no es sostenible', texto: 'Ninguna mujer con una vida ocupada tiene tiempo para calcular cada gramo de comida a mano.' },
  { emoji: '🍽️', titulo: 'Siempre las mismas recetas y ya me aburrí', texto: '¿Te pasa que no sabes recetas nuevas y por eso terminas comiendo lo mismo o lo que sea?' },
  { emoji: '📏', titulo: 'Sé que el pollo es bueno, pero ¿2 oz o 8 oz?', texto: 'La diferencia entre bajar de peso y no bajar de peso muchas veces no es qué comes — es cuánto comes.' },
  { emoji: '⏰', titulo: 'Tu coach no contesta a las 7pm cuando tienes hambre', texto: 'En ese momento tomas la decisión equivocada — no porque no quieras bajar de peso, sino porque no tienes ayuda en ese instante.' },
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

export default function LanzamientoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F7FC' }}><p style={{ color: '#6B6889', fontSize: '14px' }}>Cargando...</p></div>}>
      <LanzamientoContent />
    </Suspense>
  )
}

function LanzamientoContent() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromGoogle = searchParams.get('from') === 'google'

  const [count, setCount] = useState(200)
  const [showSticky, setShowSticky] = useState(false)

  const heroCtaRef = useRef<HTMLDivElement>(null)
  const bottomCtaRef = useRef<HTMLDivElement>(null)

  // Redirect authenticated users
  useEffect(() => {
    if (!authLoading && user) {
      router.push('/mi-calendario')
    }
  }, [user, authLoading, router])

  // Fetch waitlist count (social proof)
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
    const heroEl = heroCtaRef.current
    const ctaEl = bottomCtaRef.current
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

  const goToPago = () => router.push('/pago')

  if (authLoading) {
    return (
      <div style={{ backgroundColor: '#F8F7FC', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6B6889', fontSize: '14px' }}>Cargando...</p>
      </div>
    )
  }
  if (user) return null

  const renderCta = () => {
    return (
      <div>
        <button
          onClick={goToPago}
          style={{
            width: '100%',
            backgroundColor: '#7B7FC4',
            color: '#FFFFFF',
            fontWeight: 600,
            borderRadius: '12px',
            padding: '16px 20px',
            fontSize: '16px',
            border: 'none',
            cursor: 'pointer',
            transition: 'opacity 0.2s',
          }}
        >
          Comenzar ahora — $297/año →
        </button>
        <p style={{ fontSize: '12px', color: '#6B6889', textAlign: 'center', marginTop: '10px' }}>
          ✓ Acceso inmediato después del pago · ✓ Cancela cuando quieras
        </p>
      </div>
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
          <p style={{ fontSize: '15px', color: '#6B6889', textAlign: 'center', lineHeight: 1.6, marginBottom: '24px' }}>
            Un plan de nutrición personalizado, calculado para tu cuerpo, que puedes ajustar en segundos desde tu teléfono.
          </p>

          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #EAE9F4', borderRadius: '16px', padding: '24px 20px', marginBottom: '28px', textAlign: 'center' }}>
            <p style={{ fontSize: '17px', fontWeight: 700, color: '#2D2B45', lineHeight: 1.4, marginBottom: '10px' }}>
              ¿Empiezas la dieta el lunes con toda la energía y para el miércoles ya lo dejaste?
            </p>
            <p style={{ fontSize: '14px', color: '#6B6889', lineHeight: 1.6 }}>
              El problema no eres tú — es que el plan no era tuyo. Era genérico, aburrido, y no encajaba con tu vida.
            </p>
          </div>

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
          <div ref={heroCtaRef} style={{ marginBottom: '12px' }}>
            {renderCta()}
          </div>

          {(
            <p style={{ fontSize: '12px', color: '#6B6889', textAlign: 'center' }}>
              Pago único anual. Acceso inmediato.
            </p>
          )}

          {/* Hero image */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '40px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/hero-mujer-telefono.png"
              alt="Mujer usando Lucy en su teléfono"
              style={{
                width: '100%',
                maxWidth: '400px',
                borderRadius: '16px',
                objectFit: 'cover',
                boxShadow: '0 20px 40px rgba(45,43,69,0.1)',
              }}
            />
          </div>

          <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#2D2B45', textAlign: 'center', lineHeight: 1.3, marginTop: '48px' }}>
            Sabes que debes comer bien. El problema es el <em>cómo</em>.
          </h3>
        </section>

        {/* ═══ SECCIÓN 2 — EL PROBLEMA ═══ */}
        <section style={{ padding: '64px 20px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/problema-mujer-nevera.png"
            alt="Mujer pensativa frente a la nevera"
            style={{
              width: '100%',
              maxHeight: '300px',
              objectFit: 'cover',
              borderRadius: '16px',
              marginBottom: '32px',
            }}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" style={{ gap: '16px' }}>
            {PROBLEMAS.map((p, i) => (
              <div key={i} style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #EAE9F4',
                borderRadius: '16px',
                padding: '24px 20px',
              }}>
                <span style={{ fontSize: '28px', display: 'block', marginBottom: '12px' }}>{p.emoji}</span>
                <p style={{ fontSize: '15px', color: '#2D2B45', fontWeight: 600, lineHeight: 1.4, marginBottom: '8px' }}>{p.titulo}</p>
                <p style={{ fontSize: '13px', color: '#6B6889', lineHeight: 1.5 }}>{p.texto}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Transition — reveal */}
        <div style={{ padding: '64px 20px 48px', textAlign: 'center' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#7B7FC4', fontWeight: 500, marginBottom: '24px' }}>
            LA SOLUCIÓN
          </p>
          <p style={{ fontSize: '18px', color: '#6B6889', marginBottom: '8px' }}>
            Por eso creamos a
          </p>
          <span className="lucy-reveal" style={{
            fontFamily: 'Georgia, serif',
            color: '#7B7FC4',
            display: 'inline-block',
            position: 'relative',
            paddingBottom: '6px',
          }}>
            Lucy
            <span style={{
              position: 'absolute',
              bottom: 0,
              left: '10%',
              width: '80%',
              height: '3px',
              backgroundColor: '#7B7FC4',
              borderRadius: '2px',
            }} />
          </span>
        </div>

        {/* ═══ SECCIÓN 3 — LA SOLUCIÓN ═══ */}
        <section style={{ padding: '0 20px 64px' }}>
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

        {/* ═══ LUCY EN ACCIÓN ═══ */}
        <section style={{ padding: '64px 20px' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#7B7FC4', fontWeight: 500, textAlign: 'center', marginBottom: '12px' }}>
            LUCY EN ACCIÓN
          </p>
          <h3 style={{ fontSize: '24px', fontWeight: 700, color: '#2D2B45', textAlign: 'center', marginBottom: '8px' }}>
            Mírala trabajar.
          </h3>
          <p style={{ fontSize: '14px', color: '#6B6889', textAlign: 'center', lineHeight: 1.6, marginBottom: '36px' }}>
            Esto es lo que puedes pedirle a Lucy desde tu teléfono.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', alignItems: 'center' }}>
            {[
              { src: '/screenshots/calendario-dia.PNG', label: 'Tu plan del día, siempre organizado' },
              { src: '/screenshots/chat-cambio-alimento.PNG', label: 'Cambia cualquier alimento en segundos' },
              { src: '/screenshots/chat-receta.PNG', label: 'Pídele recetas según tus alimentos' },
              { src: '/screenshots/chat-snack.PNG', label: 'Lucy sabe cuándo tienes hambre y qué comer' },
              { src: '/screenshots/lista-compras.PNG', label: 'Tu lista de compras, generada automáticamente' },
            ].map((item, i) => (
              <div key={i} style={{ width: '100%', maxWidth: '280px' }}>
                <div style={{
                  borderRadius: '36px',
                  border: '8px solid #2D2B45',
                  backgroundColor: '#FFFFFF',
                  overflow: 'hidden',
                  boxShadow: '0 12px 40px rgba(45, 43, 69, 0.12)',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.src}
                    alt={item.label}
                    style={{ width: '100%', display: 'block' }}
                  />
                </div>
                <p style={{ fontSize: '13px', color: '#6B6889', textAlign: 'center', marginTop: '14px', lineHeight: 1.4 }}>
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ PREVIEW DEL PRODUCTO ═══ */}
        <section style={{ padding: '64px 20px 32px' }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#7B7FC4', fontWeight: 500, textAlign: 'center', marginBottom: '12px' }}>
            ASÍ SE VE
          </p>
          <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#2D2B45', textAlign: 'center', lineHeight: 1.3, marginBottom: '12px' }}>
            Tu plan de la semana, siempre a la mano.
          </h3>
          <p style={{ fontSize: '14px', color: '#6B6889', textAlign: 'center', lineHeight: 1.6, marginBottom: '32px' }}>
            Descárgalo en PDF e imprímelo. O úsalo directo desde tu teléfono.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/calendario-ejemplo.png"
              alt="Ejemplo de calendario metabólico semanal de Lucy"
              style={{
                width: '100%',
                maxWidth: '800px',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(123, 127, 196, 0.15)',
                display: 'block',
              }}
            />
          </div>
        </section>

        {/* ═══ SECCIÓN 4 — TESTIMONIOS ═══ */}
        <section style={{ padding: '64px 20px' }}>
          <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#2D2B45', textAlign: 'center', lineHeight: 1.3, marginBottom: '24px' }}>
            Camina libre de estrés y segura de ti misma... con Lucy
          </h3>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/testimonio-mujer-caminando.png"
            alt="Mujer caminando con confianza"
            style={{
              width: '100%',
              maxHeight: '250px',
              objectFit: 'cover',
              borderRadius: '16px',
              marginBottom: '32px',
            }}
          />
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
            Acceso inmediato. Tu plan personalizado en menos de 5 minutos.
          </p>

          <div ref={bottomCtaRef} style={{ marginBottom: '16px' }}>
            {renderCta()}
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
              🔒 Pago seguro con Stripe
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
            onClick={goToPago}
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
            Comenzar ahora — $297/año
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
        .lucy-reveal {
          font-size: 56px;
          font-weight: 700;
          line-height: 1.1;
        }
        @media (min-width: 768px) {
          .lucy-reveal {
            font-size: 72px;
          }
        }
      `}</style>
    </div>
  )
}
