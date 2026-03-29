import { useMemo } from 'react'
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
    return `/trophies/medium-${pickVariant(id, 4)}.webp`
  }

  if (member_count >= 5) {
    return `/trophies/small-${pickVariant(id, 4)}.webp`
  }

  // 4 or fewer
  return `/trophies/medal-${pickVariant(id, 4)}.webp`
}

function getTrophySizeClass(memberCount) {
  if (memberCount >= 14) return 'w-28 h-36'
  if (memberCount >= 9) return 'w-24 h-28'
  if (memberCount >= 5) return 'w-20 h-24'
  return 'w-20 h-20'
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

export default function TrophyCase() {
  const { data: wins } = useMyLeagueWins()

  const sorted = useMemo(() => {
    if (!wins?.length) return []
    return [...wins].sort((a, b) => b.member_count - a.member_count)
  }, [wins])

  return (
    <div>
      <h2 className="font-display text-xl text-center mb-4">Trophy Case</h2>
      {!sorted.length ? (
        <EmptyShelf />
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {sorted.map((win) => {
            const src = getTrophyImage(win)
            const sizeClass = getTrophySizeClass(win.member_count)
            return (
              <Link
                to={`/leagues/${win.league_id}`}
                key={win.id}
                className="flex flex-col items-center text-center hover:opacity-80 transition-opacity cursor-pointer"
              >
                <img
                  src={src}
                  alt="Trophy"
                  className={`${sizeClass} object-contain`}
                />
                <p className="text-sm font-semibold mt-2 text-text-primary leading-tight">
                  {win.league_name}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  Outlasted {win.member_count - 1} player{win.member_count - 1 !== 1 ? 's' : ''}
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
