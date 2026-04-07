'use client'

import { useState, useEffect } from 'react'

interface FoodAvatarProps {
  nombre: string
  foto_url?: string | null
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'w-9 h-9 text-sm',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-xl',
}

export default function FoodAvatar({ nombre, foto_url, size = 'md' }: FoodAvatarProps) {
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [foto_url])

  const initial = (nombre || '?').charAt(0).toUpperCase()

  if (foto_url && !imgError) {
    return (
      <img
        key={foto_url}
        src={foto_url}
        alt={nombre}
        className={`${sizeClasses[size]} rounded-full object-cover shrink-0`}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-lucy-soft flex items-center justify-center shrink-0`}>
      <span className="text-lucy-text font-semibold">{initial}</span>
    </div>
  )
}
