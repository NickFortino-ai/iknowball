import { useState } from 'react'
import { useSportLeaders } from '../../hooks/useScoresStrip'
import LoadingSpinner from '../ui/LoadingSpinner'
import PlayerDetailModal from '../ui/PlayerDetailModal'

// Circular player avatar with graceful fallback. When the headshot
// image is missing or fails to load, we render the player's initials
// on the same neutral background instead of an empty gray circle.
// Common in MLS + lower-division NCAA where ESPN's coverage is spotty.
function initialsFor(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] || ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase() || '?'
}
const AVATAR_SIZE = {
  sm: 'w-6 h-6 text-[10px]',
  lg: 'w-8 h-8 text-[11px]',
}
function PlayerAvatar({ name, headshot, size = 'sm' }) {
  const [broken, setBroken] = useState(false)
  const sizeClass = AVATAR_SIZE[size] || AVATAR_SIZE.sm
  if (!headshot || broken) {
    return (
      <span className={`${sizeClass} rounded-full bg-bg-secondary shrink-0 flex items-center justify-center font-semibold text-text-secondary tabular-nums`}>
        {initialsFor(name)}
      </span>
    )
  }
  return (
    <img
      src={headshot}
      alt=""
      className={`${sizeClass} rounded-full object-cover shrink-0 bg-bg-secondary`}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  )
}

// Reusable stat-leaders block. Two modes:
//   compact: top 3 with mini rows (headshot + name + value). Used on
//     the landing card under Final.
//   full: top 10 with headshots + rank column. Used on the drill-in
//     page under Standings.
//
// Both modes render tabs across category labels (HR, RBI, AVG, ...)
// so the user can flip which stat is showing without loading a
// separate view. Server returns all categories up front, so the tabs
// switch is a client-only state change.
// This block is handed a SHORT sport key ('mlb'); the player modal and its
// gamelog endpoint want the full key ('baseball_mlb').
const SHORT_TO_FULL = {
  nfl: 'americanfootball_nfl',
  nba: 'basketball_nba',
  mlb: 'baseball_mlb',
  wnba: 'basketball_wnba',
  nhl: 'icehockey_nhl',
  mls: 'soccer_usa_mls',
  ncaaf: 'americanfootball_ncaaf',
  ncaab: 'basketball_ncaab',
}

// Only these have a gamelog behind them (players.js ESPN_SPORT_PATHS).
// Rows stay inert for the rest rather than opening a modal with nothing in
// it — NCAAF, NCAAB and MLS leaders are display-only.
const TAPPABLE_SPORTS = new Set(['americanfootball_nfl', 'basketball_nba', 'basketball_wnba', 'baseball_mlb', 'icehockey_nhl'])

export default function StatLeadersBlock({ sport, mode = 'full' }) {
  const { data, isLoading } = useSportLeaders(sport)
  const [activeIdx, setActiveIdx] = useState(0)
  const [selected, setSelected] = useState(null)

  const fullSport = SHORT_TO_FULL[sport] || sport
  const tappable = TAPPABLE_SPORTS.has(fullSport)
  // Map a leaders row onto the shape PlayerDetailModal reads. athlete_id is
  // an ESPN athlete id, which is exactly the lookup key it prefers.
  const openPlayer = (r) => setSelected({
    espn_player_id: r.athlete_id,
    player_name: r.athlete_name,
    headshot_url: r.headshot,
    position: r.position,
    team: r.team_abbr,
  })

  if (isLoading) return mode === 'compact' ? null : <LoadingSpinner />
  const cats = data?.categories || []
  if (!cats.length) return null

  const active = cats[Math.min(activeIdx, cats.length - 1)]
  const rowCount = mode === 'compact' ? 5 : 10
  const rows = (active?.leaders || []).slice(0, rowCount)

  return (
    <div>
      {mode === 'full' && (
        <h2 className="font-display text-xl text-text-primary mb-3">Stat Leaders</h2>
      )}
      {mode === 'compact' && (
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Leaders</span>
          {data?.season && data.season !== new Date().getFullYear() && (
            <span className="text-[9px] text-text-muted">({data.season} season)</span>
          )}
        </div>
      )}
      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide mb-2">
        {cats.map((c, i) => (
          <button
            key={c.name}
            onClick={() => setActiveIdx(i)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${
              i === activeIdx
                ? 'bg-accent text-white'
                : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {mode === 'full' ? (
        <div className="rounded-xl border border-text-primary/15 bg-bg-primary/20 backdrop-blur-md overflow-hidden">
          {rows.map((r) => (
            <div
              key={`${r.athlete_id}-${r.rank}`}
              onClick={tappable ? () => openPlayer(r) : undefined}
              className={`flex items-center gap-3 px-3 py-2 border-b border-text-primary/5 last:border-0${tappable ? ' cursor-pointer hover:bg-text-primary/5 transition-colors' : ''}`}
            >
              <span className="w-6 text-center text-xs text-text-muted tabular-nums shrink-0">{r.rank}</span>
              <PlayerAvatar name={r.athlete_name} headshot={r.headshot} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-primary truncate">{r.athlete_name}</div>
                <div className="text-[11px] text-text-muted flex items-center gap-1.5">
                  {(r.team_short || r.team_abbr) && <span className="truncate">{r.team_short || r.team_abbr}</span>}
                  {r.position && <span>· {r.position}</span>}
                </div>
              </div>
              <div className="text-sm font-semibold tabular-nums text-text-primary shrink-0">
                {r.display_value}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div
              key={`${r.athlete_id}-${r.rank}`}
              onClick={tappable ? () => openPlayer(r) : undefined}
              className={`rounded-lg border border-text-primary/10 bg-bg-primary/20 backdrop-blur-md px-3 py-2 flex items-center gap-2.5${tappable ? ' cursor-pointer hover:bg-bg-primary/30 transition-colors' : ''}`}
            >
              <span className="w-4 text-center text-xs text-text-muted tabular-nums shrink-0">{r.rank}</span>
              <PlayerAvatar name={r.athlete_name} headshot={r.headshot} size="sm" />
              <div className="flex-1 min-w-0 flex items-baseline gap-2">
                <span className="text-sm text-text-primary truncate">{r.athlete_name}</span>
                {(r.team_short || r.team_abbr) && <span className="text-[10px] text-text-muted shrink-0 truncate max-w-[5.5rem]">{r.team_short || r.team_abbr}</span>}
              </div>
              <div className="text-sm font-semibold tabular-nums text-text-primary shrink-0">
                {r.display_value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* showFantasyPoints stays at its default false: this is the scoreboard,
          outside any fantasy league, so the modal shows real stats only. */}
      {selected && (
        <PlayerDetailModal
          player={selected}
          sport={fullSport}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
