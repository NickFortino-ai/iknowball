import { useState, useMemo } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { useScoresForDay, useSportStandings, useNflSchedule, useNflWeekGames } from '../hooks/useScoresStrip'
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
  const isNfl = sport?.toLowerCase() === 'nfl'

  // NFL uses week-based scrubbing (Thu/Sun/Mon cadence makes daily
  // dates feel wrong). All other sports keep the 7-day strip.
  // The scrubber tracks BOTH week + season_type so preseason (Pre 1-3)
  // and regular (Week 1-18) can coexist in the same strip without
  // collision.
  const nflSchedule = useNflSchedule(isNfl)
  const current = nflSchedule?.data?.current
  const defaultNflSelection = current ? { week: current.week, seasonType: current.season_type } : { week: 1, seasonType: 'pre' }
  const [nflSelection, setNflSelection] = useState(null)
  const activeSelection = nflSelection ?? defaultNflSelection
  const nflSeason = nflSchedule?.data?.season || new Date().getFullYear()
  const { data: nflGames, isLoading: nflGamesLoading } = useNflWeekGames(
    isNfl ? nflSeason : null,
    isNfl ? activeSelection.week : null,
    activeSelection.seasonType,
  )

  const [date, setDate] = useState(todayPT())
  const { data: dailyGames, isLoading: dailyLoading } = useScoresForDay(
    isNfl ? null : sport,
    isNfl ? null : date,
  )
  const { data: standings, isLoading: standingsLoading } = useSportStandings(sport)

  const games = isNfl ? nflGames : dailyGames
  const gamesLoading = isNfl ? nflGamesLoading : dailyLoading

  // 7-day strip for date-based sports.
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

      {/* minmax(0,1fr) so the left column can shrink below its content
          width — without it, the NFL week scrubber (18 buttons at
          ~72px each) forced the whole grid wider than the viewport
          and pushed the standings sidebar off the right edge. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
        {/* LEFT: Scores column */}
        <div>
          <h2 className="font-display text-xl text-text-primary mb-3">Scores</h2>

          {/* Scrubber: NFL uses week buttons, everyone else uses a
              7-day date strip. NFL plays 3 days per week so a daily
              strip felt wrong (empty Wed/Thu/Fri buttons). */}
          {isNfl ? (
            <NflWeekScrubber
              weeks={nflSchedule?.data?.weeks || []}
              activeSelection={activeSelection}
              current={current}
              onPick={setNflSelection}
            />
          ) : (
            <div className="flex items-stretch gap-1 mb-4 min-w-0">
              <button
                onClick={() => setDate((d) => shiftPTDate(d, -1))}
                className="shrink-0 w-9 flex items-center justify-center rounded-lg border border-text-primary/15 hover:bg-bg-secondary transition-colors"
                aria-label="Previous day"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div className="flex-1 min-w-0 flex gap-1 overflow-x-auto scrollbar-hide">
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
          )}

          {/* Scores list */}
          {gamesLoading ? (
            <LoadingSpinner />
          ) : !games?.length ? (
            <div className="rounded-lg border border-text-primary/10 bg-bg-primary/20 backdrop-blur-md px-4 py-6 text-sm text-text-muted text-center">
              {isNfl ? `No games this NFL week yet.` : `No ${config.label} games on ${formatMd(date)}.`}
            </div>
          ) : (
            <div className="space-y-2">
              {games.map((g) => (
                <DrillGameCard key={g.id} game={g} sportFullKey={config.fullKey} showDate={isNfl} />
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
          ) : isNfl ? (
            <NflStandings standings={standings} />
          ) : (
            <StandingsTable rows={standings} />
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

// Bare rows renderer — used by both NFL (per-division sections) and
// the non-NFL sports (single flat table). `showRank` numbers rows;
// off for divisional splits where the ranks aren't meaningful.
function StandingsTable({ rows, showRank = true }) {
  const gridCols = showRank ? 'grid-cols-[28px_1fr_38px_38px_54px]' : 'grid-cols-[1fr_38px_38px_54px]'
  return (
    <div className="rounded-xl border border-text-primary/15 bg-bg-primary/20 backdrop-blur-md overflow-hidden">
      <div className={`grid ${gridCols} gap-2 px-3 py-2 border-b border-text-primary/10 text-[10px] font-semibold uppercase tracking-wider text-text-muted`}>
        {showRank && <span className="text-center">#</span>}
        <span>Team</span>
        <span className="text-right">W</span>
        <span className="text-right">L</span>
        <span className="text-right">PCT</span>
      </div>
      <div className="divide-y divide-text-primary/5">
        {rows.map((row, i) => (
          <div key={row.team_id || row.team_name} className={`grid ${gridCols} gap-2 px-3 py-2 items-center`}>
            {showRank && <span className="text-center text-xs text-text-muted tabular-nums">{i + 1}</span>}
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
  )
}

// NFL standings are always examined by conference (AFC/NFC), and
// within a conference by division (East/North/South/West). Top tabs
// pick the conference (or All for the full 32-team list), sub-tabs
// pick a division. Default 'Divisions' sub-tab shows the conference
// grouped into its four divisional mini-tables.
const NFL_DIVISIONS = ['East', 'North', 'South', 'West']
function NflStandings({ standings }) {
  const [conf, setConf] = useState('All')
  const [div, setDiv] = useState('Divisions')

  const scoped = useMemo(() => {
    if (conf === 'All') return standings
    return standings.filter((r) => (r.group || '').startsWith(conf))
  }, [standings, conf])

  const divisionSections = useMemo(() => {
    if (conf === 'All') return null
    return NFL_DIVISIONS.map((d) => ({
      name: d,
      rows: scoped
        .filter((r) => r.group === `${conf} ${d}`)
        .sort((a, b) => {
          if (b.win_pct !== a.win_pct) return b.win_pct - a.win_pct
          if (b.wins !== a.wins) return b.wins - a.wins
          return a.losses - b.losses
        }),
    })).filter((s) => s.rows.length)
  }, [scoped, conf])

  const filteredForDivTab = useMemo(() => {
    if (conf === 'All' || div === 'Divisions') return null
    return scoped.filter((r) => r.group === `${conf} ${div}`)
  }, [scoped, conf, div])

  return (
    <div>
      {/* Conference tabs */}
      <div className="flex gap-1 mb-2">
        {['All', 'AFC', 'NFC'].map((c) => (
          <button
            key={c}
            onClick={() => setConf(c)}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
              conf === c ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      {/* Division sub-tabs (hidden for All-conferences view) */}
      {conf !== 'All' && (
        <div className="flex gap-1 mb-3 overflow-x-auto scrollbar-hide">
          {['Divisions', ...NFL_DIVISIONS].map((d) => (
            <button
              key={d}
              onClick={() => setDiv(d)}
              className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${
                div === d
                  ? 'bg-accent/15 text-text-primary border border-accent/60'
                  : 'bg-bg-secondary text-text-muted hover:text-text-primary border border-transparent'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}
      {/* Body: All → flat 32-team; conference + Divisions → grouped;
          conference + specific division → single 4-team table. */}
      {conf === 'All' ? (
        <StandingsTable rows={scoped} />
      ) : div === 'Divisions' ? (
        <div className="space-y-3">
          {divisionSections.map((s) => (
            <div key={s.name}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1 px-1">{conf} {s.name}</div>
              <StandingsTable rows={s.rows} showRank={false} />
            </div>
          ))}
        </div>
      ) : (
        <StandingsTable rows={filteredForDivTab || []} showRank={false} />
      )}
    </div>
  )
}

// NFL week scrubber — horizontal strip mixing preseason (PRE 1-3)
// and regular season (WEEK 1-18) buttons. Identity is (season_type,
// week). 'NOW' badge only fires on the actually-current week (i.e.
// during preseason, PRE 1 gets NOW; WEEK 1 does not).
function NflWeekScrubber({ weeks, activeSelection, current, onPick }) {
  const activeIdx = weeks.findIndex((w) => w.season_type === activeSelection.seasonType && w.week === activeSelection.week)
  const goPrev = () => {
    if (activeIdx > 0) {
      const w = weeks[activeIdx - 1]
      onPick({ week: w.week, seasonType: w.season_type })
    }
  }
  const goNext = () => {
    if (activeIdx >= 0 && activeIdx < weeks.length - 1) {
      const w = weeks[activeIdx + 1]
      onPick({ week: w.week, seasonType: w.season_type })
    }
  }
  return (
    <div className="flex items-stretch gap-1 mb-4 min-w-0">
      <button
        onClick={goPrev}
        disabled={activeIdx <= 0}
        className="shrink-0 w-9 flex items-center justify-center rounded-lg border border-text-primary/15 hover:bg-bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Previous week"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <div className="flex-1 min-w-0 flex gap-1 overflow-x-auto scrollbar-hide">
        {weeks.map((w) => {
          const key = `${w.season_type}-${w.week}`
          const isSelected = w.season_type === activeSelection.seasonType && w.week === activeSelection.week
          const isCurrent = current && current.season_type === w.season_type && current.week === w.week
          const label = w.season_type === 'pre' ? `PRE ${w.week}` : `WEEK ${w.week}`
          // Current week gets a bolder outline; selected week gets the
          // accent fill. When both apply (the default landing state),
          // selected wins visually.
          return (
            <button
              key={key}
              onClick={() => onPick({ week: w.week, seasonType: w.season_type })}
              className={`shrink-0 min-w-[72px] rounded-lg py-2 px-2 flex flex-col items-center transition-colors ${
                isSelected
                  ? 'border border-accent bg-accent/10 text-text-primary'
                  : isCurrent
                  ? 'border-2 border-text-primary/60 text-text-primary hover:bg-bg-secondary'
                  : 'border border-text-primary/15 text-text-secondary hover:bg-bg-secondary'
              }`}
            >
              <span className="text-[10px] font-semibold tracking-wider">{label}</span>
              <span className="text-[10px] text-text-muted tabular-nums mt-0.5">{formatWeekRange(w.start, w.end)}</span>
            </button>
          )
        })}
      </div>
      <button
        onClick={goNext}
        disabled={activeIdx < 0 || activeIdx >= weeks.length - 1}
        className="shrink-0 w-9 flex items-center justify-center rounded-lg border border-text-primary/15 hover:bg-bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next week"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  )
}

function formatWeekRange(startStr, endStr) {
  if (!startStr) return ''
  const s = new Date(`${startStr}T12:00:00Z`)
  const e = endStr ? new Date(`${endStr}T12:00:00Z`) : s
  const sMonth = s.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const eMonth = e.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const sDay = s.getUTCDate()
  const eDay = e.getUTCDate()
  if (sMonth === eMonth) return `${sMonth} ${sDay}–${eDay}`
  return `${sMonth} ${sDay}–${eMonth} ${eDay}`
}

// Drill-in game card — richer than the landing strip's compact rows.
// Time / status pill top-left, teams stacked with logo + name + record
// + score on the right. showDate adds a Day, Mon DD prefix — used
// for NFL where a week bunches Thu/Sun/Mon games together so time
// alone doesn't tell you which day the game is on.
function DrillGameCard({ game, sportFullKey, showDate }) {
  const isLive = game.status === 'live'
  const isFinal = game.status === 'final'
  const showScore = isLive || isFinal
  const timeStr = new Date(game.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const dateStr = showDate ? new Date(game.starts_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : null
  const timeLabel = isLive ? 'LIVE' : isFinal ? 'FINAL' : timeStr
  const dateLabel = showDate && !isLive ? dateStr : null

  return (
    <div className="rounded-lg border border-text-primary/10 bg-bg-primary/20 backdrop-blur-md px-4 py-3">
      <div className="flex items-center gap-3 mb-2">
        {isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${isLive ? 'text-red-400' : isFinal ? 'text-text-muted' : 'text-text-secondary'}`}>
          {timeLabel}
        </span>
        {dateLabel && (
          <span className="text-[11px] text-text-muted">· {dateLabel}{isFinal ? '' : ` · ${timeStr}`}</span>
        )}
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
