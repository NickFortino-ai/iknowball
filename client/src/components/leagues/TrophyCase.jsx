import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMyLeagueWins } from '../../hooks/useLeagues'

// Deterministic "random" pick based on win ID — same win always shows same trophy
function pickVariant(winId, count) {
  let hash = 0
  for (let i = 0; i < winId.length; i++) {
    hash = ((hash << 5) - hash) + winId.charCodeAt(i)
    hash |= 0
  }
  return (Math.abs(hash) % count) + 1
}

const BASKETBALL_SPORTS = ['basketball_nba', 'basketball_ncaab', 'basketball_wncaab', 'basketball_wnba']
const FOOTBALL_SPORTS = ['americanfootball_nfl', 'americanfootball_ncaaf']
const BASEBALL_SPORTS = ['baseball_mlb']

function getTrophyImage(win) {
  const { member_count, league_sport, id } = win

  if (member_count >= 14) {
    // Large sport-specific trophy
    if (FOOTBALL_SPORTS.includes(league_sport)) return '/trophies/large-football.webp'
    if (BASEBALL_SPORTS.includes(league_sport)) return '/trophies/large-baseball.webp'
    // Default to basketball for NBA, NCAA, WNBA, or any other sport
    return '/trophies/large-basketball.webp'
  }

  if (member_count >= 9) {
    return `/trophies/medium-${pickVariant(id, 3)}.webp`
  }

  if (member_count >= 5) {
    return `/trophies/small-${pickVariant(id, 3)}.webp`
  }

  // 4 or fewer
  return `/trophies/medal-${pickVariant(id, 3)}.webp`
}

function getTrophySizeClass(memberCount) {
  if (memberCount >= 14) return 'w-32 h-40'
  if (memberCount >= 9) return 'w-28 h-32'
  if (memberCount >= 5) return 'w-24 h-28'
  return 'w-16 h-16'
}

function EmptyShelf() {
  return (
    <div className="border border-text-primary/10 rounded-xl p-6 text-center">
      {/* Shelf lines */}
      <div className="space-y-6 mb-6">
        <div className="h-px bg-text-primary/10" />
        <div className="h-px bg-text-primary/10" />
        <div className="h-px bg-text-primary/10" />
      </div>
      <p className="text-sm text-text-muted">
        <Link to="/leagues/create" className="text-accent hover:text-accent-hover transition-colors font-semibold">Create</Link>
        {' '}or{' '}
        <Link to="/leagues/join" className="text-accent hover:text-accent-hover transition-colors font-semibold">join</Link>
        {' '}a league and earn trophies!
      </p>
    </div>
  )
}

function TrophyItem({ win }) {
  const src = getTrophyImage(win)
  const sizeClass = getTrophySizeClass(win.member_count)
  return (
    <Link
      to={`/leagues/${win.league_id}`}
      className="flex flex-col items-center text-center hover:opacity-80 transition-opacity cursor-pointer flex-shrink-0"
    >
      <div className="h-40 flex items-end justify-center">
        <img
          src={src}
          alt="Trophy"
          className={`${sizeClass} object-contain`}
        />
      </div>
      <p className="text-sm font-semibold mt-2 text-text-primary leading-tight">
        {win.league_name}
      </p>
      <p className="text-xs text-text-muted mt-0.5 mb-1">
        Outlasted {win.member_count - 1} player{win.member_count - 1 !== 1 ? 's' : ''}
      </p>
    </Link>
  )
}

export default function TrophyCase() {
  const { data: wins } = useMyLeagueWins()
  const [expanded, setExpanded] = useState(true)

  const sorted = useMemo(() => {
    if (!wins?.length) return []
    return [...wins].sort((a, b) => b.member_count - a.member_count)
  }, [wins])

  return (
    <div>
      {/* Mobile: collapsible header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-2 mb-4 lg:pointer-events-none"
      >
        <h2 className="font-display text-xl">Trophy Case</h2>
        <svg
          className={`w-4 h-4 text-text-muted transition-transform lg:hidden ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!sorted.length ? (
        <div className={`${expanded ? '' : 'hidden'} lg:block`}>
          <EmptyShelf />
        </div>
      ) : (
        <>
          {/* Mobile: horizontal scroll */}
          <div className={`${expanded ? '' : 'hidden'} lg:hidden overflow-x-auto scrollbar-hide pb-2`}>
            <div className="flex gap-6 px-1" style={{ minWidth: 'max-content' }}>
              {sorted.map((win) => (
                <div key={win.id} className="w-36">
                  <TrophyItem win={win} />
                </div>
              ))}
            </div>
          </div>

          {/* Desktop: 2-column grid, independently scrollable */}
          <div className="hidden lg:grid grid-cols-2 gap-x-4 gap-y-0 max-h-[calc(100vh-6rem)] overflow-y-auto overscroll-contain scrollbar-hide">
            {sorted.map((win) => (
              <TrophyItem key={win.id} win={win} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
