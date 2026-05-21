'use client'

import { useState } from 'react'

export default function RutinasPage() {
  const [email, setEmail] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrMsg('Escribe un correo válido para enviarte las rutinas.')
      return
    }
    setErrMsg('')
    setStatus('sending')

    try {
      const res = await fetch('/api/rutinas-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, empresa: honeypot }),
      })
      if (res.ok) {
        setStatus('success')
      } else {
        setStatus('error')
        setErrMsg('Hubo un error. Intenta de nuevo.')
      }
    } catch {
      setStatus('error')
      setErrMsg('Hubo un error. Intenta de nuevo.')
    }
  }

  return (
    <>
      <div className="rt-wrap">
        <header className="rt-header">
          <span className="rt-logo">Lucy</span>
        </header>

        <div className="rt-card">
          {status === 'success' ? (
            <div className="rt-success">
              <div className="rt-check">✓</div>
              <p className="rt-success-title">¡Listo!</p>
              <p className="rt-success-body">
                Revisa tu correo en los próximos minutos. Si no lo ves, busca en spam o promociones.
              </p>
            </div>
          ) : (
            <>
              <h1 className="rt-h1">Tus 3 rutinas de ejercicio, gratis</h1>
              <p className="rt-sub">
                Pon tu correo y te las envío ahora mismo — con dumbbells, sin materiales y para gimnasio. Cada ejercicio trae sets, reps, descanso y video.
              </p>

              <form onSubmit={handleSubmit} className="rt-form">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="rt-input"
                  autoComplete="email"
                />
                {/* Honeypot — invisible to humans */}
                <input
                  type="text"
                  name="empresa"
                  value={honeypot}
                  onChange={e => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, width: 0 }}
                />
                {errMsg && <div className="rt-err">{errMsg}</div>}
                <button type="submit" className="rt-btn" disabled={status === 'sending'}>
                  {status === 'sending' ? 'Enviando...' : 'Enviarme las rutinas'}
                </button>
              </form>
            </>
          )}
        </div>

        <footer className="rt-footer">
          Sin spam. Solo lo que de verdad te sirve.<br />
          © Caribeño Fit Labs
        </footer>
      </div>

      <style>{`
        .rt-wrap { max-width: 480px; margin: 0 auto; padding: 48px 20px 80px; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .rt-header { text-align: center; margin-bottom: 32px; }
        .rt-logo { font-family: Georgia, 'Times New Roman', serif; color: #2D2B45; font-size: 26px; letter-spacing: -0.01em; }
        .rt-card { background: #FFF; border-radius: 20px; box-shadow: 0 4px 24px rgba(45,43,69,0.07); padding: 32px 24px; width: 100%; }
        .rt-h1 { font-size: 27px; font-weight: 700; line-height: 1.25; letter-spacing: -0.02em; color: #2D2B45; text-align: center; margin-bottom: 12px; }
        .rt-sub { font-size: 15px; color: #6B6982; text-align: center; line-height: 1.6; margin-bottom: 24px; }
        .rt-form { display: flex; flex-direction: column; gap: 12px; position: relative; }
        .rt-input { width: 100%; font-family: inherit; font-size: 16px; color: #2D2B45; padding: 14px 14px; border: 1.5px solid #E6E4F0; border-radius: 11px; background: #F8F7FC; transition: border-color 0.2s; }
        .rt-input:focus { outline: none; border-color: #7B7FC4; background: #FFF; }
        .rt-btn { width: 100%; font-family: inherit; font-size: 16px; font-weight: 600; padding: 15px; border-radius: 12px; border: none; cursor: pointer; background: #7B7FC4; color: #FFF; transition: background 0.18s, transform 0.05s; }
        .rt-btn:hover { background: #5F63A8; }
        .rt-btn:active { transform: scale(0.99); }
        .rt-btn:disabled { background: #B8B5E0; cursor: not-allowed; }
        .rt-err { font-size: 13px; color: #C4546B; }
        .rt-success { text-align: center; padding: 16px 0; }
        .rt-check { width: 48px; height: 48px; border-radius: 50%; background: #E8F5E9; color: #4CAF50; font-size: 24px; font-weight: 700; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
        .rt-success-title { font-size: 20px; font-weight: 700; color: #2D2B45; margin-bottom: 8px; }
        .rt-success-body { font-size: 14px; color: #6B6982; line-height: 1.6; }
        .rt-footer { text-align: center; font-size: 12px; color: #9C9AB0; margin-top: 24px; line-height: 1.7; }
      `}</style>
    </>
  )
}
