import { useState } from 'react'

// Headshot or initials fallback. ESPN/Sleeper publish headshots for
// virtually every NFL player, but the rare gap (rookies, late call-ups,
// recently signed practice-squad guys) deserves a non-empty placeholder
// instead of blank space.

function initialsFor(name) {
  if (!name) return '?'
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?'
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const SIZE_CLASSES = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-12 h-12 text-sm',
}

export default function PlayerHeadshot({ name, url, size = 'md', className = '', onClick }) {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md
  const [errored, setErrored] = useState(false)
  const interactive = onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''

  if (url && !errored) {
    return (
      <img
        src={url}
        alt=""
        className={`${sizeClass} rounded-full object-cover bg-bg-secondary shrink-0 ${interactive} ${className}`}
        onClick={onClick}
        onError={() => setErrored(true)}
      />
    )
  }
  return (
    <div
      className={`${sizeClass} rounded-full bg-bg-secondary border border-text-primary/15 shrink-0 flex items-center justify-center font-semibold text-text-secondary ${interactive} ${className}`}
      onClick={onClick}
    >
      {initialsFor(name)}
    </div>
  )
}
