'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'

const COLORS: Record<string, string> = {
  'Sin Materiales': '#E0602F',
  'Con Dumbbells': '#2F73B0',
  'Gimnasio': '#2FA866',
}

interface Ejercicio {
  bloque: string
  obj: string
  ej: string
  sets: string
  reps: string
  desc: string
  video: string
  vid: string
}

interface Dia {
  dia: string
  ej: Ejercicio[]
}

interface Nivel {
  nivel: string
  dias: Dia[]
}

interface Rutina {
  rutina: string
  sub: string
  niveles: Nivel[]
}

function VideoSlot({ vid, isOpen, onToggle }: { vid: string; isOpen: boolean; onToggle: () => void }) {
  const [error, setError] = useState(false)

  if (isOpen) {
    return (
      <>
        <div className="rt-play" onClick={onToggle}>
          <div className="rt-ico">✕</div>
          <div className="rt-txt">Cerrar video</div>
        </div>
        <div className="rt-videobox">
          {!error ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${vid}?rel=0&playsinline=1&modestbranding=1`}
              allow="accelerometer;encrypted-media;gyroscope;picture-in-picture"
              allowFullScreen
              onError={() => setError(true)}
            />
          ) : null}
          {error && (
            <div className="rt-fallback">
              <a
                href={`https://www.youtube.com/watch?v=${vid}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ábrelo en YouTube
              </a>
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="rt-play" onClick={onToggle}>
      <div className="rt-ico">▶</div>
      <div className="rt-txt">Ver demostración en video</div>
    </div>
  )
}

function RutinasContent({ data }: { data: Rutina[] }) {
  const [envIdx, setEnvIdx] = useState(0)
  const [lvlIdx, setLvlIdx] = useState(0)
  // Key of the single active video: "diaIdx-ejIdx" or null
  const [activeVideo, setActiveVideo] = useState<string | null>(null)

  const r = data[envIdx]
  const color = COLORS[r.rutina]
  const lv = r.niveles[lvlIdx]

  const handleEnv = useCallback((i: number) => {
    setEnvIdx(i)
    setLvlIdx(0)
    setActiveVideo(null)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [])

  const handleLvl = useCallback((i: number) => {
    setLvlIdx(i)
    setActiveVideo(null)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [])

  return (
    <>
      {/* HERO */}
      <div className="rt-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="rt-hero-logo" src="/caribeno-fit-labs.png" alt="Caribeño Fit Labs" />
        <div className="rt-kick">CARIBEÑO FIT LABS</div>
        <h1 className="rt-hero-h1">Sistema de Movimiento</h1>
        <p className="rt-hero-p">
          Lucy te dice qué comer. Esto te dice cómo moverte. Toca cualquier ejercicio y mira el video sin salir de la página.
        </p>
        <div className="rt-sunbar" />
        <div className="rt-tags">3 ENTORNOS · 2 NIVELES · VIDEO EN CADA EJERCICIO</div>
      </div>

      {/* STICKY SELECTOR */}
      <div className="rt-selector">
        <div className="rt-selwrap">
          <div className="rt-sellabel">¿Dónde entrenas?</div>
          <div className="rt-pills">
            {data.map((ru, i) => (
              <button
                key={ru.rutina}
                className={`rt-pill${i === envIdx ? ' on' : ''}`}
                style={
                  i === envIdx
                    ? { background: COLORS[ru.rutina], borderColor: 'transparent', color: '#fff' }
                    : {}
                }
                onClick={() => handleEnv(i)}
              >
                {ru.rutina}
              </button>
            ))}
          </div>
          <div className="rt-sellabel" style={{ marginTop: 8 }}>Tu nivel</div>
          <div className="rt-pills rt-lvl">
            {r.niveles.map((nv, i) => (
              <button
                key={nv.nivel}
                className={`rt-pill rt-pill-lvl${i === lvlIdx ? ' on' : ''}`}
                onClick={() => handleLvl(i)}
              >
                {nv.nivel}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="rt-wrap">
        {/* How to use */}
        <div className="rt-howto">
          <h3>Cómo usar tu sistema</h3>
          <div className="rt-steps">
            <div className="rt-step">
              <div className="rt-step-n">1</div>
              <div className="rt-step-q"><b>Elige tu entorno.</b> Casa, mancuernas o gym — arriba.</div>
            </div>
            <div className="rt-step">
              <div className="rt-step-n">2</div>
              <div className="rt-step-q"><b>Empieza en Básico.</b> Domina la técnica, luego sube a Avanzado.</div>
            </div>
            <div className="rt-step">
              <div className="rt-step-n">3</div>
              <div className="rt-step-q"><b>3 días/semana</b> con descanso entre medio. Ej: lun, mié, vie.</div>
            </div>
          </div>
          <div className="rt-legend">
            <span><b>Series</b> = rondas</span>
            <span><b>Reps</b> = repeticiones (ej. 10-15)</span>
            <span><b>c/l</b> = cada lado</span>
            <span><b>seg</b> = sostener segundos</span>
            <span><b>Desc.</b> = descanso (1&apos; = 1 min)</span>
          </div>
        </div>

        {/* Routine banner */}
        <div className="rt-rband" style={{ background: color }}>
          <div className="rt-rk">RUTINA</div>
          <div className="rt-rn">{r.rutina}</div>
          <div className="rt-rs">{r.sub} · Nivel {lv.nivel}</div>
        </div>

        {/* Days */}
        {lv.dias.map((d, di) => (
          <div key={d.dia} className="rt-day">
            <div className="rt-dayhead" style={{ background: color }}>
              {d.dia.toUpperCase()}
            </div>
            {d.ej.map((e, ei) => {
              const videoKey = `${di}-${ei}`
              return (
                <div key={ei} className="rt-ex">
                  <div className="rt-exrow">
                    <div className="rt-bq">{e.bloque}</div>
                    <div className="rt-exmeta">
                      <div className="rt-exname">{e.ej}</div>
                      <div className="rt-exzone">{e.obj}</div>
                    </div>
                    <div className="rt-exnums">
                      <b>{e.sets}</b> series<span className="rt-sep">·</span><b>{e.reps}</b>
                    </div>
                  </div>
                  {e.vid && (
                    <VideoSlot
                      vid={e.vid}
                      isOpen={activeVideo === videoKey}
                      onToggle={() => setActiveVideo(prev => prev === videoKey ? null : videoKey)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        ))}

        <div className="rt-foot">CARIBEÑO FIT LABS · UN REGALO DENTRO DE TU MEMBRESÍA LUCY</div>
      </div>
    </>
  )
}

export default function MisRutinasPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<Rutina[] | null>(null)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (loading) return

    if (!user) {
      router.push('/login')
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
        return
      }

      fetch('/api/mis-rutinas', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).then(res => {
        if (res.ok) {
          res.json().then(setData)
        } else {
          setDenied(true)
          router.push('/login')
        }
      })
    })
  }, [user, loading, router])

  if (loading || (!data && !denied)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FBF7F0' }}>
        <p style={{ color: '#9aa0b5', fontSize: 14 }}>Cargando...</p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="rt-page">
      <RutinasContent data={data} />
      <style>{`
        .rt-page{background:var(--cream);min-height:100vh;
          font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
          color:var(--ink);line-height:1.45;-webkit-font-smoothing:antialiased}

        :root {
          --terra:#C0492B;--coral:#E0602F;--amber:#F0A030;--gold:#F0C020;
          --navy:#2E3A78;--blue:#2F73B0;--green:#2FA866;--ink:#222a44;--cream:#FBF7F0;
          --line:#ece6da;--accent:var(--coral);
        }

        .rt-hero{background:radial-gradient(120% 90% at 50% 0%,#2c3568 0%,#1b2142 60%,#141937 100%);
          color:#fff;text-align:center;padding:34px 20px 26px}
        .rt-hero-logo{width:150px;margin:0 auto 14px;display:block}
        .rt-kick{font-size:11px;letter-spacing:.42em;color:var(--gold);font-weight:700;margin-bottom:8px}
        .rt-hero-h1{font-size:30px;line-height:1.02;letter-spacing:.01em;text-transform:uppercase;font-weight:800;margin:0}
        .rt-hero-p{color:#cdd3ec;font-size:13.5px;max-width:520px;margin:12px auto 0}
        .rt-sunbar{height:6px;width:min(280px,70%);margin:16px auto 4px;border-radius:4px;
          background:linear-gradient(90deg,var(--terra) 0 14%,var(--coral) 14% 28%,var(--amber) 28% 43%,var(--gold) 43% 57%,var(--navy) 57% 71%,var(--blue) 71% 85%,var(--green) 85% 100%)}
        .rt-tags{font-size:11px;letter-spacing:.16em;color:#aeb4d4;margin-top:8px}

        .rt-selector{position:sticky;top:0;z-index:40;background:rgba(251,247,240,.96);
          backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:10px 14px}
        .rt-selwrap{max-width:760px;margin:0 auto}
        .rt-sellabel{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#9aa0b5;margin:0 2px 6px}
        .rt-pills{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
        .rt-pills::-webkit-scrollbar{display:none}
        .rt-pill{flex:0 0 auto;border:1.5px solid var(--line);background:#fff;color:#5a6076;
          font-weight:700;font-size:13px;padding:8px 14px;border-radius:999px;cursor:pointer;white-space:nowrap;transition:.15s;font-family:inherit}
        .rt-pill.on{color:#fff;border-color:transparent}
        .rt-pills.rt-lvl{margin-top:8px}
        .rt-pill-lvl.on{background:var(--navy)}

        .rt-wrap{max-width:760px;margin:0 auto;padding:18px 14px 60px}
        .rt-rband{color:#fff;border-radius:16px;padding:18px 18px;margin:6px 0 16px}
        .rt-rk{font-size:11px;letter-spacing:.32em;opacity:.92}
        .rt-rn{font-size:26px;font-weight:800;text-transform:uppercase;line-height:1.02;margin-top:2px}
        .rt-rs{font-size:13px;opacity:.92;margin-top:4px}

        .rt-howto{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;margin:0 0 18px}
        .rt-howto h3{font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--navy);margin-bottom:10px}
        .rt-steps{display:grid;grid-template-columns:1fr;gap:10px}
        .rt-step{display:flex;gap:10px}
        .rt-step-n{flex:0 0 26px;font-weight:800;color:var(--coral);font-size:18px}
        .rt-step-q{font-size:13.5px;color:#5a6076}
        .rt-step-q b{color:var(--navy)}
        .rt-legend{margin-top:14px;border-top:1px dashed var(--line);padding-top:12px;
          display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;color:#5a6076}
        .rt-legend b{color:var(--terra)}

        .rt-day{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-bottom:16px;box-shadow:0 1px 0 rgba(0,0,0,.02)}
        .rt-dayhead{color:#fff;padding:10px 16px;font-weight:800;letter-spacing:.14em;font-size:14px}
        .rt-ex{border-top:1px solid #f1ece2;padding:12px 14px}
        .rt-ex:first-of-type{border-top:none}
        .rt-exrow{display:flex;align-items:center;gap:12px}
        .rt-bq{flex:0 0 26px;width:26px;height:26px;border-radius:50%;background:var(--navy);color:#fff;
          font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center}
        .rt-exmeta{flex:1;min-width:0}
        .rt-exname{font-weight:800;font-size:15.5px;color:var(--ink)}
        .rt-exzone{font-size:12px;color:#8a91a8;margin-top:1px}
        .rt-exnums{flex:0 0 auto;text-align:right;font-size:12px;color:#6a7188}
        .rt-exnums b{color:var(--navy);font-size:14px}
        .rt-sep{opacity:.4;margin:0 4px}

        .rt-play{margin-top:10px;display:flex;align-items:center;gap:10px;cursor:pointer;
          border:1.5px solid var(--line);border-radius:12px;padding:8px 12px;background:#faf8f3;transition:.15s}
        .rt-play:hover{border-color:var(--accent)}
        .rt-ico{flex:0 0 34px;width:34px;height:34px;border-radius:50%;background:var(--terra);color:#fff;
          display:flex;align-items:center;justify-content:center;font-size:13px}
        .rt-txt{font-weight:700;font-size:13px;color:#444c66}
        .rt-videobox{margin-top:10px;position:relative;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000}
        .rt-videobox iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
        .rt-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
        .rt-fallback a{color:#fff;font-weight:700;font-size:14px;text-decoration:underline}

        .rt-foot{text-align:center;color:#9aa0b5;font-size:11px;letter-spacing:.14em;padding:26px 0 0}

        @media(min-width:560px){
          .rt-steps{grid-template-columns:1fr 1fr 1fr}
          .rt-hero-h1{font-size:38px}
        }
      `}</style>
    </div>
  )
}
