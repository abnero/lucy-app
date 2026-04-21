'use client'

interface BannerReOnboardingProps {
  onOpen: () => void
}

export default function BannerReOnboarding({ onOpen }: BannerReOnboardingProps) {
  if (process.env.NEXT_PUBLIC_LUCY_REGEN_PAUSED === 'true') return null

  return (
    <div style={{ backgroundColor: '#B8B5E0' }} className="px-4 py-3 text-center">
      <div className="max-w-lg mx-auto">
        <p className="text-sm font-medium text-lucy-text mb-1">Mejoramos Lucy</p>
        <p className="text-xs text-lucy-text/80 mb-2">Tu plan necesita actualizarse con 3 preguntas rápidas. Toma 30 segundos.</p>
        <button
          onClick={onOpen}
          className="bg-lucy-accent text-white text-sm font-medium rounded-btn px-4 py-2 hover:opacity-90 transition-opacity"
        >
          Actualizar ahora →
        </button>
      </div>
    </div>
  )
}
