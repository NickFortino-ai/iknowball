import { useMemo } from 'react'
import { useScoresStrip } from '../../hooks/useScoresStrip'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../../lib/teamLogos'

// Landing-page scores strip modeled loosely on Sleeper's homepage —
// four sport columns (NFL / MLB / WNBA / NBA) each showing what's live,
// what's coming up, and what just finished. Sits between Open Leagues
// and Status Tiers on the HomePage.
//
// Data comes from GET /api/scores/strip (public, no auth). The hook
// polls every 20s when any game is live, every 5min otherwise.
//
// This is Phase 1 of the landing revamp — scores only. Standings and
// stat leaders land in follow-up sessions; the sport-column shell here
// is the surface those will slot into.

const SPORTS = [
  { key: 'nfl', label: 'NFL', fullKey: 'americanfootball_nfl' },
  { key: 'mlb', label: 'MLB', fullKey: 'baseball_mlb' },
  { key: 'wnba', label: 'WNBA', fullKey: 'basketball_wnba' },
  { key: 'nba', label: 'NBA', fullKey: 'basketball_nba' },
]

// Grid class per active-sport count. Static classes (not built via
// string interpolation) so Tailwind's JIT picks them up at build
// time. Missing sport columns just get the row width redistributed
// instead of leaving a hollow slot for an offseason sport.
const GRID_CLASSES = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
}

export default function SportsScoresStrip() {
  const { data, isLoading, error } = useScoresStrip()

  // Only render sports with at least one game across any bucket. An
  // offseason sport (NBA in August) drops its column entirely so the
  // remaining columns widen to fill the row — no hollow slot.
  const activeSports = useMemo(() => {
    if (!data) return []
    return SPORTS.filter((s) => {
      const col = data[s.key]
      return (col?.live?.length || 0) + (col?.upcoming?.length || 0) + (col?.recent?.length || 0) > 0
    })
  }, [data])

  if (isLoading) return null
  if (error) return null
  if (!activeSports.length) return null

  const gridClass = GRID_CLASSES[activeSports.length] || GRID_CLASSES[4]

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-display text-2xl">Scoreboard</h2>
        <span className="text-xs text-text-muted">Auto-updating</span>
      </div>
      <div className={`grid gap-4 ${gridClass}`}>
        {activeSports.map((sport) => (
          <SportColumn key={sport.key} sport={sport} data={data[sport.key]} />
        ))}
      </div>
    </section>
  )
}

function SportColumn({ sport, data }) {
  // Parent filters out sports with zero games across all buckets before
  // mapping, so we're guaranteed at least one bucket has rows here.
  const live = data?.live || []
  const upcoming = data?.upcoming || []
  const recent = data?.recent || []

  return (
    <div className="rounded-xl border border-text-primary/15 bg-bg-primary/40 backdrop-blur-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-text-primary/10">
        <h3 className="font-display text-lg text-text-primary">{sport.label}</h3>
      </div>
      <div className="divide-y divide-text-primary/10">
        {live.length > 0 && (
          <BucketSection label="Live" games={live} sportFullKey={sport.fullKey} isLive />
        )}
        {upcoming.length > 0 && (
          <BucketSection label={live.length > 0 ? 'Coming up' : 'Upcoming'} games={upcoming} sportFullKey={sport.fullKey} />
        )}
        {recent.length > 0 && (
          <BucketSection label="Final" games={recent} sportFullKey={sport.fullKey} isFinal />
        )}
      </div>
    </div>
  )
}

function BucketSection({ label, games, sportFullKey, isLive, isFinal }) {
  return (
    <div>
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        {isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLive ? 'text-red-400' : 'text-text-muted'}`}>
          {label}
        </span>
      </div>
      <div>
        {games.map((g) => (
          <GameRow key={g.id} game={g} sportFullKey={sportFullKey} isLive={isLive} isFinal={isFinal} />
        ))}
      </div>
    </div>
  )
}

function GameRow({ game, sportFullKey, isLive, isFinal }) {
  // Live + Final rows show the score inline next to each team.
  // Upcoming rows show a time/date pill on the right instead.
  const showScore = isLive || isFinal
  return (
    <div className="px-4 py-2 flex items-center gap-3">
      <div className="flex-1 min-w-0 space-y-1">
        <TeamRow team={game.away_team} score={showScore ? game.away_score : null} sportFullKey={sportFullKey} isLive={isLive} />
        <TeamRow team={game.home_team} score={showScore ? game.home_score : null} sportFullKey={sportFullKey} isLive={isLive} />
      </div>
      {!showScore && (
        <div className="shrink-0">
          <TimeBox startsAt={game.starts_at} />
        </div>
      )}
    </div>
  )
}

function TeamRow({ team, score, sportFullKey, isLive }) {
  const logoUrl = getTeamLogoUrl(team, sportFullKey)
  const fallbackUrl = getTeamLogoFallbackUrl(team, sportFullKey)
  return (
    <div className="flex items-center gap-2">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          width="20" height="20"
          className="w-5 h-5 object-contain shrink-0"
          loading="lazy"
          onError={(e) => {
            if (fallbackUrl && e.currentTarget.src !== fallbackUrl) e.currentTarget.src = fallbackUrl
            else e.currentTarget.style.visibility = 'hidden'
          }}
        />
      ) : (
        <div className="w-5 h-5 rounded-full bg-bg-secondary shrink-0" />
      )}
      <div className="flex-1 min-w-0 text-sm text-text-primary truncate">{team}</div>
      {score != null && (
        <div className={`text-sm font-semibold tabular-nums ${isLive ? 'text-text-primary' : 'text-text-secondary'}`}>
          {score}
        </div>
      )}
    </div>
  )
}

function TimeBox({ startsAt }) {
  if (!startsAt) return null
  const d = new Date(startsAt)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const isToday = new Date().toDateString() === d.toDateString()
  return (
    <div className="text-[11px] text-text-muted leading-tight text-right">
      <div className="font-semibold text-text-secondary">{isToday ? 'Today' : day}</div>
      <div>{time}</div>
    </div>
  )
}
