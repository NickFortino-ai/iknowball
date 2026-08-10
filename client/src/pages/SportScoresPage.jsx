import { useState, useMemo } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { useScoresForDay, useSportStandings } from '../hooks/useScoresStrip'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../lib/teamLogos'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import StatLeadersBlock from '../components/home/StatLeadersBlock'

// /scores/:sport — Sleeper-style drill-in for one sport: date scrubber
// + full day's scores on the left, standings sidebar on the right.
// Session-3's stat leaders will land in the same right-column stack
// under the standings.
//
// Route param is short sport key: nfl / nba / mlb / wnba. Anything
// else redirects back to home.

const SPORTS = {
  nfl: { label: 'NFL', fullKey: 'americanfootball_nfl' },
  nba: { label: 'NBA', fullKey: 'basketball_nba' },
  mlb: { label: 'MLB', fullKey: 'baseball_mlb' },
  wnba: { label: 'WNBA', fullKey: 'basketball_wnba' },
}

// PT calendar day math, matches server's sportsDayBoundsUtc anchor.
function todayPT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}
function shiftPTDate(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function labelForPTDate(dateStr) {
  const today = todayPT()
  if (dateStr === today) return { day: 'TODAY', md: formatMd(dateStr) }
  const d = new Date(`${dateStr}T12:00:00-07:00`)
  const day = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' }).toUpperCase()
  return { day, md: formatMd(dateStr) }
}
function formatMd(dateStr) {
  const d = new Date(`${dateStr}T12:00:00-07:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })
}

export default function SportScoresPage() {
  const { sport } = useParams()
  const config = SPORTS[sport?.toLowerCase()]
  if (!config) return <Navigate to="/" replace />

  const [date, setDate] = useState(todayPT())
  const { data: games, isLoading: gamesLoading } = useScoresForDay(sport, date)
  const { data: standings, isLoading: standingsLoading } = useSportStandings(sport)

  // 7-day strip centered on the selected date: 3 back, current, 3 forward.
  const stripDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => shiftPTDate(date, i - 3))
  }, [date])

  return (
    <div className="mx-auto max-w-6xl py-4 px-4">
      {/* Back link to the landing scoreboard */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors mb-2"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Scores
      </Link>
      <h1 className="font-display text-3xl md:text-4xl text-text-primary mb-6">{config.label}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* LEFT: Scores column */}
        <div>
          <h2 className="font-display text-xl text-text-primary mb-3">Scores</h2>

          {/* Date scrubber */}
          <div className="flex items-stretch gap-1 mb-4">
            <button
              onClick={() => setDate((d) => shiftPTDate(d, -1))}
              className="shrink-0 w-9 flex items-center justify-center rounded-lg border border-text-primary/15 hover:bg-bg-secondary transition-colors"
              aria-label="Previous day"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="flex-1 flex gap-1 overflow-x-auto scrollbar-hide">
              {stripDates.map((d) => {
                const isSelected = d === date
                const { day, md } = labelForPTDate(d)
                return (
                  <button
                    key={d}
                    onClick={() => setDate(d)}
                    className={`flex-1 min-w-[60px] rounded-lg border py-2 px-2 flex flex-col items-center transition-colors ${
                      isSelected
                        ? 'border-accent bg-accent/10 text-text-primary'
                        : 'border-text-primary/15 text-text-secondary hover:bg-bg-secondary'
                    }`}
                  >
                    <span className="text-[10px] font-semibold tracking-wider">{day}</span>
                    <span className="text-xs font-semibold tabular-nums mt-0.5">{md}</span>
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setDate((d) => shiftPTDate(d, 1))}
              className="shrink-0 w-9 flex items-center justify-center rounded-lg border border-text-primary/15 hover:bg-bg-secondary transition-colors"
              aria-label="Next day"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Scores list */}
          {gamesLoading ? (
            <LoadingSpinner />
          ) : !games?.length ? (
            <div className="rounded-lg border border-text-primary/10 bg-bg-primary/20 backdrop-blur-md px-4 py-6 text-sm text-text-muted text-center">
              No {config.label} games on {formatMd(date)}.
            </div>
          ) : (
            <div className="space-y-2">
              {games.map((g) => (
                <DrillGameCard key={g.id} game={g} sportFullKey={config.fullKey} />
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Standings sidebar + Stat leaders */}
        <div className="space-y-6">
          <div>
          <h2 className="font-display text-xl text-text-primary mb-3">Standings</h2>
          {standingsLoading ? (
            <LoadingSpinner />
          ) : !standings?.length ? (
            <div className="rounded-lg border border-text-primary/10 bg-bg-primary/20 backdrop-blur-md px-4 py-6 text-sm text-text-muted text-center">
              Standings not available.
            </div>
          ) : (
            <div className="rounded-xl border border-text-primary/15 bg-bg-primary/20 backdrop-blur-md overflow-hidden">
              <div className="grid grid-cols-[28px_1fr_38px_38px_54px] gap-2 px-3 py-2 border-b border-text-primary/10 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                <span className="text-center">#</span>
                <span>Team</span>
                <span className="text-right">W</span>
                <span className="text-right">L</span>
                <span className="text-right">PCT</span>
              </div>
              <div className="divide-y divide-text-primary/5">
                {standings.map((row, i) => (
                  <div key={row.team_id || row.team_name} className="grid grid-cols-[28px_1fr_38px_38px_54px] gap-2 px-3 py-2 items-center">
                    <span className="text-center text-xs text-text-muted tabular-nums">{i + 1}</span>
                    <div className="flex items-center gap-2 min-w-0">
                      {row.logo ? (
                        <img src={row.logo} alt="" width="18" height="18" className="w-4 h-4 object-contain shrink-0" loading="lazy" onError={(e) => e.currentTarget.style.visibility = 'hidden'} />
                      ) : <span className="w-4 h-4 shrink-0" />}
                      <span className="text-sm text-text-primary truncate">{row.short_name}</span>
                    </div>
                    <span className="text-right text-sm text-text-primary tabular-nums">{row.wins}</span>
                    <span className="text-right text-sm text-text-primary tabular-nums">{row.losses}</span>
                    <span className="text-right text-sm text-text-muted tabular-nums">{formatPct(row.win_pct)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
          {/* Stat Leaders block — full top-10 with headshots */}
          <StatLeadersBlock sport={sport} mode="full" />
        </div>
      </div>
    </div>
  )
}

function formatPct(v) {
  if (v == null || isNaN(v)) return '—'
  return v.toFixed(3).replace(/^0\./, '.')
}

// Drill-in game card — richer than the landing strip's compact rows.
// Time / status pill top-left, teams stacked with logo + name + record
// + score on the right.
function DrillGameCard({ game, sportFullKey }) {
  const isLive = game.status === 'live'
  const isFinal = game.status === 'final'
  const showScore = isLive || isFinal
  const timeLabel = isLive ? 'LIVE' : isFinal ? 'FINAL' : new Date(game.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return (
    <div className="rounded-lg border border-text-primary/10 bg-bg-primary/20 backdrop-blur-md px-4 py-3">
      <div className="flex items-center gap-3 mb-2">
        {isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${isLive ? 'text-red-400' : isFinal ? 'text-text-muted' : 'text-text-secondary'}`}>
          {timeLabel}
        </span>
      </div>
      {/* MLB R/H/E header when linescore is present */}
      {game.linescore && (
        <div className="flex justify-end gap-3 mb-1 pr-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted w-5 text-center">R</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted w-5 text-center">H</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted w-5 text-center">E</span>
        </div>
      )}
      <div className="space-y-1.5">
        <DrillTeamRow team={game.away_short || game.away_team} fullTeam={game.away_team} record={game.away_record} score={showScore ? game.away_score : null} hits={game.linescore?.away?.h} errors={game.linescore?.away?.e} sportFullKey={sportFullKey} isLive={isLive} />
        <DrillTeamRow team={game.home_short || game.home_team} fullTeam={game.home_team} record={game.home_record} score={showScore ? game.home_score : null} hits={game.linescore?.home?.h} errors={game.linescore?.home?.e} sportFullKey={sportFullKey} isLive={isLive} />
      </div>
    </div>
  )
}

function DrillTeamRow({ team, fullTeam, record, score, hits, errors, sportFullKey, isLive }) {
  const logoUrl = getTeamLogoUrl(fullTeam || team, sportFullKey)
  const fallbackUrl = getTeamLogoFallbackUrl(fullTeam || team, sportFullKey)
  return (
    <div className="flex items-center gap-3">
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
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <span className="text-sm text-text-primary truncate">{team}</span>
        {record && <span className="text-[11px] text-text-muted tabular-nums shrink-0">{record}</span>}
      </div>
      {/* MLB R H E block (R bold, H/E lighter). Falls back to plain
          score for non-MLB rows. */}
      {score != null && (hits != null || errors != null) ? (
        <div className="flex items-baseline gap-3 shrink-0 tabular-nums">
          <span className={`w-5 text-center text-lg font-semibold ${isLive ? 'text-text-primary' : 'text-text-secondary'}`}>{score}</span>
          <span className="w-5 text-center text-sm text-text-muted">{hits != null ? hits : ''}</span>
          <span className="w-5 text-center text-sm text-text-muted">{errors != null ? errors : ''}</span>
        </div>
      ) : score != null ? (
        <div className={`text-lg font-semibold tabular-nums shrink-0 ${isLive ? 'text-text-primary' : 'text-text-secondary'}`}>
          {score}
        </div>
      ) : null}
    </div>
  )
}
