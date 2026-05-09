'use client'

import { useState } from 'react'

/* ─── Placeholder Components ─── */

function Placeholder({ label, height = 300, aspect }: { label: string; height?: number; aspect?: string }) {
  return (
    <div
      style={{
        background: 'repeating-linear-gradient(45deg, #F5EFFF, #F5EFFF 10px, #EAE2FF 10px, #EAE2FF 20px)',
        border: '2px dashed #7B7FC4',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: '#7B7FC4',
        fontWeight: 500,
        fontSize: 14,
        padding: 24,
        height,
        ...(aspect ? { aspectRatio: aspect, height: 'auto' } : {}),
      }}
    >
      {label}
    </div>
  )
}

/* ─── CTA Button ─── */

function CtaButton({ text, large }: { text: string; large?: boolean }) {
  const handleClick = async () => {
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {
      alert('Error conectando con el sistema de pago. Intenta de nuevo.')
    }
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <button
        onClick={handleClick}
        style={{
          display: 'inline-block',
          background: '#2D2B45',
          color: '#FFFFFF',
          fontSize: large ? 24 : 20,
          fontWeight: 700,
          padding: large ? '28px 56px' : '22px 44px',
          borderRadius: 12,
          border: 'none',
          cursor: 'pointer',
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
          boxShadow: '0 6px 20px rgba(45, 43, 69, 0.3)',
          transition: 'transform 0.2s, box-shadow 0.2s, background 0.2s',
          width: '100%',
          maxWidth: 600,
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(45, 43, 69, 0.4)'; e.currentTarget.style.background = '#3D3B5A' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(45, 43, 69, 0.3)'; e.currentTarget.style.background = '#2D2B45' }}
      >
        {text}
      </button>
      <p style={{ fontSize: 14, color: '#555', marginTop: 8 }}>
        Pago único &bull; Sin renovación automática &bull; Garantía 7 días
      </p>
    </div>
  )
}

/* ─── FAQ Item ─── */

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background: '#FFF', borderRadius: 8, padding: '20px 24px', marginBottom: 12 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: 18,
          color: '#2D2B45',
          textAlign: 'left',
          padding: 0,
        }}
      >
        {question}
        <span style={{ fontSize: 24, marginLeft: 16, flexShrink: 0 }}>{open ? '−' : '+'}</span>
      </button>
      {open && <p style={{ color: '#555', fontSize: 16, marginTop: 12, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: answer }} />}
    </div>
  )
}

/* ─── Bullet Item ─── */

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <span style={{ color: '#7B9E7E', fontSize: 24, flexShrink: 0, marginTop: 2 }}>&#10003;</span>
      <div style={{ fontSize: 17, lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}

/* ─── STYLES ─── */

const container = { maxWidth: 1200, margin: '0 auto', padding: '0 20px' } as const
const narrow = { maxWidth: 900, margin: '0 auto', padding: '0 20px' } as const

export default function LandingPage() {
  return (
    <div style={{ color: '#2D2B45', lineHeight: 1.6, fontSize: 18 }}>

      {/* ═══ SECTION 1: PRE-HEADER ═══ */}
      <div style={{ background: '#7B7FC4', color: '#FFF', textAlign: 'center', padding: '12px 20px', fontSize: 14, fontWeight: 500 }}>
        Lanzamiento oficial: Lucy ya está disponible para mujeres profesionales de Puerto Rico y Estados Unidos — <a href="#cta-hero" style={{ color: '#FFF', textDecoration: 'underline' }}>Empieza aquí →</a>
      </div>

      <nav style={{ background: '#FFF', padding: '28px 0', borderBottom: '1px solid #EEE' }}>
        <div style={{ ...container, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 64, color: '#2D2B45', letterSpacing: '-0.02em', lineHeight: 1 }} className="font-logo landing-logo">Lucy</span>
          <a href="#cta-hero" style={{ background: '#2D2B45', color: '#FFF', padding: '10px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }} className="landing-nav-btn">Empezar →</a>
        </div>
      </nav>

      {/* ═══ SECTION 2: HERO ═══ */}
      <section style={{ background: '#F8F7FC', padding: '80px 0 100px' }}>
        <div style={container}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }} className="landing-hero-grid">
            <div>
              <h1 style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 24, color: '#2D2B45' }} className="landing-h1">
                Por fin sabes qué comer — y en qué cantidades.
              </h1>
              {/* Intro corto */}
              <p style={{ fontSize: 20, color: '#555', marginBottom: 24, lineHeight: 1.5 }} className="hero-intro">
                Lucy es tu asistente nutricional con IA, diseñada para mujeres profesionales latinas.
              </p>

              <div
                className="hero-lifestyle-img"
                style={{
                  marginTop: 24,
                  marginBottom: 32,
                  borderRadius: 16,
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, #B8B5E0 0%, #7B7FC4 100%)',
                  aspectRatio: '16 / 9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  padding: 16
                }}
              >
                <img
                  src="/hero-lifestyle.jpg"
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              </div>

              {/* Bullets verbales */}
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <li style={{ fontSize: 18, color: '#2D2B45', display: 'flex', alignItems: 'baseline', gap: 10 }} className="hero-bullet">
                  <span style={{ color: '#7B7FC4', fontWeight: 700, flexShrink: 0 }}>✓</span> Eliges tus alimentos favoritos
                </li>
                <li style={{ fontSize: 18, color: '#2D2B45', display: 'flex', alignItems: 'baseline', gap: 10 }} className="hero-bullet">
                  <span style={{ color: '#7B7FC4', fontWeight: 700, flexShrink: 0 }}>✓</span> Lucy calcula las porciones exactas para tu cuerpo
                </li>
                <li style={{ fontSize: 18, color: '#2D2B45', display: 'flex', alignItems: 'baseline', gap: 10 }} className="hero-bullet">
                  <span style={{ color: '#7B7FC4', fontWeight: 700, flexShrink: 0 }}>✓</span> Te arma un plan de 7 días completo en español
                </li>
              </ul>

              {/* Línea de "sin" */}
              <p style={{ fontSize: 16, color: '#7B7FC4', fontWeight: 500, marginBottom: 32, lineHeight: 1.6 }} className="hero-sin">
                Sin contar calorías · Sin pesar comida · Sin ejercicio · Sin mensualidades
              </p>

              <div id="cta-hero">
                <CtaButton text="Empieza con Lucy — $297 por 1 año completo" />
              </div>

              <div style={{ marginTop: 24, fontSize: 15, color: '#555' }}>
                <span style={{ color: '#FFB800', fontSize: 18 }}>★★★★★</span> Más de 37,000 mujeres profesionales siguen a Caribeño Fit Labs en Instagram
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {/* iPhone mockup frame */}
              <div
                className="iphone-mockup"
                style={{
                  position: 'relative',
                  width: 300,
                  height: 620,
                  background: '#1a1a1a',
                  borderRadius: 52,
                  padding: 12,
                  boxShadow: '0 20px 60px rgba(45,43,69,0.2)',
                }}
              >
                {/* Dynamic Island */}
                <div style={{
                  position: 'absolute',
                  top: 16,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 100,
                  height: 28,
                  background: '#000',
                  borderRadius: 20,
                  zIndex: 2,
                }} />
                {/* Screen */}
                <div style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: 40,
                  overflow: 'hidden',
                  background: '#F8F7FC',
                }}>
                  <p style={{
                    textAlign: 'center',
                    fontSize: 14,
                    color: '#7B7FC4',
                    fontWeight: 600,
                    marginBottom: 12,
                    textTransform: 'uppercase',
                    letterSpacing: 1
                  }}>
                    Así se ve tu plan de 7 días dentro de Lucy
                  </p>
                  <img
                    src="/lucy-app-screenshot.png"
                    alt="Lucy app — calendario metabólico mostrando plan de comidas del lunes con desayuno y almuerzo"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      objectPosition: 'top center',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 3: PAIN ═══ */}
      <section style={{ background: '#FFF', padding: '100px 0' }} className="landing-section">
        <div style={narrow}>
          <h2 style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em', marginBottom: 32 }} className="landing-h2">
            No es que te falte disciplina. Es que nadie te ha dado un sistema que funcione para tu vida real.
          </h2>

          <ul className="pain-bullets" style={{ listStyle: 'none', padding: 0, marginBottom: 32 }}>
            <li style={{ marginBottom: 16, paddingLeft: 28, position: 'relative', fontSize: 18, lineHeight: 1.6 }}>
              <span style={{ position: 'absolute', left: 0, top: 2, color: '#7B7FC4', fontWeight: 700 }}>✓</span>
              Eres exitosa en tu carrera. Llegaste donde querías llegar.
            </li>
            <li style={{ marginBottom: 16, paddingLeft: 28, position: 'relative', fontSize: 18, lineHeight: 1.6 }}>
              <span style={{ position: 'absolute', left: 0, top: 2, color: '#7B7FC4', fontWeight: 700 }}>✓</span>
              Eres mamá, jefa, esposa, amiga, hija que cuida a sus papás.
            </li>
            <li style={{ marginBottom: 16, paddingLeft: 28, position: 'relative', fontSize: 18, lineHeight: 1.6 }}>
              <span style={{ position: 'absolute', left: 0, top: 2, color: '#7B7FC4', fontWeight: 700 }}>✓</span>
              Manejas 10 cosas a la vez y las manejas bien.
            </li>
            <li style={{ marginBottom: 16, paddingLeft: 28, position: 'relative', fontSize: 18, lineHeight: 1.6 }}>
              <span style={{ position: 'absolute', left: 0, top: 2, color: '#7B7FC4', fontWeight: 700 }}>✓</span>
              Pero hay una cosa que no has podido resolver: <strong>qué comer para bajar de peso sin volverte loca.</strong>
            </li>
          </ul>

          <p style={{ fontSize: 19 }}>Has probado de todo.</p>

          <p style={{ fontSize: 19 }}>Keto. Ayuno intermitente. Batidos. Dietas con puntos. Apps que te hacen contar cada caloría que entra a tu boca. Nutricionistas que te dan una hoja impresa que dura 2 semanas en la nevera antes de que la ignores.</p>

          <p style={{ fontSize: 19 }}>Al principio funciona. Bajas 5, 10 libras. Te ilusionas. Y después recuperas todo. Y más.</p>

          <p style={{ fontSize: 19 }}>Y te quedas con la sensación de que el problema eres tú. Que no tienes fuerza de voluntad. Que &ldquo;no puedes con algo tan simple como comer&rdquo;.</p>

          <div style={{ background: '#FFF5F0', padding: '20px 24px', borderLeft: '4px solid #E87B5E', margin: '24px 0', fontWeight: 500, fontSize: 20 }}>
            No eres tú.
          </div>

          <p style={{ fontSize: 19 }}>El problema es que todas esas dietas te pusieron a TI a hacer el trabajo difícil: decidir qué cocinar, calcular cantidades, medir, pesar, tachar alimentos, sentirte culpable cuando fallas.</p>

          <p style={{ fontSize: 19 }}>Eso no es sostenible cuando tienes 40 horas de trabajo, hijos que criar, pareja que atender, y una semana que empieza el lunes a las 7am con reuniones.</p>

          <p style={{ fontSize: 19 }}>Lo que necesitas no es otra dieta. Lo que necesitas es que alguien te diga: <strong>&ldquo;come esto, en esta cantidad, durante los próximos 7 días.&rdquo;</strong></p>

          <p style={{ fontSize: 19 }}>Y que ese alguien conozca tu cuerpo, tu cultura, tu ritmo.</p>

          <p style={{ fontSize: 24, fontWeight: 700, color: '#7B7FC4' }}>Eso es Lucy.</p>
        </div>
      </section>

      {/* ═══ SECTION 4: ORIGIN STORY ═══ */}
      <section style={{ background: '#FFF', padding: '100px 0' }} className="landing-section">
        <div style={container}>
          <h2 style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.2, marginBottom: 32 }} className="landing-h2">
            Cómo nació Lucy — y por qué la construí para ti
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 60, alignItems: 'start' }} className="landing-origin-grid">

            {/* Foto Abner */}
            <div style={{ position: 'sticky', top: 40 }} className="origin-photo-wrap">
              <img
                src="/abner-profesional.png"
                alt="Coach Abner — CEO de Caribeño Fit Labs"
                style={{
                  width: '100%',
                  borderRadius: 16,
                  objectFit: 'cover',
                  boxShadow: '0 12px 40px rgba(45,43,69,0.15)',
                }}
              />
            </div>

            {/* 12 bloques */}
            <div>

              {/* Bloque 1 — Identificación */}
              <h3 style={{ fontSize: 36, fontWeight: 700, color: '#2D2B45', lineHeight: 1.2, marginBottom: 4 }} className="origin-h3">Soy Coach Abner.</h3>
              <p style={{ fontSize: 18, color: '#555', marginBottom: 24 }}>CEO de Caribeño Fit Labs.</p>

              {/* Bloque 2 — Contexto */}
              <p style={{ fontSize: 18, color: '#2D2B45', marginBottom: 20 }} className="origin-prose">
                Por años entrené a mujeres profesionales latinas uno-a-uno. Mujeres como tú. Mujeres que llegaban agotadas de probar todo y nada les funcionaba de manera sostenible.
              </p>

              {/* Bloque 3 — Stat box */}
              <div style={{ background: '#FFF', border: '2px solid #7B7FC4', padding: 32, borderRadius: 16, margin: '32px 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, textAlign: 'center' }} className="origin-stat-grid">
                <div>
                  <div style={{ fontSize: 48, fontWeight: 700, color: '#7B7FC4', lineHeight: 1 }} className="origin-stat-num">20-50</div>
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#555', marginTop: 8 }}>Libras perdidas en promedio</div>
                </div>
                <div>
                  <div style={{ fontSize: 48, fontWeight: 700, color: '#7B7FC4', lineHeight: 1 }} className="origin-stat-num">1000+</div>
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#555', marginTop: 8 }}>Mujeres entrenadas en Caribeño Fit Labs</div>
                </div>
                <div>
                  <div style={{ fontSize: 48, fontWeight: 700, color: '#7B7FC4', lineHeight: 1 }} className="origin-stat-num">5</div>
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#555', marginTop: 8 }}>Áreas de coaching</div>
                </div>
              </div>

              {/* Bloque 4 — Lista actividades coaches */}
              <h3 style={{ fontSize: 22, fontWeight: 700, color: '#2D2B45', marginBottom: 8 }} className="origin-h3-sm">Mis clientas bajaban 20, 30, 50 libras — pero nunca por fuerza de voluntad.</h3>
              <p style={{ fontSize: 18, color: '#2D2B45', marginBottom: 16 }} className="origin-prose">Era porque mi equipo y yo hacíamos el trabajo pesado por ellas:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
                {['Calculábamos sus macros', 'Les decíamos exactamente qué comer cada día', 'Ajustábamos las cantidades cuando cambiaban de peso', 'Adaptábamos el plan a su nivel de actividad'].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ color: '#7B7FC4', fontWeight: 700, fontSize: 20, flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 18, color: '#2D2B45' }} className="origin-prose">{item}</span>
                  </div>
                ))}
              </div>

              {/* Bloque 5 — Sistema 5 áreas */}
              <p style={{ fontSize: 18, color: '#2D2B45', marginBottom: 16 }} className="origin-prose">En Caribeño Fit Labs tenemos un sistema de 5 áreas:</p>
              <div style={{ background: '#F8F7FC', padding: 24, borderRadius: 12, display: 'flex', justifyContent: 'space-around', marginBottom: 32 }} className="origin-areas">
                {['Nutrición', 'Ejercicio', 'Descanso', 'Hidratación', 'Salud Mental'].map((area, i) => (
                  <span key={i} style={{ fontSize: 16, fontWeight: 600, color: '#2D2B45', textAlign: 'center' }} className="origin-area-label">{area}</span>
                ))}
              </div>

              {/* Bloque 6 — Frase ancla DRAMATIC */}
              <p style={{ fontSize: 28, fontWeight: 600, color: '#2D2B45', textAlign: 'center', margin: '32px 0' }} className="origin-dramatic-intro">
                Pero el 80% del tiempo de mis coaches se iba en una sola área:
              </p>
              <p style={{ fontSize: 80, fontWeight: 700, color: '#7B7FC4', textAlign: 'center', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 48 }} className="origin-nutricion">
                NUTRICIÓN.
              </p>

              {/* Bloque 7 — Las 3 actividades */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
                {['Calculando porciones', 'Armando calendarios', 'Ajustando cantidades cada semana'].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ color: '#7B7FC4', fontWeight: 700, fontSize: 18 }}>—</span>
                    <span style={{ fontSize: 18, color: '#555' }} className="origin-prose">{item}</span>
                  </div>
                ))}
              </div>

              {/* Bloque 8 — Callout box epifanía */}
              <div style={{ background: '#FFF', border: '2px solid #7B7FC4', padding: 32, borderRadius: 16, textAlign: 'center', margin: '32px 0' }} className="origin-callout">
                <p style={{ fontSize: 18, color: '#555', marginBottom: 12 }} className="origin-prose">Un día me di cuenta de algo:</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#2D2B45' }} className="origin-callout-bold">Si podía automatizar ese trabajo — si podía construir una herramienta que hiciera lo que hacen mis coaches en la parte de nutrición — podía ayudar a 10,000 mujeres en lugar de las que mi equipo y yo podíamos atender uno-a-uno.</p>
              </div>

              {/* Bloque 9 — Frase ancla */}
              <p style={{ fontSize: 64, fontWeight: 700, color: '#7B7FC4', textAlign: 'center', letterSpacing: '-0.02em', margin: '48px 0', lineHeight: 1.1 }} className="pain-anchor">
                Así nació Lucy.
              </p>

              {/* Bloque 10 — Definición de Lucy */}
              <p style={{ fontSize: 20, color: '#555', marginBottom: 12 }}>Lucy no es una dieta.</p>
              <p style={{ fontSize: 20, color: '#555', marginBottom: 12 }}>Lucy no es una app de tracking.</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: '#2D2B45', marginBottom: 24 }} className="origin-callout-bold">
                Lucy es el cerebro nutricional que mi equipo lleva años usando con mis clientas privadas — ahora disponible para ti directamente en tu teléfono.
              </p>

              {/* Bloque 11 — Precio anchor */}
              <div style={{ background: '#F8F7FC', padding: 32, borderRadius: 16, textAlign: 'center', margin: '32px 0' }} className="origin-callout">
                <p style={{ fontSize: 32, fontWeight: 700, color: '#7B7FC4' }} className="origin-stat-num">Por $297 al año.</p>
                <p style={{ fontSize: 18, fontWeight: 600, color: '#2D2B45', marginTop: 12 }} className="origin-prose">Eso es menos de lo que una sola semana de mi coaching privado cuesta.</p>
              </div>

              {/* Bloque 12 — Placeholder historia personal */}
              <div style={{
                background: 'repeating-linear-gradient(45deg, #F5EFFF, #F5EFFF 10px, #EAE2FF 10px, #EAE2FF 20px)',
                border: '2px dashed #7B7FC4',
                borderRadius: 16,
                padding: 32,
                textAlign: 'center',
                color: '#7B7FC4',
                fontWeight: 500,
                fontSize: 14,
                minHeight: 150,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                [Placeholder — Abner agregará historia personal específica]
              </div>

              {/* Firma */}
              <p style={{ fontStyle: 'italic', fontSize: 18, color: '#555', marginTop: 32 }} className="origin-firma">
                — Coach Abner<br />CEO, Caribeño Fit Labs
              </p>

            </div>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 5: SOCIAL PROOF ═══ */}
      <section style={{ background: '#F8F7FC', padding: '100px 0' }} className="landing-section">
        <div style={container}>
          <h2 style={{ fontSize: 42, fontWeight: 700, textAlign: 'center', marginBottom: 16 }} className="landing-h2">
            Mira lo que pasa cuando el sistema lo hace por ti
          </h2>
          <p style={{ textAlign: 'center', maxWidth: 700, margin: '0 auto', color: '#555', fontSize: 19, marginBottom: 40 }}>
            Estos son resultados reales de mujeres profesionales que siguieron la metodología nutricional que Lucy ahora automatiza.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 30 }} className="landing-testimonial-grid">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} style={{ background: '#FFF', borderRadius: 12, padding: 30, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <Placeholder label={`[Before/After #${i}]`} height={200} />
                <p style={{ fontWeight: 700, color: '#7B7FC4', fontSize: 18, marginTop: 16, marginBottom: 8 }}>Nombre P. — bajó XX lbs</p>
                <p style={{ color: '#555', fontSize: 15 }}>[PLACEHOLDER quote 1-2 líneas]</p>
              </div>
            ))}
          </div>

          <p style={{ textAlign: 'center', fontSize: 13, color: '#555', fontStyle: 'italic', marginTop: 32 }}>
            Los resultados mostrados son de clientas del programa de coaching 1:1 de Caribeño Fit Labs, que usa la misma metodología nutricional que Lucy automatiza. Los resultados individuales varían.
          </p>

          <h3 style={{ textAlign: 'center', marginTop: 60, marginBottom: 24, fontSize: 24, fontWeight: 700 }}>
            Lo que dicen las beta testers que ya están usando Lucy:
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 30 }} className="landing-testimonial-grid">
            {[1,2,3].map(i => (
              <Placeholder key={i} label={`[Screenshot WhatsApp #${i}]`} height={300} />
            ))}
          </div>

          <div style={{ marginTop: 50 }}>
            <CtaButton text="Quiero Mi Plan Personalizado — $297" />
          </div>
        </div>
      </section>

      {/* ═══ SECTION 6: MECHANISM ═══ */}
      <section style={{ background: '#F8F7FC', padding: '100px 0' }} className="landing-section">
        <div style={container}>
          <h2 style={{ fontSize: 42, fontWeight: 700, textAlign: 'center', marginBottom: 16 }} className="landing-h2">
            Las 3 Decisiones
          </h2>

          <div style={narrow}>
            <p style={{ textAlign: 'center', fontSize: 20, marginBottom: 16 }}>
              La razón por la que todas las otras apps fallan es simple: te ponen a TI a tomar las decisiones que no sabes tomar.
            </p>
            <p style={{ textAlign: 'center', fontSize: 20, fontStyle: 'italic', color: '#555', marginBottom: 16 }}>
              &ldquo;¿Cuánta proteína necesitas? Cuéntala tú.&rdquo; &ldquo;¿Qué alimentos escoger? Escoge tú.&rdquo; &ldquo;¿Cómo combinarlos? Combínalos tú.&rdquo;
            </p>
            <p style={{ textAlign: 'center', fontSize: 20, marginBottom: 16 }}>
              Pero si supieras, no estarías buscando ayuda.
            </p>
            <p style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, color: '#7B7FC4', margin: '30px 0' }}>
              Lucy es diferente. Lucy toma 3 decisiones por ti. Tú solo comes.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 30, marginTop: 40 }} className="landing-mechanism-grid">
            {[
              { num: '#1', title: 'QUÉ comer', p1: 'Lucy selecciona tus alimentos desde un catálogo <strong>latino auténtico</strong>. Arroz, habichuelas, plátano maduro, pollo, queso fresco, aguacate, huevo. Nada de quinoa roja del Perú, nada de bayas de goji, nada de cosas que tu mamá no reconocería.', p2: 'Tú eliges tus favoritos en un wizard de 5 minutos. Lucy arma las combinaciones.' },
              { num: '#2', title: 'CUÁNTO comer', p1: 'Lucy calcula las porciones <strong>exactas</strong> para tu cuerpo usando una fórmula calibrada específicamente para mujeres profesionales latinas entre 35 y 55 años.', p2: 'No te pregunta cuánto quieres comer. Te DICE cuánto. En libras, onzas, tazas. Nunca en gramos abstractos. Porque si supieras cuánto, no necesitarías Lucy.' },
              { num: '#3', title: 'CUÁNDO comer', p1: 'Lucy te arma un plan de 7 días completo. Desayuno, almuerzo, cena. Con reglas de rotación automáticas para que no te aburras — y aprovechando sobras (tu almuerzo de hoy es la cena de ayer).', p2: 'Abres la app en la mañana. Ves qué toca hoy. Comes. Cierras.' },
            ].map(d => (
              <div key={d.num} style={{ background: '#FFF', padding: '40px 30px', borderRadius: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 72, fontWeight: 700, color: '#7B7FC4', lineHeight: 1, marginBottom: 16 }}>{d.num}</div>
                <h3 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>{d.title}</h3>
                <p style={{ fontSize: 16, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: d.p1 }} />
                <p style={{ fontSize: 16, lineHeight: 1.6, marginTop: 12 }}>{d.p2}</p>
              </div>
            ))}
          </div>

          <p style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, marginTop: 50 }}>
            Eso es todo. Tres decisiones. Tú las obedeces. El peso baja solo.
          </p>
        </div>
      </section>

      {/* ═══ SECTION 7: BULLETS ═══ */}
      <section style={{ background: '#FFF', padding: '100px 0' }} className="landing-section">
        <div style={container}>
          <h2 style={{ fontSize: 42, fontWeight: 700, textAlign: 'center', marginBottom: 40 }} className="landing-h2">
            Esto es lo que recibes dentro de Lucy
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px 40px' }} className="landing-bullet-grid">
            <Bullet><strong>Tu plan de 7 días personalizado en menos de 10 minutos.</strong> Respondes 6 preguntas sobre ti (peso, altura, edad, actividad, meta, preferencias). Lucy te entrega el calendario completo. Sin ejercicios obligatorios. Sin batidos. Sin contar una sola caloría.</Bullet>
            <Bullet><strong>Porciones calculadas específicamente para mujeres profesionales latinas.</strong> La mayoría de apps asumen que eres un hombre americano de 35 años que va al gimnasio 5 veces por semana. Lucy usa una fórmula ajustada a tu realidad: sedentaria la mayor parte del día, culturalmente latina, en tus 30s-50s, con hormonas que no son las de un tipo de 25 años.</Bullet>
            <Bullet><strong>En español natural del Caribe.</strong> Sin traducciones raras. Sin &ldquo;zucchini&rdquo; cuando tu mamá te enseñó &ldquo;calabacín&rdquo;. Sin &ldquo;butternut squash&rdquo; cuando es calabaza. Lucy habla como tú hablas.</Bullet>
            <Bullet><strong>Alimentos que SÍ consigues en PR y Estados Unidos.</strong> Arroz, habichuelas, pollo, plátano, huevo, queso fresco, aguacate. Si vas a un supermercado americano o un colmado boricua, encuentras todo lo que Lucy te recomienda.</Bullet>
            <Bullet><strong>Tu asistente nutricional AI disponible 24/7.</strong> ¿Tienes hambre a las 10pm y dudas si comerte algo? Pregúntale a Lucy. Te recomienda una merienda específica que se ajusta a lo que queda de tus macros del día. ¿No te gustó una comida del plan? Lucy te la cambia al instante.</Bullet>
            <Bullet><strong>Lista de compras semanal automática.</strong> Organizada por sección del supermercado (proteínas, vegetales, lácteos, granos). Entras, compras, sales. No piensas.</Bullet>
            <Bullet><strong>Cero tracking manual de lo que comes.</strong> Olvídate de pesar, medir, fotografiar platos, tachar casillas, sentirte culpable. Lucy asume que sigues el plan. Si un día te comiste pizza en un cumpleaños, mañana arrancas limpio — sin drama.</Bullet>
            <Bullet><strong>Recalculación automática cuando tu cuerpo cambia.</strong> ¿Bajaste 15 libras? Aprietas un botón y Lucy te recalcula las cantidades ajustadas a tu nuevo peso, con los mismos alimentos que ya te gustan. Sin rehacer el plan desde cero.</Bullet>
            <Bullet><strong>Swaps instantáneos cuando quieres variar.</strong> &ldquo;Cambia el pollo de la cena por salmón.&rdquo; Listo. Lucy recalcula la cantidad del salmón para mantener tus macros en target.</Bullet>
            <Bullet><strong>Recetas con los alimentos de tu plan.</strong> &ldquo;Dame una receta rápida con el pollo y el arroz que tengo programado para hoy.&rdquo; Lucy te la genera en 10 segundos — con ingredientes y paso a paso.</Bullet>
            <Bullet><strong>Plan que se regenera cada semana.</strong> Las combinaciones rotan automáticamente. No te aburres de comer lo mismo. Siempre hay algo nuevo dentro de lo que ya sabes que te gusta.</Bullet>
            <Bullet><strong>Una sola app. Cero complicaciones técnicas.</strong> No necesitas Apple Watch. No necesitas Fitbit. No necesitas conectar 5 cosas distintas. Abres Lucy, ves qué toca, comes. Hecho.</Bullet>
          </div>

          <div style={{ marginTop: 50 }}>
            <CtaButton text="Quiero Empezar — $297 por 1 año" />
          </div>
        </div>
      </section>

      {/* ═══ SECTION 8: BONUS STACK ═══ */}
      <section style={{ background: '#F8F7FC', padding: '100px 0' }} className="landing-section">
        <div style={container}>
          <h2 style={{ fontSize: 42, fontWeight: 700, textAlign: 'center', marginBottom: 8 }} className="landing-h2">
            Y cuando te inscribes hoy, también recibes 2 regalos
          </h2>
          <p style={{ textAlign: 'center', fontSize: 20, color: '#555', marginBottom: 40 }}>Valor total de los bonos: $84 — incluidos gratis con Lucy</p>

          {/* Bonus 1 */}
          <div style={{ background: '#FFF', borderRadius: 16, padding: 40, marginBottom: 30, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 40, alignItems: 'center' }} className="landing-bonus-card">
            <figure style={{ perspective: 800, display: 'flex', justifyContent: 'center' }} aria-label="Libro El Método de Activación Metabólica por Coach Abner">
              <div className="book-mockup" style={{
                width: 200,
                height: 280,
                position: 'relative',
                transformStyle: 'preserve-3d',
                transform: 'rotateY(-20deg) rotateX(2deg)',
                transition: 'transform 300ms ease',
              }}>
                {/* Front cover */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(135deg, #2D2B45 0%, #1a1932 100%)',
                  borderRadius: '4px 12px 12px 4px',
                  padding: '32px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '6px 6px 20px rgba(45,43,69,0.4)',
                  backfaceVisibility: 'hidden',
                  overflow: 'hidden',
                }}>
                  {/* Decorative line */}
                  <div style={{ width: '40%', height: 3, background: '#7B7FC4', borderRadius: 2, marginBottom: 16 }} />
                  {/* Title */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <p style={{ color: '#7B7FC4', fontSize: 10, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>El Método de</p>
                    <h4 className="font-logo" style={{ color: '#F8F7FC', fontSize: 22, lineHeight: 1.2, marginBottom: 16 }}>Activación Metabólica</h4>
                    <div style={{ width: '30%', height: 2, background: '#7B7FC4', borderRadius: 2 }} />
                  </div>
                  {/* Author */}
                  <div>
                    <p style={{ color: '#B8B5E0', fontSize: 11, fontWeight: 500 }}>Coach Abner</p>
                    <p style={{ color: '#7B7FC4', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Caribeño Fit Labs</p>
                  </div>
                </div>
                {/* Spine */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 20,
                  height: '100%',
                  background: 'linear-gradient(to right, #1a1932, #2D2B45)',
                  borderRadius: '4px 0 0 4px',
                  transform: 'rotateY(90deg) translateZ(-10px) translateX(-10px)',
                  transformOrigin: 'left center',
                }} />
              </div>
              <figcaption className="sr-only">Libro digital: El Método de Activación Metabólica por Coach Abner de Caribeño Fit Labs</figcaption>
            </figure>
            <div>
              <span style={{ display: 'inline-block', background: '#7B7FC4', color: '#FFF', padding: '6px 16px', borderRadius: 6, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Valor: $47 — Hoy GRATIS</span>
              <h3 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Bono #1 — Libro &ldquo;Activación Metabólica&rdquo;</h3>
              <p>El libro que condensa la filosofía nutricional completa que uso con mis clientas de coaching 1:1.</p>
              <ul style={{ paddingLeft: 20, marginTop: 12, lineHeight: 1.8 }}>
                <li>Por qué las dietas extremas te hacen <strong>ganar más peso a largo plazo</strong></li>
                <li>Qué es el &ldquo;Interruptor Metabólico&rdquo; y cómo reactivarlo después de años de yo-yo dieting</li>
                <li>Los 5 errores que cometes sin saberlo todos los días</li>
                <li>Por qué el ejercicio no es lo que te hace bajar (y qué SÍ funciona)</li>
              </ul>
              <p style={{ marginTop: 16 }}><em>Te lo envío en PDF inmediatamente después de tu compra.</em></p>
            </div>
          </div>

          {/* Bonus 2 */}
          <div style={{ background: '#FFF', borderRadius: 16, padding: 40, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 40, alignItems: 'center' }} className="landing-bonus-card">
            <Placeholder label="[PLACEHOLDER: Mockup 3D del Recipe Book]" height={280} />
            <div>
              <span style={{ display: 'inline-block', background: '#7B7FC4', color: '#FFF', padding: '6px 16px', borderRadius: 6, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Valor: $37 — Hoy GRATIS</span>
              <h3 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Bono #2 — Recipe Book Caribeño Fit Labs</h3>
              <p>50 de mis recetas favoritas del programa — todas hechas con los alimentos que Lucy usa en tu plan. Todas con macros calculadas.</p>
              <ul style={{ paddingLeft: 20, marginTop: 12, lineHeight: 1.8 }}>
                <li>Mangú con huevo (desayuno proteico)</li>
                <li>Arroz con habichuelas revisado (menos grasa, misma sazón)</li>
                <li>Pollo al ajillo limpio</li>
                <li>Pernil en olla lenta sin guindilla</li>
                <li>Flan proteico (postre que NO te saca del plan)</li>
                <li>Y 45 recetas más</li>
              </ul>
              <p style={{ marginTop: 16 }}><em>PDF disponible inmediatamente en tu cuenta Lucy.</em></p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 9: VALUE STACK ═══ */}
      <section style={{ background: '#FFF', padding: '100px 0' }} className="landing-section">
        <div style={narrow}>
          <h2 style={{ fontSize: 42, fontWeight: 700, textAlign: 'center', marginBottom: 32 }} className="landing-h2">
            Esto es lo que te llevas hoy
          </h2>

          <div style={{ background: '#2D2B45', color: '#FFF', padding: 48, borderRadius: 16, fontFamily: "'SF Mono', Monaco, monospace", fontSize: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <span>Lucy — 1 año completo</span><span>$297</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <span>Libro &ldquo;Activación Metabólica&rdquo;</span><span>$47</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <span>Recipe Book Caribeño Fit Labs</span><span>$37</span>
            </div>
            <div style={{ borderTop: '1px dashed #888', margin: '12px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 24, fontWeight: 700, color: '#7B7FC4' }}>
              <span>Valor Total:</span><span>$381</span>
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, textAlign: 'center', marginTop: 24 }}>
              Tu precio hoy: <span style={{ color: '#7B7FC4' }}>$297</span>
            </div>
            <p style={{ textAlign: 'center', marginTop: 16, color: '#CCC' }}>Un solo pago. Sin mensualidades.</p>
          </div>

          <h3 style={{ textAlign: 'center', marginTop: 60, fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
            ¿Por qué $297 una sola vez y no $29/mes?
          </h3>
          <p style={{ textAlign: 'center', marginBottom: 30 }}>Porque odio los cobros recurrentes tanto como tú. Mira lo que pagarías con las otras opciones del mercado:</p>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 16 }}>
              <thead>
                <tr style={{ background: '#F8F7FC' }}>
                  {['Servicio', 'Costo anual', 'IA personalizada', 'Español latino'].map(h => (
                    <th key={h} style={{ padding: 16, textAlign: 'left', fontWeight: 700, borderBottom: '1px solid #EEE' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['LadyBoss Lifestyle', '$324/año recurrente', 'No', 'No'],
                  ['Noom', '~$720/año recurrente', 'Parcial', 'No'],
                  ['2B Mindset (BODi)', '$60/año (solo videos)', 'No', 'No'],
                ].map(([s, c, ai, es], i) => (
                  <tr key={i}>
                    <td style={{ padding: 16, borderBottom: '1px solid #EEE' }}>{s}</td>
                    <td style={{ padding: 16, borderBottom: '1px solid #EEE' }}>{c}</td>
                    <td style={{ padding: 16, borderBottom: '1px solid #EEE' }}>{ai}</td>
                    <td style={{ padding: 16, borderBottom: '1px solid #EEE' }}>{es}</td>
                  </tr>
                ))}
                <tr style={{ background: '#F8F7FC', fontWeight: 700 }}>
                  <td style={{ padding: 16 }}>Lucy</td>
                  <td style={{ padding: 16 }}>$297 UNA vez</td>
                  <td style={{ padding: 16 }}>Sí</td>
                  <td style={{ padding: 16 }}>Sí</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p style={{ textAlign: 'center', fontSize: 19, marginTop: 20 }}>
            Lucy es el único producto en este mercado que te da un plan personalizado con IA en español latino, te cobra una sola vez por un año completo, y no te mete en una suscripción que renueva para siempre.
          </p>

          <div style={{ marginTop: 40 }}>
            <CtaButton text="Empezar con Lucy — $297 por 1 año" large />
          </div>
        </div>
      </section>

      {/* ═══ SECTION 10: GUARANTEE ═══ */}
      <section style={{ background: '#F8F7FC', padding: '100px 0' }} className="landing-section">
        <div style={narrow}>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 40, alignItems: 'center' }} className="landing-guarantee-grid">
            <div role="img" aria-label="Garantía de 7 días sin preguntas" className="guarantee-badge" style={{ width: 200, height: 200, flexShrink: 0 }}>
              <svg viewBox="0 0 200 200" width="200" height="200" style={{ filter: 'drop-shadow(0 12px 32px rgba(123,127,196,0.25))' }}>
                {/* Scalloped outer edge */}
                <path d={(() => {
                  const cx = 100, cy = 100, r = 96, bumps = 24, depth = 6
                  let d = ''
                  for (let i = 0; i < bumps; i++) {
                    const a1 = (i / bumps) * Math.PI * 2
                    const a2 = ((i + 0.5) / bumps) * Math.PI * 2
                    const a3 = ((i + 1) / bumps) * Math.PI * 2
                    const x1 = cx + (r + depth) * Math.cos(a1)
                    const y1 = cy + (r + depth) * Math.sin(a1)
                    const x2 = cx + (r - depth) * Math.cos(a2)
                    const y2 = cy + (r - depth) * Math.sin(a2)
                    const x3 = cx + (r + depth) * Math.cos(a3)
                    const y3 = cy + (r + depth) * Math.sin(a3)
                    if (i === 0) d += `M ${x1} ${y1} `
                    d += `Q ${x2} ${y2} ${x3} ${y3} `
                  }
                  return d + 'Z'
                })()} fill="#7B7FC4" />
                {/* Inner circle */}
                <circle cx="100" cy="100" r="82" fill="none" stroke="#F8F7FC" strokeWidth="2" opacity="0.5" />
                <circle cx="100" cy="100" r="76" fill="none" stroke="#F8F7FC" strokeWidth="1" opacity="0.3" />
                {/* Text */}
                <text x="100" y="72" textAnchor="middle" fill="#FFFFFF" fontSize="12" fontWeight="600" letterSpacing="0.1em">GARANTÍA</text>
                <text x="100" y="112" textAnchor="middle" fill="#FFFFFF" fontSize="36" fontWeight="700" letterSpacing="-0.02em">7 DÍAS</text>
                <text x="100" y="134" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="600" letterSpacing="0.1em">SIN PREGUNTAS</text>
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: 42, fontWeight: 700, marginBottom: 16 }} className="landing-h2">La Garantía Caribeña — 7 días, sin preguntas</h2>
              <p>Prueba Lucy por 7 días completos. Genera tu plan. Úsalo. Chatea con Lucy cuantas veces quieras.</p>
              <p>Si en esos 7 días <strong>no sientes que por fin tienes claridad</strong> sobre qué comer — si no sientes que por fin alguien te está diciendo las cantidades exactas para tu cuerpo — me escribes directamente a mi email personal y te devuelvo cada centavo de tus $297.</p>
              <p><strong>Y te quedas con el libro y el recipe book.</strong> Completos. Gratis. Por haberle dado la oportunidad a Lucy.</p>
              <p>Sin preguntas. Sin formularios largos. Sin &ldquo;háblame con un representante&rdquo;. Un email y tu dinero de regreso.</p>
              <p style={{ fontStyle: 'italic', marginTop: 24 }}>— Abner</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 11: PRICING ═══ */}
      <section style={{ background: '#FFF', padding: '100px 0', textAlign: 'center' }} className="landing-section">
        <div style={narrow}>
          <h2 style={{ fontSize: 42, fontWeight: 700, marginBottom: 32 }} className="landing-h2">
            Por $297 recibes todo esto:
          </h2>

          <ul style={{ maxWidth: 600, margin: '0 auto 40px', textAlign: 'left', listStyle: 'none', padding: 0 }}>
            {[
              'Acceso a Lucy durante 1 año completo',
              'Plan nutricional personalizado de 7 días, renovable cada semana',
              'Chat AI 24/7 para ajustes, swaps, recetas, meriendas',
              'Lista de compras automática',
              'Libro "Activación Metabólica" (valor $47)',
              'Recipe Book Caribeño Fit Labs (valor $37)',
              'Garantía de 7 días sin preguntas',
            ].map((item, i) => (
              <li key={i} style={{ padding: '12px 0', fontSize: 19, display: 'flex', gap: 12 }}>
                <span>✅</span> {item}
              </li>
            ))}
          </ul>

          <CtaButton text="Empezar Ahora — $297" large />

          <p style={{ marginTop: 16, fontSize: 14, color: '#555' }}>
            🔒 Pago seguro por Stripe &bull; Tarjeta de crédito o débito
          </p>
        </div>
      </section>

      {/* ═══ SECTION 12: FAQ ═══ */}
      <section style={{ background: '#F8F7FC', padding: '100px 0' }} className="landing-section">
        <div style={narrow}>
          <h2 style={{ fontSize: 42, fontWeight: 700, textAlign: 'center', marginBottom: 32 }} className="landing-h2">
            Preguntas frecuentes
          </h2>

          <FaqItem question="¿Necesito experiencia con apps para usar Lucy?" answer="No. Si sabes usar WhatsApp, sabes usar Lucy. Te hace 6 preguntas en el onboarding y te entrega tu plan. El resto es abrir la app, ver qué toca hoy, comer." />
          <FaqItem question="¿Qué pasa después del año?" answer="Tu plan sigue funcionando en tu dispositivo y puedes renovar si quieres. <strong>No hay cobros automáticos.</strong> Tú decides si renuevas o no. Este es el diferencial más grande vs. otras apps que te meten en suscripción que renueva para siempre." />
          <FaqItem question="¿Funciona si vivo en Puerto Rico o en Estados Unidos?" answer="Ambos. Los alimentos del catálogo están disponibles en los dos mercados. Si vives en Orlando o en Ponce, encuentras lo mismo." />
          <FaqItem question="¿Y si tengo alergias o restricciones (vegetariana, sin gluten)?" answer="Lucy te deja eliminar cualquier alimento que no quieras. Si eres vegetariana, le quitas las proteínas animales y Lucy usa fuentes vegetales (huevo, queso, legumbres). Si tienes alergia a algo específico, lo sacas del catálogo y no aparece en tu plan." />
          <FaqItem question="¿Lucy reemplaza a mi médico o nutricionista?" answer="No. Lucy no diagnostica, no prescribe, no reemplaza cuidado médico. Es una herramienta de planificación nutricional basada en la fórmula Mifflin-St Jeor — el mismo estándar usado por nutricionistas profesionales. Si tienes condiciones médicas, consulta con tu médico antes de empezar cualquier plan." />
          <FaqItem question="¿Puedo usar Lucy si estoy embarazada?" answer="Todavía no. Lucy no está diseñada para embarazadas. Espera el posparto si estás en esa etapa." />
          <FaqItem question="¿Se puede acceder desde computadora o solo teléfono?" answer="Lucy funciona en cualquier dispositivo con internet — teléfono, tablet, computadora. Abres un navegador y listo." />
          <FaqItem question="¿Qué pasa si no me gusta el plan que me arma?" answer="Puedes cambiar cualquier alimento individual desde el chat con Lucy. O puedes regenerar el plan completo con alimentos diferentes cuantas veces quieras." />
        </div>
      </section>

      {/* ═══ P.S. SECTION ═══ */}
      <section style={{ background: '#2D2B45', color: '#FFF', padding: '80px 0' }}>
        <div style={narrow}>
          <h2 style={{ fontSize: 42, fontWeight: 700, color: '#FFF', marginBottom: 24 }} className="landing-h2">P.S.</h2>
          <p style={{ fontSize: 20 }}>Si leíste hasta acá, déjame ser directo contigo:</p>
          <p style={{ fontSize: 20 }}>Tú y yo sabemos que el problema nunca fue que te falta disciplina.</p>
          <p style={{ fontSize: 20 }}>El problema es que nadie te ha dado un sistema que funcione para <strong>tu cuerpo, tu cultura, tu vida real</strong> como mujer profesional latina.</p>
          <p style={{ fontSize: 20 }}>Lucy es ese sistema. <strong>$297 por un año completo.</strong> Si en 7 días no sientes que por fin tienes claridad — te devuelvo tu dinero y te quedas con los bonos.</p>
          <p style={{ fontSize: 20 }}>Aprieta el botón. Te veo del otro lado.</p>
          <p style={{ fontStyle: 'italic', marginTop: 32 }}>— Abner<br/>CEO, Caribeño Fit Labs</p>

          <div style={{ marginTop: 40 }}>
            <CtaButton text="Empezar con Lucy — $297" large />
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ background: '#1a1a2e', color: '#AAA', padding: '40px 0', textAlign: 'center', fontSize: 14 }}>
        <div style={container}>
          <p>© 2026 Caribeño Fit Labs. Todos los derechos reservados.</p>
          <p style={{ marginTop: 8 }}>Lucy es una herramienta de planificación nutricional. No sustituye consejo médico profesional.</p>
        </div>
      </footer>

      {/* ═══ RESPONSIVE STYLES ═══ */}
      <style>{`
        @media (max-width: 768px) {
          .landing-logo { font-size: 44px !important; }
          .landing-nav-btn { padding: 8px 16px !important; font-size: 13px !important; }
          .iphone-mockup { width: 240px !important; height: 496px !important; border-radius: 44px !important; padding: 10px !important; }
          .landing-h1 { font-size: 36px !important; }
          .landing-h2 { font-size: 28px !important; }
          .hero-intro { font-size: 18px !important; }
          .hero-bullet { font-size: 16px !important; }
          .hero-sin { font-size: 14px !important; }
          .pain-prose { font-size: 16px !important; }
          .pain-h3 { font-size: 20px !important; }
          .pain-card { padding: 24px !important; }
          .pain-card-bold { font-size: 20px !important; }
          .pain-anchor { font-size: 48px !important; margin: 32px 0 !important; }
          .origin-h3 { font-size: 28px !important; }
          .origin-h3-sm { font-size: 18px !important; }
          .origin-prose { font-size: 16px !important; }
          .origin-stat-grid { grid-template-columns: 1fr !important; padding: 24px !important; }
          .origin-stat-num { font-size: 36px !important; }
          .origin-areas { flex-wrap: wrap !important; gap: 12px !important; justify-content: center !important; }
          .origin-area-label { font-size: 14px !important; }
          .origin-dramatic-intro { font-size: 22px !important; }
          .origin-nutricion { font-size: 56px !important; }
          .origin-callout { padding: 24px !important; }
          .origin-callout-bold { font-size: 18px !important; }
          .origin-photo-wrap { position: static !important; max-width: 400px; margin: 0 auto; }
          .origin-firma { text-align: center !important; }
          .landing-section { padding: 60px 0 !important; }
          .landing-hero-grid,
          .landing-origin-grid,
          .landing-testimonial-grid,
          .landing-mechanism-grid,
          .landing-bullet-grid,
          .landing-bonus-card,
          .landing-guarantee-grid {
            grid-template-columns: 1fr !important;
            gap: 30px !important;
          }
          .book-mockup { transform: rotateY(-15deg) rotateX(2deg) scale(0.85) !important; }
          .guarantee-badge { width: 160px !important; height: 160px !important; margin: 0 auto; }
          .guarantee-badge svg { width: 160px !important; height: 160px !important; }
        }
        .book-mockup:hover { transform: rotateY(-25deg) rotateX(2deg) !important; }
      `}</style>
    </div>
  )
}
