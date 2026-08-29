import { useMemo, useState, useCallback, useEffect } from 'react'
import { useAppConfig } from '../../hooks/useAppConfig'
import { useLoadedProps, useMyPropPicks, useMyPropLiveStats, useSubmitPropPick, useDeletePropPick } from '../../hooks/useProps'
import PropCard from './PropCard'
import LoadingSpinner from '../ui/LoadingSpinner'
import { toast } from '../ui/Toast'
import { triggerHaptic } from '../../lib/haptics'
import { getNcaafMatchupScore } from '../../lib/ncaafPrestige'

// Sport tile display order + labels. The actual order in the grid comes
// from the props_sport_order remote-config knob (admin-reorderable); this
// list is just the source of truth for labels + backdrop filenames, and
// the fallback order if config hasn't loaded yet. Only sports the admin
// has toggled ON in props_sport_visibility are actually rendered.
//
// backdrop: filename inside client/public/backdrops/props/ or null if we
// don't have art for that sport yet. Tiles without backdrops fall back to
// the plain glass-edge style.
const SPORT_TILES = [
  { key: 'nba',    label: 'NBA',    backdrop: 'nba.webp' },
  { key: 'wnba',   label: 'WNBA',   backdrop: 'wnba.jpg' },
  { key: 'mlb',    label: 'MLB',    backdrop: 'mlb.jpg' },
  { key: 'nfl',    label: 'NFL',    backdrop: 'nfl.jpg' },
  { key: 'ncaaf',  label: 'NCAAF',  backdrop: 'ncaaf.jpg' },
  { key: 'ncaab',  label: 'NCAAB',  backdrop: 'ncaab.webp' },
  { key: 'wncaab', label: 'WNCAAB', backdrop: null },
  { key: 'nhl',    label: 'NHL',    backdrop: null },
  { key: 'ufl',    label: 'UFL',    backdrop: null },
  { key: 'mls',    label: 'MLS',    backdrop: 'mls.jpg' },
  { key: 'wc',     label: 'WC',     backdrop: null },
]

const TILE_BY_KEY = Object.fromEntries(SPORT_TILES.map((t) => [t.key, t]))

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
//
// College football gets a matchup key ahead of both. Props are loaded for
// EVERY game in a rolling 7-day window, so without this the list is
// effectively ordered by kickoff time and a Tuesday MAC game buries the
// Saturday night marquee. Same getNcaafMatchupScore the Picks and drill-in
// scoreboards already sort games by, so the three surfaces agree on what
// "marquee" means.
//
// Note it degrades gracefully: the props payload carries team names but not
// AP ranks, so the score falls back to prestige tiers alone. That still
// floats Ohio State over Jacksonville State — ranks would only sharpen the
// ordering between two ranked opponents.
function sortProps(props, sportKey) {
  const isNcaaf = sportKey === 'ncaaf' || sportKey === 'americanfootball_ncaaf'
  return [...props].sort((a, b) => {
    if (isNcaaf) {
      // Lower score = more marquee.
      const m = getNcaafMatchupScore(a.games) - getNcaafMatchupScore(b.games)
      if (m !== 0) return m
    }
    const lineDelta = (b.line || 0) - (a.line || 0)
    if (lineDelta !== 0) return lineDelta
    return oddsImbalance(a.over_odds, a.under_odds) - oddsImbalance(b.over_odds, b.under_odds)
  })
}

export default function PropsSection() {
  const { data: cfg } = useAppConfig()
  const visibility = cfg?.props_sport_visibility || {}
  const order = Array.isArray(cfg?.props_sport_order) && cfg.props_sport_order.length
    ? cfg.props_sport_order
    : SPORT_TILES.map((t) => t.key)
  const [selectedSport, setSelectedSport] = useState(null)

  const visibleTiles = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const key of order) {
      if (seen.has(key)) continue
      const tile = TILE_BY_KEY[key]
      if (!tile || !visibility[key]) continue
      out.push(tile)
      seen.add(key)
    }
    return out
  }, [visibility, order])

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
          <SportTile
            key={tile.key}
            tile={tile}
            onSelect={() => setSelectedSport(tile.key)}
          />
        ))}
      </div>
    </div>
  )
}

function SportTile({ tile, onSelect }) {
  const hasBackdrop = !!tile.backdrop
  const bgUrl = hasBackdrop ? `/backdrops/props/${tile.backdrop}` : null

  return (
    <button
      onClick={onSelect}
      className="relative overflow-hidden bg-bg-primary border border-text-primary/20 hover:border-text-primary/40 rounded-2xl px-6 py-10 transition-all hover:scale-[1.02] hover:shadow-lg"
      style={hasBackdrop ? {
        backgroundImage: `url(${bgUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } : undefined}
    >
      {/* Dark scrim so the label stays readable regardless of underlying image */}
      {hasBackdrop && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20 pointer-events-none" />
      )}
      <div className={`relative font-display text-3xl ${hasBackdrop ? 'text-white drop-shadow-lg' : 'text-text-primary'}`}>
        {tile.label}
      </div>
    </button>
  )
}

function SportPropsView({ sport, onBack }) {
  const markets = MARKETS_BY_SPORT[sport] || []
  const label = SPORT_TILES.find((t) => t.key === sport)?.label || sport.toUpperCase()

  // First market expanded by default. Track expansions as a Set so each
  // group's fetch fires only when a user opens it (server-side cache
  // absorbs concurrent opens across users).
  const [expanded, setExpanded] = useState(() => new Set(markets[0] ? [markets[0].key] : []))

  // Player search. Markets are normally fetched lazily per accordion
  // section, so a cross-market search has to pull every market — done only
  // once the user actually types, via the headless MarketLoaders below.
  const [query, setQuery] = useState('')
  const searching = query.trim().length >= 2
  const [loadedByMarket, setLoadedByMarket] = useState({})
  const handleLoaded = useCallback((marketKey, rows) => {
    setLoadedByMarket((prev) => (prev[marketKey] === rows ? prev : { ...prev, [marketKey]: rows }))
  }, [])

  const searchResults = useMemo(() => {
    if (!searching) return []
    const needle = query.trim().toLowerCase()
    const all = Object.values(loadedByMarket).flat()
    const seen = new Set()
    const hits = []
    for (const p of all) {
      if (!p?.player_name || seen.has(p.id)) continue
      if (!p.player_name.toLowerCase().includes(needle)) continue
      seen.add(p.id)
      hits.push(p)
    }
    return pickableProps(hits, sport)
  }, [searching, query, loadedByMarket, sport])

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
          className="w-11 h-11 flex items-center justify-center rounded-lg bg-bg-primary border border-text-primary/20 text-text-primary hover:border-text-primary/40"
          aria-label="Back to sport grid"
        >
          ‹
        </button>
        <h2 className="font-display text-2xl">{label} Props</h2>
      </div>

      <div className="relative mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${label} players…`}
          className="w-full bg-bg-primary border border-text-primary/20 rounded-lg pl-3 pr-9 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary"
          >
            ×
          </button>
        )}
      </div>

      {markets.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          <div className="font-display text-lg mb-2">No markets configured for {label}</div>
          <div className="text-sm text-text-muted">Ask an admin to add markets for this sport.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Headless fetchers — mounted only while searching, so the lazy
              per-section loading is preserved for normal browsing. */}
          {searching && markets.map((market) => (
            <MarketLoader key={`load-${market.key}`} sport={sport} marketKey={market.key} onLoaded={handleLoaded} />
          ))}

          {searching ? (
            <div className="bg-bg-primary border border-text-primary/20 rounded-xl p-3">
              <div className="px-1 pb-2 text-xs text-text-muted">
                {searchResults.length
                  ? `${searchResults.length} prop${searchResults.length === 1 ? '' : 's'} across all markets`
                  : 'Searching all markets…'}
              </div>
              <PropList
                props={searchResults}
                isLoading={false}
                emptyText={`No open ${label} props for a player matching “${query.trim()}”.`}
              />
            </div>
          ) : (
            markets.map((market) => (
              <MarketGroup
                key={market.key}
                sport={sport}
                market={market}
                expanded={expanded.has(market.key)}
                onToggle={() => toggle(market.key)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// Pick handling + card rendering, shared by the market accordion and the
// player-search results so the two can't drift on what a pick does.
function PropList({ props, isLoading, emptyText }) {
  const { data: myPropPicks } = useMyPropPicks()
  const hasLockedProps = (myPropPicks || []).some((p) => p.status === 'locked')
  const { data: liveStatsMap } = useMyPropLiveStats({ hasLive: hasLockedProps })
  const submitPick = useSubmitPropPick()
  const deletePick = useDeletePropPick()

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

  if (isLoading) return <div className="py-8"><LoadingSpinner /></div>
  if (!props.length) return <div className="py-8 text-center text-sm text-text-muted">{emptyText}</div>

  return (
    <div className="space-y-2">
      {props.map((p) => (
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
  )
}

// Only pickable rows: 'locked' props are past start-of-game and 'settled'
// are resolved. Belt-and-suspenders — also drop anything whose game has
// already started, in case the lock job is late.
function pickableProps(props, sport) {
  if (!props?.length) return []
  const now = Date.now()
  return sortProps(props.filter((p) => {
    if (p.status !== 'published') return false
    if (p.games?.starts_at && new Date(p.games.starts_at).getTime() <= now) return false
    return true
  }), sport)
}

// Headless: fetches one market and hands the rows up. Search needs every
// market at once, but markets are otherwise fetched lazily per accordion
// section — rendering one of these per market is how the search reaches
// them without hooks-in-a-loop.
function MarketLoader({ sport, marketKey, onLoaded }) {
  const { data, isLoading } = useLoadedProps(sport, marketKey, { enabled: true })
  useEffect(() => {
    onLoaded(marketKey, data || [], isLoading)
  }, [data, isLoading, marketKey, onLoaded])
  return null
}

function MarketGroup({ sport, market, expanded, onToggle }) {
  const { data: props, isLoading } = useLoadedProps(sport, market.key, { enabled: expanded })
  const activeProps = useMemo(() => pickableProps(props, sport), [props, sport])

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
          <PropList
            props={activeProps}
            isLoading={isLoading}
            emptyText="No props available right now — either no games today, or this market isn't offered for tonight's slate."
          />
        </div>
      )}
    </div>
  )
}
