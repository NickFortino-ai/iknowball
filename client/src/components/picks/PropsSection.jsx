import { useMemo, useState } from 'react'
import { useAppConfig } from '../../hooks/useAppConfig'
import { useLoadedProps, useMyPropPicks, useMyPropLiveStats, useSubmitPropPick, useDeletePropPick } from '../../hooks/useProps'
import PropCard from './PropCard'
import LoadingSpinner from '../ui/LoadingSpinner'
import { toast } from '../ui/Toast'
import { triggerHaptic } from '../../lib/haptics'

// Sport tile display order + labels. Order controls how tiles appear in
// the grid (top-left first). Only sports the admin has toggled ON in the
// props_sport_visibility remote-config knob are actually rendered.
const SPORT_TILES = [
  { key: 'nba', label: 'NBA' },
  { key: 'wnba', label: 'WNBA' },
  { key: 'mlb', label: 'MLB' },
  { key: 'nfl', label: 'NFL' },
  { key: 'ncaaf', label: 'NCAAF' },
  { key: 'ncaab', label: 'NCAAB' },
  { key: 'wncaab', label: 'WNCAAB' },
  { key: 'nhl', label: 'NHL' },
  { key: 'ufl', label: 'UFL' },
  { key: 'mls', label: 'MLS' },
  { key: 'wc', label: 'WC' },
]

// Markets available per sport, in display order. First entry is
// auto-expanded when a user opens a sport — pick the most popular market
// per sport so the first paint is what most users came to bet.
const MARKETS_BY_SPORT = {
  nba: [
    { key: 'player_points', label: 'Points' },
    { key: 'player_rebounds', label: 'Rebounds' },
    { key: 'player_assists', label: 'Assists' },
    { key: 'player_threes', label: '3-Pointers Made' },
    { key: 'player_points_rebounds_assists', label: 'Pts + Reb + Ast' },
    { key: 'player_blocks', label: 'Blocks' },
    { key: 'player_steals', label: 'Steals' },
    { key: 'player_points_rebounds', label: 'Pts + Reb' },
    { key: 'player_points_assists', label: 'Pts + Ast' },
    { key: 'player_rebounds_assists', label: 'Reb + Ast' },
  ],
  wnba: [
    { key: 'player_points', label: 'Points' },
    { key: 'player_rebounds', label: 'Rebounds' },
    { key: 'player_assists', label: 'Assists' },
    { key: 'player_threes', label: '3-Pointers Made' },
    { key: 'player_points_rebounds_assists', label: 'Pts + Reb + Ast' },
    { key: 'player_blocks', label: 'Blocks' },
    { key: 'player_steals', label: 'Steals' },
    { key: 'player_points_rebounds', label: 'Pts + Reb' },
    { key: 'player_points_assists', label: 'Pts + Ast' },
    { key: 'player_rebounds_assists', label: 'Reb + Ast' },
  ],
  ncaab: [
    { key: 'player_points', label: 'Points' },
    { key: 'player_rebounds', label: 'Rebounds' },
    { key: 'player_assists', label: 'Assists' },
    { key: 'player_threes', label: '3-Pointers Made' },
  ],
  mlb: [
    { key: 'batter_hits', label: 'Hits' },
    { key: 'batter_home_runs', label: 'Home Runs' },
    { key: 'pitcher_strikeouts', label: 'Strikeouts' },
    { key: 'batter_rbis', label: 'RBIs' },
    { key: 'batter_total_bases', label: 'Total Bases' },
    { key: 'batter_walks', label: 'Walks' },
    { key: 'batter_stolen_bases', label: 'Stolen Bases' },
  ],
  nfl: [
    { key: 'player_pass_yds', label: 'Pass Yards' },
    { key: 'player_rush_yds', label: 'Rush Yards' },
    { key: 'player_reception_yds', label: 'Receiving Yards' },
    { key: 'player_receptions', label: 'Receptions' },
    { key: 'player_anytime_td', label: 'Anytime TD' },
    { key: 'player_pass_tds', label: 'Pass TDs' },
    { key: 'player_pass_completions', label: 'Completions' },
    { key: 'player_pass_attempts', label: 'Pass Attempts' },
    { key: 'player_pass_interceptions', label: 'Interceptions' },
    { key: 'player_rush_attempts', label: 'Rush Attempts' },
  ],
  ncaaf: [
    { key: 'player_pass_yds', label: 'Pass Yards' },
    { key: 'player_rush_yds', label: 'Rush Yards' },
    { key: 'player_reception_yds', label: 'Receiving Yards' },
    { key: 'player_receptions', label: 'Receptions' },
    { key: 'player_anytime_td', label: 'Anytime TD' },
  ],
}

// Convert American odds to implied probability. Used for the sort
// tiebreaker so props with balanced odds (closest to a coin flip) sit
// above lopsided ones inside the same line-size band.
function impliedProb(americanOdds) {
  if (americanOdds == null) return null
  if (americanOdds > 0) return 100 / (americanOdds + 100)
  return -americanOdds / (-americanOdds + 100)
}

function oddsImbalance(overOdds, underOdds) {
  const o = impliedProb(overOdds)
  const u = impliedProb(underOdds)
  if (o == null || u == null) return 999
  return Math.abs(o - u)
}

// Line desc, then least-lopsided odds first as tiebreaker. For binary
// props like HR (line 0.5 for all players), everyone shares the primary
// key so imbalance decides — Judge (-180 to homer) sits above utility
// infielder (+700 to homer).
function sortProps(props) {
  return [...props].sort((a, b) => {
    const lineDelta = (b.line || 0) - (a.line || 0)
    if (lineDelta !== 0) return lineDelta
    return oddsImbalance(a.over_odds, a.under_odds) - oddsImbalance(b.over_odds, b.under_odds)
  })
}

export default function PropsSection() {
  const { data: cfg } = useAppConfig()
  const visibility = cfg?.props_sport_visibility || {}
  const [selectedSport, setSelectedSport] = useState(null)

  const visibleTiles = useMemo(() => {
    return SPORT_TILES.filter((t) => visibility[t.key])
  }, [visibility])

  if (selectedSport) {
    return (
      <SportPropsView
        sport={selectedSport}
        onBack={() => setSelectedSport(null)}
      />
    )
  }

  if (!visibleTiles.length) {
    return (
      <div className="text-center py-16 text-text-secondary">
        <div className="font-display text-lg mb-2">No prop sports available</div>
        <div className="text-sm text-text-muted">Check back closer to game time.</div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="font-display text-xl mb-4">Choose a sport</h2>
      <div className="grid grid-cols-2 gap-3">
        {visibleTiles.map((tile) => (
          <button
            key={tile.key}
            onClick={() => setSelectedSport(tile.key)}
            className="bg-bg-primary border border-text-primary/20 hover:border-text-primary/40 rounded-2xl px-6 py-10 transition-all hover:scale-[1.02] hover:shadow-lg"
          >
            <div className="font-display text-3xl text-text-primary">{tile.label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function SportPropsView({ sport, onBack }) {
  const markets = MARKETS_BY_SPORT[sport] || []
  const label = SPORT_TILES.find((t) => t.key === sport)?.label || sport.toUpperCase()

  // First market expanded by default. Track expansions as a Set so each
  // group's fetch fires only when a user opens it (server-side cache
  // absorbs concurrent opens across users).
  const [expanded, setExpanded] = useState(() => new Set(markets[0] ? [markets[0].key] : []))

  function toggle(marketKey) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(marketKey)) next.delete(marketKey)
      else next.add(marketKey)
      return next
    })
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-bg-primary border border-text-primary/20 text-text-primary hover:border-text-primary/40"
          aria-label="Back to sport grid"
        >
          ‹
        </button>
        <h2 className="font-display text-2xl">{label} Props</h2>
      </div>

      {markets.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          <div className="font-display text-lg mb-2">No markets configured for {label}</div>
          <div className="text-sm text-text-muted">Ask an admin to add markets for this sport.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {markets.map((market) => (
            <MarketGroup
              key={market.key}
              sport={sport}
              market={market}
              expanded={expanded.has(market.key)}
              onToggle={() => toggle(market.key)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MarketGroup({ sport, market, expanded, onToggle }) {
  const { data: props, isLoading } = useLoadedProps(sport, market.key, { enabled: expanded })
  const { data: myPropPicks } = useMyPropPicks()
  const hasLockedProps = (myPropPicks || []).some((p) => p.status === 'locked')
  const { data: liveStatsMap } = useMyPropLiveStats({ hasLive: hasLockedProps })
  const submitPick = useSubmitPropPick()
  const deletePick = useDeletePropPick()

  // Only surface pickable rows in the list — 'locked' props are past
  // start-of-game and 'settled' are already resolved. Belt-and-suspenders:
  // also drop any published prop whose game.starts_at has already passed
  // in case the lock job is late.
  const activeProps = useMemo(() => {
    if (!props?.length) return []
    const now = Date.now()
    const filtered = props.filter((p) => {
      if (p.status !== 'published') return false
      if (p.games?.starts_at && new Date(p.games.starts_at).getTime() <= now) return false
      return true
    })
    return sortProps(filtered)
  }, [props])

  function getPick(propId) {
    if (!myPropPicks) return null
    const pick = myPropPicks.find((p) => p.prop_id === propId)
    if (!pick) return null
    if (liveStatsMap?.[pick.id] != null) return { ...pick, live_stat: liveStatsMap[pick.id] }
    return pick
  }

  async function handlePick(propId, side) {
    try {
      await submitPick.mutateAsync({ propId, pickedSide: side })
      triggerHaptic('Light')
      toast('Prop pick submitted!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to submit prop pick', 'error')
    }
  }

  async function handleUndoPick(propId) {
    try {
      await deletePick.mutateAsync(propId)
      toast('Prop pick removed', 'info')
    } catch (err) {
      toast(err.message || 'Failed to undo prop pick', 'error')
    }
  }

  return (
    <div className="bg-bg-primary border border-text-primary/20 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-primary/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-display text-lg">{market.label}</span>
          {expanded && activeProps.length > 0 && (
            <span className="text-xs text-text-muted">({activeProps.length})</span>
          )}
        </div>
        <span className={`text-text-secondary text-xl transition-transform ${expanded ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      {expanded && (
        <div className="border-t border-text-primary/10 p-3">
          {isLoading ? (
            <div className="py-8"><LoadingSpinner /></div>
          ) : activeProps.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-muted">
              No {market.label.toLowerCase()} props available for today's games yet.
            </div>
          ) : (
            <div className="space-y-2">
              {activeProps.map((p) => (
                <PropCard
                  key={p.id}
                  prop={p}
                  pick={getPick(p.id)}
                  onPick={handlePick}
                  onUndoPick={handleUndoPick}
                  isSubmitting={submitPick.isPending || deletePick.isPending}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
