import { useMemo } from 'react'
import { useMyLeagueWins } from '../../hooks/useLeagues'

function getTrophyTier(memberCount) {
  if (memberCount >= 50) return 'grand'
  if (memberCount >= 25) return 'large'
  if (memberCount >= 10) return 'medium'
  return 'small'
}

// Shared gold gradient defs — each tier uses a unique prefix
function GoldDefs({ p }) {
  return (
    <>
      <linearGradient id={`${p}-gold`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f0d060" />
        <stop offset="30%" stopColor="#daa520" />
        <stop offset="60%" stopColor="#c8961e" />
        <stop offset="100%" stopColor="#b8860b" />
      </linearGradient>
      <linearGradient id={`${p}-goldLight`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffe588" />
        <stop offset="100%" stopColor="#daa520" />
      </linearGradient>
      <linearGradient id={`${p}-goldDark`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#c8961e" />
        <stop offset="100%" stopColor="#8b6914" />
      </linearGradient>
      <linearGradient id={`${p}-goldEdge`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#daa520" />
        <stop offset="100%" stopColor="#8b6914" />
      </linearGradient>
      <linearGradient id={`${p}-goldShine`} x1="0%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor="#fff8e0" />
        <stop offset="40%" stopColor="#ffe588" />
        <stop offset="100%" stopColor="#daa520" />
      </linearGradient>
    </>
  )
}

/* ─── Tier 1: Simple Goblet (< 10 players) ─── */
function GobletTrophy({ className = '' }) {
  const p = 'tr-sm'
  return (
    <svg viewBox="0 0 60 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs><GoldDefs p={p} /></defs>
      {/* Cup body — simple chalice */}
      <path
        d="M12 10h36v2c0 16-6 28-18 34C18 40 12 28 12 12V10z"
        fill={`url(#${p}-gold)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="1"
      />
      {/* Rim */}
      <ellipse cx="30" cy="10" rx="19" ry="3.5" fill={`url(#${p}-goldLight)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.8" />
      {/* Interior shadow */}
      <ellipse cx="30" cy="11" rx="15" ry="2.5" fill={`url(#${p}-goldDark)`} opacity="0.5" />
      {/* Stem */}
      <rect x="27" y="46" width="6" height="16" fill={`url(#${p}-gold)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.4" />
      {/* Stem knob */}
      <ellipse cx="30" cy="52" rx="4.5" ry="2" fill={`url(#${p}-goldLight)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.4" />
      {/* Base — simple round */}
      <ellipse cx="30" cy="64" rx="14" ry="4" fill={`url(#${p}-gold)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.6" />
      <ellipse cx="30" cy="64" rx="14" ry="4" fill={`url(#${p}-goldShine)`} opacity="0.25" />
      {/* Base block */}
      <rect x="16" y="66" width="28" height="14" rx="2" fill="#1a1a1a" stroke="#333" strokeWidth="0.5" />
      {/* Base plate */}
      <rect x="21" y="70" width="18" height="7" rx="1" fill={`url(#${p}-goldDark)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.3" />
      {/* Highlight */}
      <path d="M22 16c2-2 5-3 7-3" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/* ─── Tier 2: Standard Trophy (10–24 players) ─── */
function StandardTrophy({ className = '' }) {
  const p = 'tr-md'
  return (
    <svg viewBox="0 0 80 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs><GoldDefs p={p} /></defs>
      {/* Cup body */}
      <path
        d="M20 8h40v4c0 18-8 32-20 38-12-6-20-20-20-38V8z"
        fill={`url(#${p}-gold)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="1.5"
      />
      {/* Rim */}
      <ellipse cx="40" cy="8" rx="21" ry="4" fill={`url(#${p}-goldLight)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="1" />
      <ellipse cx="40" cy="9" rx="17" ry="3" fill={`url(#${p}-goldDark)`} opacity="0.5" />
      {/* Left handle */}
      <path d="M20 14c-8 0-14 6-14 14s6 14 12 14c2 0 4-1 5-2" stroke={`url(#${p}-goldEdge)`} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M20 14c-8 0-14 6-14 14s6 14 12 14c2 0 4-1 5-2" stroke={`url(#${p}-gold)`} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* Right handle */}
      <path d="M60 14c8 0 14 6 14 14s-6 14-12 14c-2 0-4-1-5-2" stroke={`url(#${p}-goldEdge)`} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M60 14c8 0 14 6 14 14s-6 14-12 14c-2 0-4-1-5-2" stroke={`url(#${p}-gold)`} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* Stem */}
      <rect x="36" y="50" width="8" height="12" fill={`url(#${p}-gold)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.5" />
      <ellipse cx="40" cy="56" rx="5" ry="2.5" fill={`url(#${p}-goldLight)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.5" />
      {/* Base top */}
      <path d="M28 62h24l4 6H24l4-6z" fill={`url(#${p}-gold)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.5" />
      {/* Base block */}
      <rect x="22" y="68" width="36" height="16" rx="2" fill="#1a1a1a" stroke="#333" strokeWidth="0.5" />
      <rect x="28" y="72" width="24" height="8" rx="1" fill={`url(#${p}-goldDark)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.3" />
      {/* Highlight */}
      <path d="M30 14c2-2 6-3 8-3" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/* ─── Tier 3: Ornate Trophy (25–49 players) ─── */
function OrnateTrophy({ className = '' }) {
  const p = 'tr-lg'
  return (
    <svg viewBox="0 0 88 110" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <GoldDefs p={p} />
        <radialGradient id={`${p}-star`} cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#fff8e0" />
          <stop offset="50%" stopColor="#ffd700" />
          <stop offset="100%" stopColor="#c8961e" />
        </radialGradient>
      </defs>
      {/* Taller cup body */}
      <path
        d="M18 6h52v5c0 20-10 36-26 42C28 47 18 31 18 11V6z"
        fill={`url(#${p}-gold)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="1.5"
      />
      {/* Rim */}
      <ellipse cx="44" cy="6" rx="27" ry="4.5" fill={`url(#${p}-goldLight)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="1" />
      <ellipse cx="44" cy="7" rx="22" ry="3.5" fill={`url(#${p}-goldDark)`} opacity="0.5" />
      {/* Left handle — ornate scrolled */}
      <path d="M18 12c-10 0-16 7-16 16s6 16 14 16c2 0 4-1 5-2" stroke={`url(#${p}-goldEdge)`} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M18 12c-10 0-16 7-16 16s6 16 14 16c2 0 4-1 5-2" stroke={`url(#${p}-gold)`} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      {/* Left handle curl */}
      <path d="M4 20c-3 2-4 5-3 8" stroke={`url(#${p}-goldEdge)`} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M4 20c-3 2-4 5-3 8" stroke={`url(#${p}-goldLight)`} strokeWidth="0.8" strokeLinecap="round" fill="none" />
      {/* Right handle */}
      <path d="M70 12c10 0 16 7 16 16s-6 16-14 16c-2 0-4-1-5-2" stroke={`url(#${p}-goldEdge)`} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M70 12c10 0 16 7 16 16s-6 16-14 16c-2 0-4-1-5-2" stroke={`url(#${p}-gold)`} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      {/* Right handle curl */}
      <path d="M84 20c3 2 4 5 3 8" stroke={`url(#${p}-goldEdge)`} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M84 20c3 2 4 5 3 8" stroke={`url(#${p}-goldLight)`} strokeWidth="0.8" strokeLinecap="round" fill="none" />
      {/* Star emblem on cup */}
      <polygon
        points="44,18 46.5,25 54,25 48,30 50,37 44,33 38,37 40,30 34,25 41.5,25"
        fill={`url(#${p}-star)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.5"
      />
      {/* Decorative line under cup */}
      <path d="M28 42 Q36 45 44 42 Q52 39 60 42" stroke={`url(#${p}-goldLight)`} strokeWidth="0.8" fill="none" opacity="0.6" />
      {/* Stem */}
      <rect x="39" y="52" width="10" height="14" fill={`url(#${p}-gold)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.5" />
      {/* Stem knobs (double) */}
      <ellipse cx="44" cy="55" rx="6" ry="2.5" fill={`url(#${p}-goldLight)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.5" />
      <ellipse cx="44" cy="62" rx="5.5" ry="2" fill={`url(#${p}-goldLight)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.4" />
      {/* Base — wider stepped */}
      <path d="M28 66h32l5 6H23l5-6z" fill={`url(#${p}-gold)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.5" />
      <path d="M22 72h44l3 4H19l3-4z" fill={`url(#${p}-goldDark)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.4" />
      {/* Base block */}
      <rect x="18" y="76" width="52" height="16" rx="2.5" fill="#1a1a1a" stroke="#333" strokeWidth="0.5" />
      <rect x="25" y="80" width="38" height="8" rx="1" fill={`url(#${p}-goldDark)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.3" />
      {/* Base corners */}
      <rect x="19" y="77" width="4" height="3" rx="0.5" fill={`url(#${p}-goldDark)`} opacity="0.5" />
      <rect x="65" y="77" width="4" height="3" rx="0.5" fill={`url(#${p}-goldDark)`} opacity="0.5" />
      {/* Highlight */}
      <path d="M28 12c2-2 7-3 10-3" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/* ─── Tier 4: Grand Trophy (50+ players) ─── */
function GrandTrophy({ className = '' }) {
  const p = 'tr-xl'
  return (
    <svg viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <GoldDefs p={p} />
        <radialGradient id={`${p}-jewel`} cx="40%" cy="35%" r="55%">
          <stop offset="0%" stopColor="#ff6080" />
          <stop offset="40%" stopColor="#dc143c" />
          <stop offset="80%" stopColor="#a0001c" />
          <stop offset="100%" stopColor="#700014" />
        </radialGradient>
        <radialGradient id={`${p}-sparkle`} cx="30%" cy="25%" r="45%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${p}-platinum`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff8e0" />
          <stop offset="20%" stopColor="#ffe680" />
          <stop offset="50%" stopColor="#ffd700" />
          <stop offset="80%" stopColor="#daa520" />
          <stop offset="100%" stopColor="#b8860b" />
        </linearGradient>
      </defs>
      {/* Wide cup body */}
      <path
        d="M16 6h68v6c0 22-12 40-34 48C28 52 16 34 16 12V6z"
        fill={`url(#${p}-platinum)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="1.5"
      />
      {/* 3D left face */}
      <path
        d="M16 6v6c0 22 12 40 34 48L50 28 16 6z"
        fill={`url(#${p}-goldShine)`} opacity="0.2"
      />
      {/* Rim */}
      <ellipse cx="50" cy="6" rx="35" ry="5" fill={`url(#${p}-goldLight)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="1" />
      <ellipse cx="50" cy="7" rx="29" ry="3.5" fill={`url(#${p}-goldDark)`} opacity="0.5" />
      {/* Left handle — grand double scroll */}
      <path d="M16 12c-12 0-14 8-14 18s4 18 14 18" stroke={`url(#${p}-goldEdge)`} strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M16 12c-12 0-14 8-14 18s4 18 14 18" stroke={`url(#${p}-gold)`} strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Left handle inner scroll */}
      <path d="M16 18c-6 0-8 5-8 12s3 12 8 12" stroke={`url(#${p}-goldEdge)`} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M16 18c-6 0-8 5-8 12s3 12 8 12" stroke={`url(#${p}-goldLight)`} strokeWidth="1" strokeLinecap="round" fill="none" />
      {/* Right handle */}
      <path d="M84 12c12 0 14 8 14 18s-4 18-14 18" stroke={`url(#${p}-goldEdge)`} strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M84 12c12 0 14 8 14 18s-4 18-14 18" stroke={`url(#${p}-gold)`} strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Right handle inner scroll */}
      <path d="M84 18c6 0 8 5 8 12s-3 12-8 12" stroke={`url(#${p}-goldEdge)`} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M84 18c6 0 8 5 8 12s-3 12-8 12" stroke={`url(#${p}-goldLight)`} strokeWidth="1" strokeLinecap="round" fill="none" />
      {/* Center jewel on cup */}
      <ellipse cx="50" cy="30" rx="7" ry="8" fill={`url(#${p}-jewel)`} stroke="#c8960c" strokeWidth="1.5" />
      <ellipse cx="47" cy="26" rx="2.5" ry="2" fill={`url(#${p}-sparkle)`} />
      {/* Jewel bezel */}
      <ellipse cx="50" cy="30" rx="9" ry="10" fill="none" stroke={`url(#${p}-goldEdge)`} strokeWidth="1.5" />
      {/* Laurel wreath left */}
      <path d="M26 22c-2 4 0 8 3 10" stroke={`url(#${p}-goldLight)`} strokeWidth="1" fill="none" opacity="0.7" />
      <path d="M24 28c-2 4 0 8 3 10" stroke={`url(#${p}-goldLight)`} strokeWidth="1" fill="none" opacity="0.6" />
      <path d="M23 34c-1 3 1 7 3 9" stroke={`url(#${p}-goldLight)`} strokeWidth="1" fill="none" opacity="0.5" />
      {/* Laurel wreath right */}
      <path d="M74 22c2 4 0 8-3 10" stroke={`url(#${p}-goldLight)`} strokeWidth="1" fill="none" opacity="0.7" />
      <path d="M76 28c2 4 0 8-3 10" stroke={`url(#${p}-goldLight)`} strokeWidth="1" fill="none" opacity="0.6" />
      <path d="M77 34c1 3-1 7-3 9" stroke={`url(#${p}-goldLight)`} strokeWidth="1" fill="none" opacity="0.5" />
      {/* Decorative band on cup */}
      <path d="M22 46 Q36 50 50 46 Q64 42 78 46" stroke={`url(#${p}-goldLight)`} strokeWidth="1" fill="none" opacity="0.5" />
      {/* Stem — thicker, ornate */}
      <path d="M42 58h16v4l-2 10h-12l-2-10v-4z" fill={`url(#${p}-gold)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.5" />
      {/* Stem knobs (triple) */}
      <ellipse cx="50" cy="60" rx="9" ry="3" fill={`url(#${p}-goldLight)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.5" />
      <ellipse cx="50" cy="65" rx="7" ry="2.5" fill={`url(#${p}-goldLight)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.4" />
      <ellipse cx="50" cy="70" rx="6" ry="2" fill={`url(#${p}-goldLight)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.4" />
      {/* Base — triple-stepped */}
      <path d="M32 72h36l4 5H28l4-5z" fill={`url(#${p}-gold)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.5" />
      <path d="M26 77h48l3 4H23l3-4z" fill={`url(#${p}-goldDark)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.4" />
      <path d="M22 81h56l2 3H20l2-3z" fill={`url(#${p}-gold)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.3" />
      {/* Base block — wider */}
      <rect x="16" y="84" width="68" height="18" rx="3" fill="#1a1a1a" stroke="#333" strokeWidth="0.5" />
      {/* Base plate */}
      <rect x="24" y="88" width="52" height="10" rx="1.5" fill={`url(#${p}-goldDark)`} stroke={`url(#${p}-goldEdge)`} strokeWidth="0.3" />
      {/* Base corners */}
      <rect x="17" y="85" width="5" height="4" rx="1" fill={`url(#${p}-goldDark)`} opacity="0.5" />
      <rect x="78" y="85" width="5" height="4" rx="1" fill={`url(#${p}-goldDark)`} opacity="0.5" />
      {/* Highlights */}
      <path d="M28 14c3-3 8-4 12-4" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M30 18c2-1 5-2 8-2" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

function TrophyForTier({ tier, className }) {
  switch (tier) {
    case 'grand': return <GrandTrophy className={className} />
    case 'large': return <OrnateTrophy className={className} />
    case 'medium': return <StandardTrophy className={className} />
    default: return <GobletTrophy className={className} />
  }
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
        {sorted.map((win) => {
          const tier = getTrophyTier(win.member_count)
          return (
            <div
              key={win.id}
              className="flex flex-col items-center text-center"
            >
              <TrophyForTier tier={tier} className="w-16 h-20" />
              <p className="text-sm font-semibold mt-2 text-text-primary leading-tight">
                {win.league_name}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                Outlasted {win.member_count - 1} player{win.member_count - 1 !== 1 ? 's' : ''}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
