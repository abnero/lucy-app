'use client'

import { useState, useRef } from 'react'

type Meta = 'perder' | 'mantener' | 'ganar'

interface Inputs {
  peso: number
  pies: number
  pulgadas: number
  edad: number
  q1: number
  q2: number
  q3: number
  meta: Meta
}

interface Resultado {
  calorias: number
  proteina: number
  carbs: number
  grasas: number
}

export default function MacrosPage() {
  const [step, setStep] = useState(1)
  const [peso, setPeso] = useState('')
  const [pies, setPies] = useState('')
  const [pulgadas, setPulgadas] = useState('')
  const [edad, setEdad] = useState('')
  const [q1, setQ1] = useState<number | null>(null)
  const [q2, setQ2] = useState<number | null>(null)
  const [q3, setQ3] = useState<number | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [err, setErr] = useState('')
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [email, setEmail] = useState('')
  const [emailErr, setEmailErr] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [sending, setSending] = useState(false)
  const inputsRef = useRef<Inputs | null>(null)

  function goTo(n: number) {
    setStep(n)
    setErr('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function next1() {
    const p = parseFloat(peso)
    const ft = parseInt(pies)
    const inch = parseInt(pulgadas)
    const e = parseInt(edad)
    if (!(p >= 60 && p <= 500 && ft >= 3 && ft <= 7 && inch >= 0 && inch <= 11 && e >= 18 && e <= 90)) {
      setErr('Completa todos los campos con valores válidos.')
      return
    }
    setErr('')
    goTo(2)
  }

  function next2() {
    if (q1 === null || q2 === null || q3 === null) {
      setErr('Contesta las tres preguntas.')
      return
    }
    setErr('')
    goTo(3)
  }

  function calcular() {
    if (!meta) {
      setErr('Elige una meta.')
      return
    }
    setErr('')

    const pesoNum = parseFloat(peso)
    const piesNum = parseInt(pies)
    const pulgadasNum = parseInt(pulgadas)
    const edadNum = parseInt(edad)

    // Conversiones imperiales -> métrico
    const pesoKg = pesoNum * 0.453592
    const alturaCm = ((piesNum * 12) + pulgadasNum) * 2.54

    // BMR Mifflin-St Jeor, offset femenino -161
    const bmr = (10 * pesoKg) + (6.25 * alturaCm) - (5 * edadNum) - 161

    // Nivel de actividad
    const score = q1! + q2! + q3!
    let factor: number
    if (score <= 2) factor = 1.2
    else if (score <= 4) factor = 1.3
    else factor = 1.4
    const tdee = bmr * factor

    // Meta
    let kcal: number
    if (meta === 'perder') kcal = Math.max(tdee * 0.85, 1200)
    else if (meta === 'ganar') kcal = tdee * 1.20
    else kcal = tdee * 1.00

    // Split fijo 30/40/30
    const prot = (kcal * 0.30) / 4
    const carb = (kcal * 0.40) / 4
    const fat = (kcal * 0.30) / 9

    const res = {
      calorias: Math.round(kcal),
      proteina: Math.round(prot),
      carbs: Math.round(carb),
      grasas: Math.round(fat),
    }
    setResultado(res)
    inputsRef.current = { peso: pesoNum, pies: piesNum, pulgadas: pulgadasNum, edad: edadNum, q1: q1!, q2: q2!, q3: q3!, meta }
    goTo(4)
  }

  async function enviarEmail() {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    if (!valid) { setEmailErr('Escribe un email válido.'); return }
    setEmailErr('')
    setSending(true)

    try {
      await fetch('/api/macros-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), inputs: inputsRef.current, resultado }),
      })
      setEmailSent(true)
    } catch {
      setEmailSent(true) // Don't block UX on failure
    } finally {
      setSending(false)
    }
  }

  function reiniciar() {
    setPeso(''); setPies(''); setPulgadas(''); setEdad('')
    setQ1(null); setQ2(null); setQ3(null); setMeta(null)
    setResultado(null); setEmail(''); setEmailSent(false); setErr('')
    goTo(1)
  }

  const insight = resultado && meta ? (
    meta === 'perder'
      ? <>Para perder peso de forma sostenible, tu cuerpo necesita alrededor de <strong>{resultado.calorias.toLocaleString('es-PR')} calorías</strong> al día con <strong>{resultado.proteina}g de proteína</strong>. La proteína es lo que protege tu músculo mientras bajas grasa — por eso es la que más cuesta cumplir.</>
      : meta === 'ganar'
      ? <>Para construir músculo, tu cuerpo necesita alrededor de <strong>{resultado.calorias.toLocaleString('es-PR')} calorías</strong> al día y <strong>{resultado.proteina}g de proteína</strong>. El reto no es comer más — es comer suficiente proteína de forma constante.</>
      : <>Para mantenerte donde estás, tu cuerpo necesita alrededor de <strong>{resultado.calorias.toLocaleString('es-PR')} calorías</strong> al día con <strong>{resultado.proteina}g de proteína</strong>. Mantener no es no hacer nada — es hacerlo con estructura.</>
  ) : null

  function OptGroup({ group, value, onChange, options }: {
    group: string; value: number | null; onChange: (v: number) => void;
    options: { val: number; main: string; desc: string }[]
  }) {
    return (
      <div className="mc-opts">
        {options.map(o => (
          <button key={`${group}-${o.val}`} type="button" className={`mc-opt${value === o.val ? ' sel' : ''}`} onClick={() => onChange(o.val)}>
            <span className="mc-dot" /><span className="mc-opt-txt"><span className="mc-opt-main">{o.main}</span><span className="mc-opt-desc">{o.desc}</span></span>
          </button>
        ))}
      </div>
    )
  }

  function MetaGroup() {
    const options: { val: Meta; main: string; desc: string }[] = [
      { val: 'perder', main: 'Perder peso', desc: 'Bajar grasa de forma sostenible' },
      { val: 'mantener', main: 'Mantener mi peso', desc: 'Sentirme bien donde estoy' },
      { val: 'ganar', main: 'Ganar masa muscular', desc: 'Construir músculo y fuerza' },
    ]
    return (
      <div className="mc-opts">
        {options.map(o => (
          <button key={o.val} type="button" className={`mc-opt${meta === o.val ? ' sel' : ''}`} onClick={() => setMeta(o.val)}>
            <span className="mc-dot" /><span className="mc-opt-txt"><span className="mc-opt-main">{o.main}</span><span className="mc-opt-desc">{o.desc}</span></span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="mc-wrap">
        <header className="mc-header">
          <span className="mc-logo">Lucy</span>
          <h1 className="mc-h1">¿Cuánto necesita comer <span className="mc-em">tu cuerpo</span>?</h1>
          <p className="mc-sub">Calcula tus calorías y macros diarios en un minuto. Hecho para mujeres que están cansadas de adivinar.</p>
        </header>

        <div className="mc-card">
          {/* Progress */}
          <div className="mc-steps">
            {[1,2,3,4].map(i => <div key={i} className={`mc-step-bar${i <= step ? ' active' : ''}`} />)}
          </div>

          {/* Step 1 */}
          {step === 1 && (
            <div className="mc-screen">
              <div className="mc-step-label">Paso 1 de 4</div>
              <div className="mc-step-title">Cuéntanos de ti</div>

              <div className="mc-field">
                <label className="mc-fld">Tu peso</label>
                <div className="mc-input-row">
                  <input type="number" value={peso} onChange={e => setPeso(e.target.value)} placeholder="160" min={60} max={500} inputMode="decimal" className="mc-input" />
                  <div className="mc-unit">lbs</div>
                </div>
              </div>

              <div className="mc-field">
                <label className="mc-fld">Tu estatura</label>
                <div className="mc-input-row">
                  <input type="number" value={pies} onChange={e => setPies(e.target.value)} placeholder="5" min={3} max={7} inputMode="numeric" className="mc-input" />
                  <div className="mc-unit">pies</div>
                  <input type="number" value={pulgadas} onChange={e => setPulgadas(e.target.value)} placeholder="4" min={0} max={11} inputMode="numeric" className="mc-input" />
                  <div className="mc-unit">pulg</div>
                </div>
              </div>

              <div className="mc-field">
                <label className="mc-fld">Tu edad</label>
                <div className="mc-input-row">
                  <input type="number" value={edad} onChange={e => setEdad(e.target.value)} placeholder="42" min={18} max={90} inputMode="numeric" className="mc-input" />
                  <div className="mc-unit">años</div>
                </div>
              </div>

              {err && <div className="mc-err">{err}</div>}
              <div className="mc-nav-row"><button className="mc-btn mc-btn-primary" onClick={next1}>Continuar</button></div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="mc-screen">
              <div className="mc-step-label">Paso 2 de 4</div>
              <div className="mc-step-title">¿Cómo es tu día?</div>

              <div className="mc-field">
                <label className="mc-fld">La mayor parte del día estás...</label>
                <OptGroup group="q1" value={q1} onChange={setQ1} options={[
                  { val: 0, main: 'Sentada', desc: 'Escritorio, manejando, reuniones' },
                  { val: 1, main: 'Mitad y mitad', desc: 'Te paras y te mueves a ratos' },
                  { val: 2, main: 'De pie o moviéndote', desc: 'Casi nunca estás sentada' },
                ]} />
              </div>

              <div className="mc-field">
                <label className="mc-fld">Fuera del trabajo, ¿te mueves?</label>
                <OptGroup group="q2" value={q2} onChange={setQ2} options={[
                  { val: 0, main: 'Poco', desc: 'Descanso tranquilo' },
                  { val: 1, main: 'Algo', desc: 'Caminatas, mandados, casa' },
                  { val: 2, main: 'Bastante', desc: 'Siempre activa' },
                ]} />
              </div>

              <div className="mc-field">
                <label className="mc-fld">¿Haces ejercicio a la semana?</label>
                <OptGroup group="q3" value={q3} onChange={setQ3} options={[
                  { val: 0, main: 'Casi nunca', desc: '0 a 1 vez' },
                  { val: 1, main: 'A veces', desc: '2 a 3 veces' },
                  { val: 2, main: 'Seguido', desc: '4 veces o más' },
                ]} />
              </div>

              {err && <div className="mc-err">{err}</div>}
              <div className="mc-nav-row">
                <button className="mc-btn mc-btn-back" onClick={() => goTo(1)}>Atrás</button>
                <button className="mc-btn mc-btn-primary" onClick={next2}>Continuar</button>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="mc-screen">
              <div className="mc-step-label">Paso 3 de 4</div>
              <div className="mc-step-title">¿Qué quieres lograr?</div>
              <div className="mc-field"><MetaGroup /></div>
              {err && <div className="mc-err">{err}</div>}
              <div className="mc-nav-row">
                <button className="mc-btn mc-btn-back" onClick={() => goTo(2)}>Atrás</button>
                <button className="mc-btn mc-btn-primary" onClick={calcular}>Ver mis resultados</button>
              </div>
            </div>
          )}

          {/* Step 4: Results */}
          {step === 4 && resultado && (
            <div className="mc-screen">
              <div className="mc-res-head">
                <div className="mc-step-label">Tus resultados</div>
                <h2>Esto es lo que tu cuerpo necesita</h2>
                <p>Calculado con la misma fórmula que usa Lucy</p>
              </div>

              <div className="mc-kcal-hero">
                <div className="mc-kcal-num">{resultado.calorias.toLocaleString('es-PR')}</div>
                <div className="mc-kcal-lbl">calorías por día</div>
              </div>

              <div className="mc-macro-grid">
                <div className="mc-macro mc-prot">
                  <div><span className="mc-m-num">{resultado.proteina}</span><span className="mc-m-unit">g</span></div>
                  <div className="mc-m-name">Proteína</div>
                </div>
                <div className="mc-macro mc-carb">
                  <div><span className="mc-m-num">{resultado.carbs}</span><span className="mc-m-unit">g</span></div>
                  <div className="mc-m-name">Carbos</div>
                </div>
                <div className="mc-macro mc-fat">
                  <div><span className="mc-m-num">{resultado.grasas}</span><span className="mc-m-unit">g</span></div>
                  <div className="mc-m-name">Grasa</div>
                </div>
              </div>

              <div className="mc-insight">{insight}</div>

              {/* Email capture */}
              {!emailSent ? (
                <div className="mc-capture">
                  <h3>Guarda tus resultados</h3>
                  <p>Te los enviamos por email para que no se te pierdan, junto con un próximo paso para ponerlos en práctica.</p>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" className="mc-email-input" />
                  {emailErr && <div className="mc-err">{emailErr}</div>}
                  <button className="mc-btn mc-btn-primary" style={{ marginTop: 10 }} onClick={enviarEmail} disabled={sending}>
                    {sending ? 'Enviando...' : 'Enviar mis resultados'}
                  </button>
                  <div className="mc-fineprint">Sin spam. Solo lo que de verdad te sirve.</div>
                </div>
              ) : (
                <div className="mc-capture-done">✓ Listo — revisa tu correo en un momento.</div>
              )}

              {/* Lucy CTA */}
              <div className="mc-lucy-cta">
                <span className="mc-logo" style={{ color: '#FFF' }}>Lucy</span>
                <h3>Ya sabes el cuánto. Lucy te da el qué.</h3>
                <p>Saber tus números es el primer 10%. Lucy te arma cada día qué comer y en qué cantidad para llegar a ellos — sin que tengas que pensar ni contar nada.</p>
                <button className="mc-btn mc-btn-primary" onClick={() => window.location.href = '/lucy'}>Conoce a Lucy</button>
              </div>

              <div className="mc-restart">
                <button onClick={reiniciar}>Calcular de nuevo</button>
              </div>
            </div>
          )}
        </div>

        <footer className="mc-footer">
          Esta calculadora ofrece estimaciones generales y no sustituye consejo médico o nutricional profesional.
          <div className="mc-powered">
            <span>Powered by</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/caribeno-fit-labs.png" alt="Caribeño Fit Labs" className="mc-powered-logo" />
            <span>Caribeño Fit Labs</span>
          </div>
        </footer>
      </div>

      <style>{`
        .mc-wrap { max-width: 560px; margin: 0 auto; padding: 32px 20px 80px; }
        .mc-header { text-align: center; margin-bottom: 36px; }
        .mc-logo { font-family: Georgia, 'Times New Roman', serif; color: #2D2B45; font-size: 40px; letter-spacing: -0.01em; display: inline-block; margin-bottom: 28px; }
        .mc-h1 { font-size: 33px; font-weight: 700; line-height: 1.25; letter-spacing: -0.02em; margin-bottom: 12px; color: #2D2B45; }
        .mc-em { color: #7B7FC4; }
        .mc-sub { font-size: 16px; color: #6B6982; max-width: 420px; margin: 0 auto; }
        .mc-card { background: #FFF; border-radius: 20px; box-shadow: 0 4px 24px rgba(45,43,69,0.07); padding: 28px 24px; }
        .mc-steps { display: flex; gap: 6px; margin-bottom: 28px; }
        .mc-step-bar { flex: 1; height: 4px; border-radius: 4px; background: #B8B5E0; opacity: 0.4; transition: opacity 0.3s, background 0.3s; }
        .mc-step-bar.active { opacity: 1; background: #7B7FC4; }
        .mc-step-label { font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #7B7FC4; margin-bottom: 6px; }
        .mc-step-title { font-size: 21px; font-weight: 600; margin-bottom: 22px; letter-spacing: -0.01em; color: #2D2B45; }
        .mc-screen { animation: mc-fade 0.32s ease; }
        @keyframes mc-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .mc-field { margin-bottom: 20px; }
        .mc-fld { display: block; font-size: 14px; font-weight: 500; margin-bottom: 8px; color: #2D2B45; }
        .mc-input-row { display: flex; gap: 10px; }
        .mc-input { width: 100%; font-family: inherit; font-size: 16px; color: #2D2B45; padding: 13px 14px; border: 1.5px solid #E6E4F0; border-radius: 11px; background: #F8F7FC; transition: border-color 0.2s; -moz-appearance: textfield; }
        .mc-input::-webkit-outer-spin-button, .mc-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .mc-input:focus { outline: none; border-color: #7B7FC4; background: #FFF; }
        .mc-unit { display: flex; align-items: center; justify-content: center; min-width: 54px; font-size: 14px; font-weight: 500; color: #8C8AA3; background: #F8F7FC; border: 1.5px solid #E6E4F0; border-radius: 11px; }
        .mc-email-input { width: 100%; font-family: inherit; font-size: 16px; color: #2D2B45; padding: 13px 14px; border: 1.5px solid #E6E4F0; border-radius: 11px; background: #F8F7FC; transition: border-color 0.2s; }
        .mc-email-input:focus { outline: none; border-color: #7B7FC4; background: #FFF; }
        .mc-opts { display: flex; flex-direction: column; gap: 10px; }
        .mc-opt { display: flex; align-items: center; gap: 13px; padding: 14px 16px; border: 1.5px solid #E6E4F0; border-radius: 12px; background: #F8F7FC; cursor: pointer; transition: border-color 0.18s, background 0.18s; text-align: left; font-family: inherit; font-size: inherit; color: inherit; width: 100%; }
        .mc-opt:hover { border-color: #B8B5E0; }
        .mc-opt.sel { border-color: #7B7FC4; background: #F1F0FA; }
        .mc-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #CFCDE0; flex-shrink: 0; position: relative; transition: border-color 0.18s; }
        .mc-opt.sel .mc-dot { border-color: #7B7FC4; }
        .mc-opt.sel .mc-dot::after { content: ''; position: absolute; inset: 3px; border-radius: 50%; background: #7B7FC4; }
        .mc-opt-txt { display: flex; flex-direction: column; }
        .mc-opt-main { font-size: 15px; font-weight: 500; }
        .mc-opt-desc { font-size: 13px; color: #8C8AA3; }
        .mc-btn { width: 100%; font-family: inherit; font-size: 16px; font-weight: 600; padding: 15px; border-radius: 12px; border: none; cursor: pointer; transition: background 0.18s, transform 0.05s; }
        .mc-btn-primary { background: #7B7FC4; color: #FFF; }
        .mc-btn-primary:hover { background: #5F63A8; }
        .mc-btn-primary:active { transform: scale(0.99); }
        .mc-btn-primary:disabled { background: #B8B5E0; cursor: not-allowed; }
        .mc-btn-back { flex: 0 0 auto; background: #F8F7FC; color: #2D2B45; border: 1.5px solid #E6E4F0; }
        .mc-btn-back:hover { border-color: #B8B5E0; }
        .mc-nav-row { display: flex; gap: 10px; margin-top: 24px; }
        .mc-nav-row .mc-btn { width: auto; flex: 1; }
        .mc-err { font-size: 13px; color: #C4546B; margin-top: 8px; }
        .mc-res-head { text-align: center; margin-bottom: 26px; }
        .mc-res-head h2 { font-size: 25px; font-weight: 700; letter-spacing: -0.015em; margin-bottom: 8px; color: #2D2B45; }
        .mc-res-head p { font-size: 14px; color: #6B6982; }
        .mc-kcal-hero { text-align: center; background: linear-gradient(150deg, #F1F0FA 0%, #E9E7F6 100%); border-radius: 16px; padding: 26px 20px; margin-bottom: 16px; }
        .mc-kcal-num { font-size: 52px; font-weight: 700; line-height: 1; letter-spacing: -0.03em; color: #5F63A8; }
        .mc-kcal-lbl { font-size: 14px; font-weight: 500; color: #6B6982; margin-top: 6px; }
        .mc-macro-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 22px; }
        .mc-macro { background: #F8F7FC; border-radius: 13px; padding: 16px 10px; text-align: center; }
        .mc-m-num { font-size: 27px; font-weight: 700; letter-spacing: -0.02em; color: #2D2B45; }
        .mc-m-unit { font-size: 13px; font-weight: 500; color: #8C8AA3; }
        .mc-m-name { font-size: 13px; font-weight: 600; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.03em; }
        .mc-prot .mc-m-name { color: #7B7FC4; }
        .mc-carb .mc-m-name { color: #C99A4B; }
        .mc-fat .mc-m-name { color: #6BA88C; }
        .mc-insight { font-size: 14px; color: #6B6982; background: #FBFAFE; border-left: 3px solid #B8B5E0; padding: 13px 15px; border-radius: 8px; margin-bottom: 24px; line-height: 1.6; }
        .mc-insight strong { color: #2D2B45; font-weight: 600; }
        .mc-capture { border-top: 1px solid #EEEDF5; padding-top: 22px; margin-bottom: 22px; }
        .mc-capture h3 { font-size: 17px; font-weight: 600; margin-bottom: 5px; color: #2D2B45; }
        .mc-capture p { font-size: 14px; color: #6B6982; margin-bottom: 14px; }
        .mc-fineprint { font-size: 12px; color: #9C9AB0; text-align: center; margin-top: 10px; }
        .mc-capture-done { text-align: center; font-size: 14px; color: #6BA88C; font-weight: 500; padding: 8px 0; margin-bottom: 22px; border-top: 1px solid #EEEDF5; padding-top: 22px; }
        .mc-lucy-cta { background: #2D2B45; border-radius: 16px; padding: 26px 22px; text-align: center; color: #FFF; }
        .mc-lucy-cta h3 { font-size: 19px; font-weight: 600; line-height: 1.35; margin-bottom: 8px; }
        .mc-lucy-cta p { font-size: 14px; color: #C7C5DA; margin-bottom: 18px; }
        .mc-lucy-cta .mc-btn-primary { background: #7B7FC4; }
        .mc-lucy-cta .mc-btn-primary:hover { background: #5F63A8; }
        .mc-restart { text-align: center; margin-top: 20px; }
        .mc-restart button { background: none; border: none; font-family: inherit; font-size: 14px; color: #8C8AA3; cursor: pointer; text-decoration: underline; }
        .mc-restart button:hover { color: #7B7FC4; }
        .mc-footer { text-align: center; font-size: 12px; color: #9C9AB0; margin-top: 32px; line-height: 1.7; }
        .mc-powered { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 12px; }
        .mc-powered span { font-size: 11px; color: #9C9AB0; }
        .mc-powered-logo { height: 24px; }
        @media (max-width: 480px) {
          .mc-h1 { font-size: 27px; }
          .mc-card { padding: 24px 18px; }
          .mc-kcal-num { font-size: 44px; }
          .mc-m-num { font-size: 23px; }
        }
      `}</style>
    </>
  )
}
