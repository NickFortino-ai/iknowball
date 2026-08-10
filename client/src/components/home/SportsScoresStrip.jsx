import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useScoresStrip, useFinalsForDate } from '../../hooks/useScoresStrip'
import { useAuthStore } from '../../stores/authStore'
import { api } from '../../lib/api'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../../lib/teamLogos'
import StatLeadersBlock from './StatLeadersBlock'

// PT calendar date as YYYY-MM-DD — anchored to America/Los_Angeles so
// it matches the server's sports-day convention. Every US pro sport
// finishes within a PT calendar day, so bucketing by PT date is the
// convention the whole codebase uses (see server/src/utils/sportsDay).
function todayPT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}
function shiftPTDate(dateStr, days) {
  // Noon-anchored so DST transitions never flip the date.
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function labelForPTDate(dateStr) {
  const today = todayPT()
  const yesterday = shiftPTDate(today, -1)
  if (dateStr === today) return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  // Parse as PT-noon so display isn't off by a day for East-Coast browsers.
  const d = new Date(`${dateStr}T12:00:00-07:00`)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })
}

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
  const isAuthenticated = useAuthStore((s) => !!s.session)
  // Settled picks let us paint a green/red border on any Final game
  // the current user picked. Only fetch for logged-in users — no need
  // to burn a request on the public landing view. Uses useQuery
  // directly rather than useMyPicks so we can gate on `enabled` and
  // scope the cache key to the pick indicator use case.
  const { data: settledPicks } = useQuery({
    queryKey: ['scoreboardPickIndicators'],
    queryFn: () => api.get('/picks/me?status=settled'),
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
    retry: false,
  })
  const pickOutcomeByGame = useMemo(() => {
    const map = new Map()
    for (const p of settledPicks || []) {
      if (p.game_id && typeof p.is_correct === 'boolean') {
        map.set(p.game_id, p.is_correct)
      }
    }
    return map
  }, [settledPicks])

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
    // xl:-mx-24 mirrors the Status Tiers section below — pulls the
    // strip wider than the default container at desktop breakpoints
    // so 4 sport columns get real breathing room instead of getting
    // squeezed into ~half the page width.
    <section className="mb-10 xl:-mx-24">
      <h2 className="font-display text-2xl mb-4">Scoreboard</h2>
      <div className={`grid gap-4 ${gridClass}`}>
        {activeSports.map((sport) => (
          <SportColumn
            key={sport.key}
            sport={sport}
            data={data[sport.key]}
            pickOutcomeByGame={pickOutcomeByGame}
          />
        ))}
      </div>
    </section>
  )
}

function SportColumn({ sport, data, pickOutcomeByGame }) {
  // Parent filters out sports with zero games across all buckets before
  // mapping, so we're guaranteed at least one bucket has rows here.
  const live = data?.live || []
  const upcoming = data?.upcoming || []
  const recent = data?.recent || []

  // Mobile-only collapsibility. Desktop (xl+) always shows expanded —
  // there's plenty of room in the 3-4 column grid.
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div>
      <div className="w-full py-2 mb-2 flex items-center justify-between">
        {/* Sport label doubles as the drill-in link. On mobile, the
            entire header area is a collapsible-toggle (the chevron
            button on the right), keeping the drill-in link tappable
            via the label itself. */}
        <Link to={`/scores/${sport.key}`} className="font-display text-lg text-text-primary hover:text-accent transition-colors flex items-center gap-1 group">
          {sport.label}
          <svg className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="xl:hidden text-text-muted"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          <svg
            className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-180'}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
      {/* Body is always rendered on desktop (xl+); mobile respects
          the collapsed toggle via a conditional className swap. */}
      {/* Order: Live → Final → Upcoming → Leaders (top 3). Recent
          finals slot above upcoming so a user landing on a sport with
          a completed slate sees 'what just happened' first — matches
          Sleeper's action-first hierarchy. */}
      <div className={`space-y-4 ${collapsed ? 'hidden xl:block' : ''}`}>
        {live.length > 0 && (
          <BucketSection label="Live" games={live} sportFullKey={sport.fullKey} isLive />
        )}
        {recent.length > 0 && (
          <FinalSection sport={sport} todayRecent={recent} pickOutcomeByGame={pickOutcomeByGame} />
        )}
        {upcoming.length > 0 && (
          <BucketSection label={live.length > 0 ? 'Coming up' : 'Upcoming'} games={upcoming} sportFullKey={sport.fullKey} />
        )}
        <StatLeadersBlock sport={sport.key} mode="compact" />
      </div>
    </div>
  )
}

// Final section with a per-sport date navigator. Default is "today"
// which uses the games already in the strip payload — free, no fetch.
// Tapping the left arrow steps back one PT day and lazy-fetches that
// day's finals via /api/scores/finals. Right arrow disabled once we're
// back at today so users can't scroll into the future here.
function FinalSection({ sport, todayRecent, pickOutcomeByGame }) {
  const today = todayPT()
  const [date, setDate] = useState(today)
  const isToday = date === today
  const { data: fetched, isLoading } = useFinalsForDate(isToday ? null : sport.key, isToday ? null : date)
  const games = isToday ? todayRecent : (fetched || [])

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Final</span>
        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => setDate((d) => shiftPTDate(d, -1))}
            className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
            aria-label="Previous day"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="text-[11px] font-semibold text-text-secondary min-w-[52px] text-center tabular-nums">
            {labelForPTDate(date)}
          </span>
          <button
            type="button"
            onClick={() => setDate((d) => shiftPTDate(d, 1))}
            disabled={isToday}
            className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
            aria-label="Next day"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        {isLoading && !isToday ? (
          <div className="rounded-lg border border-text-primary/10 bg-bg-primary/20 backdrop-blur-md px-4 py-3 text-xs text-text-muted">Loading…</div>
        ) : games.length === 0 ? (
          <div className="rounded-lg border border-text-primary/10 bg-bg-primary/20 backdrop-blur-md px-4 py-3 text-xs text-text-muted">No games</div>
        ) : (
          games.map((g) => (
            <GameCard
              key={g.id}
              game={g}
              sportFullKey={sport.fullKey}
              isFinal
              pickOutcome={pickOutcomeByGame?.get(g.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function BucketSection({ label, games, sportFullKey, isLive, isFinal }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        {isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLive ? 'text-red-400' : 'text-text-muted'}`}>
          {label}
        </span>
      </div>
      <div className="space-y-1.5">
        {games.map((g) => (
          <GameCard key={g.id} game={g} sportFullKey={sportFullKey} isLive={isLive} isFinal={isFinal} />
        ))}
      </div>
    </div>
  )
}

function GameCard({ game, sportFullKey, isLive, isFinal, pickOutcome }) {
  // Live + Final rows show the score inline next to each team.
  // Upcoming rows show a time/date pill on the right instead.
  // Sleeper-style: each matchup is its own subtle bordered card,
  // no outer container wrapping the sport list.
  //
  // Final games the user picked get a green (correct) or red (wrong)
  // outline + faint tint. Only applied when pickOutcome is a bool
  // (undefined = no pick / not authenticated) and we're in isFinal
  // mode — Live/Upcoming don't render the outline.
  const showScore = isLive || isFinal
  const hasPick = isFinal && typeof pickOutcome === 'boolean'
  const outlineClass = hasPick
    ? (pickOutcome
        ? 'border-correct/60 bg-correct/5'
        : 'border-incorrect/60 bg-incorrect/5')
    : 'border-text-primary/10 bg-bg-primary/20'
  return (
    <div className={`rounded-lg border backdrop-blur-md px-4 py-2.5 flex items-center gap-3 ${outlineClass}`}>
      <div className="flex-1 min-w-0 space-y-1.5">
        <TeamRow
          team={game.away_short || game.away_team}
          logoLookupTeam={game.away_team}
          record={game.away_record}
          score={showScore ? game.away_score : null}
          sportFullKey={sportFullKey} isLive={isLive}
        />
        <TeamRow
          team={game.home_short || game.home_team}
          logoLookupTeam={game.home_team}
          record={game.home_record}
          score={showScore ? game.home_score : null}
          sportFullKey={sportFullKey} isLive={isLive}
        />
      </div>
      {!showScore && (
        <div className="shrink-0">
          <TimeBox startsAt={game.starts_at} />
        </div>
      )}
    </div>
  )
}

function TeamRow({ team, logoLookupTeam, record, score, sportFullKey, isLive }) {
  // Logo helper needs the FULL name (Detroit Lions, San Francisco
  // Giants) since it's keyed by full name in the abbreviation map.
  // Display name is the short version passed via `team`.
  const logoUrl = getTeamLogoUrl(logoLookupTeam || team, sportFullKey)
  const fallbackUrl = getTeamLogoFallbackUrl(logoLookupTeam || team, sportFullKey)
  return (
    <div className="flex items-center gap-2.5">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          width="28" height="28"
          className="w-7 h-7 object-contain shrink-0"
          loading="lazy"
          onError={(e) => {
            if (fallbackUrl && e.currentTarget.src !== fallbackUrl) e.currentTarget.src = fallbackUrl
            else e.currentTarget.style.visibility = 'hidden'
          }}
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-bg-secondary shrink-0" />
      )}
      {/* Team name + record share a row that hugs the left. Sleeper
          renders "Red Sox 64-53" with the record right next to the
          team name (not right-aligned), which reads as one unit
          instead of two separate columns. */}
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <span className="text-sm text-text-primary truncate">{team}</span>
        {record && (
          <span className="text-[11px] text-text-muted tabular-nums shrink-0">{record}</span>
        )}
      </div>
      {score != null && (
        <div className={`text-sm font-semibold tabular-nums shrink-0 ${isLive ? 'text-text-primary' : 'text-text-secondary'}`}>
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
