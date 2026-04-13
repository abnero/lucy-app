'use client'

import { useState } from 'react'

const BENEFICIOS = [
  'Tu calendario metabólico personalizado',
  'Chat ilimitado con Lucy',
  'Vista semanal + PDF imprimible',
  'Actualizaciones incluidas',
  'Acceso inmediato',
]

export default function PagoPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCheckout = async () => {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const data = await res.json()

      if (data.error) {
        setError(data.error)
        setLoading(false)
        return
      }

      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div style={{ backgroundColor: '#F8F7FC', minHeight: '100vh' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '40px 20px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '48px', color: '#2D2B45', margin: 0, lineHeight: 1 }}>
            Lucy
          </h1>
          <p style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#7B7FC4', marginTop: '8px', fontWeight: 500 }}>
            CALENDARIO METABÓLICO
          </p>
        </div>

        {/* Plan card */}
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #EAE9F4',
          borderRadius: '16px',
          padding: '32px 28px',
          marginBottom: '24px',
        }}>
          <p style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#7B7FC4', fontWeight: 500, marginBottom: '8px' }}>
            ACCESO ANUAL
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '28px' }}>
            <span style={{ fontSize: '48px', fontWeight: 700, color: '#2D2B45', lineHeight: 1 }}>$297</span>
            <span style={{ fontSize: '15px', color: '#6B6889' }}>/ año</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '32px' }}>
            {BENEFICIOS.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: '#EAE9F4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5.5L4 7.5L8 3" stroke="#7B7FC4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span style={{ fontSize: '14px', color: '#2D2B45' }}>{b}</span>
              </div>
            ))}
          </div>

          <button
            onClick={handleCheckout}
            disabled={loading}
            style={{
              width: '100%',
              backgroundColor: '#7B7FC4',
              color: '#FFFFFF',
              fontWeight: 600,
              borderRadius: '12px',
              padding: '16px 20px',
              fontSize: '16px',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? 'Redirigiendo a Stripe...' : 'Comenzar ahora →'}
          </button>

          {error && (
            <p style={{ color: '#e53e3e', fontSize: '13px', textAlign: 'center', marginTop: '12px' }}>{error}</p>
          )}
        </div>

        {/* Security badge */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <p style={{ fontSize: '12px', color: '#6B6889' }}>
            🔒 Pago seguro con Stripe
          </p>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #EAE9F4', paddingTop: '24px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#6B6889' }}>Powered by</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/caribeno-fit-labs.png" alt="Caribeño Fit Labs" style={{ height: '20px' }} />
            <span style={{ fontSize: '11px', color: '#2D2B45', fontWeight: 500 }}>Caribeño Fit Labs</span>
          </div>
        </div>
      </div>
    </div>
  )
}
