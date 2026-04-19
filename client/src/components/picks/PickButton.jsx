import { useState, useEffect } from 'react'
import OddsDisplay from './OddsDisplay'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../../lib/teamLogos'

const stateStyles = {
  default: 'bg-bg-primary hover:bg-bg-card-hover border-border hover:border-border-hover',
  selected: 'bg-accent/20 border-accent',
  locked: 'bg-bg-primary border-border opacity-60 cursor-not-allowed',
  'locked-picked': 'bg-bg-primary border-accent/50 cursor-not-allowed',
  correct: 'bg-bg-primary border-correct',
  incorrect: 'bg-bg-primary border-incorrect',
  postponed: 'bg-bg-primary border-yellow-500',
}

function PickLogo({ team, sportKey }) {
  const [src, setSrc] = useState(() => getTeamLogoUrl(team, sportKey))
  const [hidden, setHidden] = useState(false)
  useEffect(() => { setSrc(getTeamLogoUrl(team, sportKey)); setHidden(false) }, [team, sportKey])
  if (!src || hidden) return null
  return <img src={src} alt="" className="w-10 h-10 object-contain mx-auto my-1.5" onError={() => {
    const fallback = getTeamLogoFallbackUrl(team, sportKey)
    if (fallback && fallback !== src) setSrc(fallback)
    else setHidden(true)
  }} />
}

export default function PickButton({ team, odds, score, isLive, state = 'default', onClick, disabled, sportKey }) {
  const style = stateStyles[state] || stateStyles.default
  const hasResult = score != null
  const hasLogo = !!getTeamLogoUrl(team, sportKey)

  // When showing scores (live/final), use dark background for all states
  const bgOverride = hasResult && state === 'default' ? 'bg-bg-primary border-border' : ''

  return (
    <button
      onClick={onClick}
      disabled={disabled || state === 'locked' || state === 'locked-picked' || state === 'correct' || state === 'incorrect' || state === 'postponed'}
      className={`w-full min-w-0 p-4 rounded-xl border transition-all ${bgOverride || style} ${disabled && !hasResult ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className={`font-semibold text-xs sm:text-sm truncate ${hasLogo ? 'mb-0' : 'mb-1'} ${
        state === 'correct' ? 'text-correct'
        : state === 'incorrect' ? 'text-incorrect'
        : state === 'postponed' ? 'text-yellow-500'
        : hasResult ? 'text-white'
        : 'text-text-primary'
      }`}>
        {team}
      </div>
      <PickLogo team={team} sportKey={sportKey} />
      {score != null ? (
        <div className={`${hasLogo ? 'text-base' : 'text-lg'} font-display ${
          isLive && (state === 'locked-picked') ? 'text-accent'
          : state === 'correct' ? 'text-correct'
          : state === 'incorrect' ? 'text-incorrect'
          : state === 'postponed' ? 'text-yellow-500'
          : 'text-white'
        }`}>{score}</div>
      ) : (
        <OddsDisplay odds={odds} isSelected={state === 'selected'} small={hasLogo} />
      )}
    </button>
  )
}
