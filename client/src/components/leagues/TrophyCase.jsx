import { useMemo } from 'react'
import { useMyLeagueWins } from '../../hooks/useLeagues'

function getTrophyScale(memberCount) {
  if (memberCount >= 100) return 'scale-125'
  if (memberCount >= 50) return 'scale-110'
  return ''
}

function Trophy({ className = '' }) {
  return (
    <svg viewBox="0 0 80 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Cup body */}
      <path
        d="M20 8h40v4c0 18-8 32-20 38-12-6-20-20-20-38V8z"
        fill="url(#gold)"
        stroke="url(#goldEdge)"
        strokeWidth="1.5"
      />
      {/* Cup rim */}
      <ellipse cx="40" cy="8" rx="21" ry="4" fill="url(#goldLight)" stroke="url(#goldEdge)" strokeWidth="1" />
      {/* Cup interior shadow */}
      <ellipse cx="40" cy="9" rx="17" ry="3" fill="url(#goldDark)" opacity="0.5" />
      {/* Left handle */}
      <path
        d="M20 14c-8 0-14 6-14 14s6 14 12 14c2 0 4-1 5-2"
        stroke="url(#goldEdge)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M20 14c-8 0-14 6-14 14s6 14 12 14c2 0 4-1 5-2"
        stroke="url(#gold)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Right handle */}
      <path
        d="M60 14c8 0 14 6 14 14s-6 14-12 14c-2 0-4-1-5-2"
        stroke="url(#goldEdge)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M60 14c8 0 14 6 14 14s-6 14-12 14c-2 0-4-1-5-2"
        stroke="url(#gold)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Stem */}
      <path d="M36 50h8v12h-8z" fill="url(#gold)" stroke="url(#goldEdge)" strokeWidth="0.5" />
      {/* Stem knob */}
      <ellipse cx="40" cy="56" rx="5" ry="2.5" fill="url(#goldLight)" stroke="url(#goldEdge)" strokeWidth="0.5" />
      {/* Base top */}
      <path d="M28 62h24l4 6H24l4-6z" fill="url(#gold)" stroke="url(#goldEdge)" strokeWidth="0.5" />
      {/* Base block */}
      <rect x="22" y="68" width="36" height="16" rx="2" fill="#1a1a1a" stroke="#333" strokeWidth="0.5" />
      {/* Base plate */}
      <rect x="28" y="72" width="24" height="8" rx="1" fill="url(#goldDark)" stroke="url(#goldEdge)" strokeWidth="0.3" />
      {/* Shine highlight */}
      <path d="M30 14c2-2 6-3 8-3" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />

      <defs>
        <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f0d060" />
          <stop offset="30%" stopColor="#daa520" />
          <stop offset="60%" stopColor="#c8961e" />
          <stop offset="100%" stopColor="#b8860b" />
        </linearGradient>
        <linearGradient id="goldLight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffe588" />
          <stop offset="100%" stopColor="#daa520" />
        </linearGradient>
        <linearGradient id="goldDark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c8961e" />
          <stop offset="100%" stopColor="#8b6914" />
        </linearGradient>
        <linearGradient id="goldEdge" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#daa520" />
          <stop offset="100%" stopColor="#8b6914" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function TrophyCase() {
  const { data: wins } = useMyLeagueWins()

  const sorted = useMemo(() => {
    if (!wins?.length) return []
    return [...wins].sort((a, b) => b.member_count - a.member_count)
  }, [wins])

  if (!sorted.length) return null

  return (
    <div className="mt-6 mb-6">
      <h2 className="font-display text-xl text-center mb-4">Trophy Case</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
        {sorted.map((win) => (
          <div
            key={win.id}
            className="flex flex-col items-center text-center"
          >
            <Trophy className={`w-16 h-20 ${getTrophyScale(win.member_count)}`} />
            <p className="text-sm font-semibold mt-2 text-text-primary leading-tight">
              {win.league_name}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              Outlasted {win.member_count - 1} player{win.member_count - 1 !== 1 ? 's' : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
