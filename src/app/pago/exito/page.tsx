'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

export default function PagoExitoPage() {
  return (
    <Suspense fallback={
      <div style={{ backgroundColor: '#F8F7FC', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6B6889', fontSize: '14px' }}>Cargando...</p>
      </div>
    }>
      <PagoExitoContent />
    </Suspense>
  )
}

function PagoExitoContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [error, setError] = useState('')
  const verified = useRef(false)

  useEffect(() => {
    if (!sessionId || verified.current) return
    verified.current = true

    fetch('/api/stripe/verify-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
          setStatus('error')
          return
        }

        setStatus('success')

        // Redirect after 3 seconds
        const email = encodeURIComponent(data.email || '')
        const dest = data.isNewUser
          ? `/registro?email=${email}`
          : `/login?email=${email}`

        setTimeout(() => {
          window.location.href = dest
        }, 3000)
      })
      .catch(() => {
        setError('Error verificando el pago. Contacta soporte.')
        setStatus('error')
      })
  }, [sessionId])

  return (
    <div style={{ backgroundColor: '#F8F7FC', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: '420px', padding: '40px 20px', textAlign: 'center' }}>
        {/* Logo */}
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '36px', color: '#2D2B45', marginBottom: '4px' }}>
          Lucy
        </h1>
        <p style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#7B7FC4', fontWeight: 500, marginBottom: '40px' }}>
          CALENDARIO METABÓLICO
        </p>

        {status === 'verifying' && (
          <div>
            {/* Spinner */}
            <div style={{ marginBottom: '24px' }}>
              <div className="pago-spinner" style={{
                width: '48px',
                height: '48px',
                border: '3px solid #EAE9F4',
                borderTopColor: '#7B7FC4',
                borderRadius: '50%',
                margin: '0 auto',
              }} />
            </div>
            <p style={{ fontSize: '18px', fontWeight: 600, color: '#2D2B45', marginBottom: '8px' }}>
              Verificando tu pago...
            </p>
            <p style={{ fontSize: '14px', color: '#6B6889' }}>
              Tu acceso está siendo activado.
            </p>
          </div>
        )}

        {status === 'success' && (
          <div>
            <p style={{ fontSize: '48px', marginBottom: '16px' }}>🌿</p>
            <p style={{ fontSize: '22px', fontWeight: 700, color: '#2D2B45', marginBottom: '12px' }}>
              ¡Bienvenida a Lucy!
            </p>
            <p style={{ fontSize: '14px', color: '#6B6889', lineHeight: 1.6 }}>
              Tu acceso ha sido activado. Te estamos redirigiendo para crear tu cuenta...
            </p>
            <div style={{ marginTop: '24px' }}>
              <div className="pago-spinner" style={{
                width: '24px',
                height: '24px',
                border: '2px solid #EAE9F4',
                borderTopColor: '#7B7FC4',
                borderRadius: '50%',
                margin: '0 auto',
              }} />
            </div>
          </div>
        )}

        {status === 'error' && (
          <div>
            <p style={{ fontSize: '48px', marginBottom: '16px' }}>😕</p>
            <p style={{ fontSize: '18px', fontWeight: 600, color: '#2D2B45', marginBottom: '12px' }}>
              Hubo un problema
            </p>
            <p style={{ fontSize: '14px', color: '#6B6889', lineHeight: 1.6, marginBottom: '20px' }}>
              {error || 'No pudimos verificar tu pago. Si el cobro se realizó, tu acceso se activará automáticamente en minutos.'}
            </p>
            <a
              href="/pago"
              style={{
                display: 'inline-block',
                backgroundColor: '#7B7FC4',
                color: '#FFFFFF',
                fontWeight: 600,
                borderRadius: '12px',
                padding: '12px 24px',
                fontSize: '14px',
                textDecoration: 'none',
              }}
            >
              Volver a intentar
            </a>
          </div>
        )}

        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          .pago-spinner {
            animation: spin 0.8s linear infinite;
          }
        `}</style>
      </div>
    </div>
  )
}
