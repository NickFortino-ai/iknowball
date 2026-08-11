// Auto-resolves futures_markets whose resolution_type is 'stat_leader'.
//
// A stat-leader future declares:
//   - stat_category: which stat to aggregate (see CATEGORIES below)
//   - stat_direction: 'max' (leader wins) or 'min' (least wins — rare
//     but useful for e.g. fewest interceptions thrown)
//   - outcomes: [{ name, odds, player_id }] — player_id is required
//     for stat-leader markets so we can look the player up in
//     nfl_player_stats. If omitted, the row can't be scored.
//
// The resolver aggregates the season totals for each outcome player,
// picks the leader, and hands off to settleFuturesMarket() — reusing
// the existing points / notifications pipeline.

import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { settleFuturesMarket } from './futuresService.js'

// User-facing stat slug → { column in nfl_player_stats OR sum of
// multiple columns, human label for admin UI }. Add new categories
// here as fans ask for them; the migration doesn't need to know.
export const NFL_STAT_CATEGORIES = {
  passing_yards: { label: 'Passing Yards', columns: ['pass_yd'] },
  passing_tds: { label: 'Passing TDs', columns: ['pass_td'] },
  interceptions_thrown: { label: 'Interceptions Thrown', columns: ['pass_int'] },
  rushing_yards: { label: 'Rushing Yards', columns: ['rush_yd'] },
  rushing_tds: { label: 'Rushing TDs', columns: ['rush_td'] },
  receiving_yards: { label: 'Receiving Yards', columns: ['rec_yd'] },
  receiving_tds: { label: 'Receiving TDs', columns: ['rec_td'] },
  receptions: { label: 'Receptions', columns: ['rec'] },
  total_tds: { label: 'Total TDs (Pass + Rush + Rec)', columns: ['pass_td', 'rush_td', 'rec_td'] },
  fantasy_points_ppr: { label: 'Fantasy Points (PPR)', columns: ['pts_ppr'] },
}

export function getNflStatCategories() {
  return Object.entries(NFL_STAT_CATEGORIES).map(([slug, cfg]) => ({ slug, label: cfg.label }))
}

// Aggregate season totals for a set of player_ids on a given season.
// Returns Map<player_id, number>. Uses supabase's simple select-then-
// sum-in-JS approach — nfl_player_stats has ~1-2k rows per season
// per player set which is trivial to sum client-side.
async function sumSeasonStats(playerIds, season, columns) {
  if (!playerIds?.length) return new Map()
  const selectCols = ['player_id', ...columns].join(', ')
  const { data, error } = await supabase
    .from('nfl_player_stats')
    .select(selectCols)
    .eq('season', season)
    .in('player_id', playerIds)
  if (error) throw error
  const totals = new Map()
  for (const row of data || []) {
    const prev = totals.get(row.player_id) || 0
    const rowSum = columns.reduce((acc, c) => acc + (Number(row[c]) || 0), 0)
    totals.set(row.player_id, prev + rowSum)
  }
  return totals
}

// Resolve one stat-leader market. Aggregates stat totals for each
// outcome player, picks the leader by stat_direction, and calls
// settleFuturesMarket. Throws if the market isn't a stat-leader,
// has no outcomes with player_ids, or the stat_category is unknown.
export async function resolveStatLeaderFuture(marketId, { season } = {}) {
  const { data: market, error } = await supabase
    .from('futures_markets')
    .select('id, sport_key, status, resolution_type, stat_category, stat_direction, outcomes')
    .eq('id', marketId)
    .single()
  if (error || !market) throw new Error(`Market ${marketId} not found`)

  if (market.resolution_type !== 'stat_leader') {
    throw new Error(`Market ${marketId} is not a stat-leader market (resolution_type=${market.resolution_type})`)
  }
  if (market.status === 'settled') {
    throw new Error(`Market ${marketId} is already settled`)
  }

  const cfg = NFL_STAT_CATEGORIES[market.stat_category]
  if (!cfg) throw new Error(`Unknown stat_category '${market.stat_category}'`)

  const outcomes = Array.isArray(market.outcomes) ? market.outcomes : []
  const withPlayerIds = outcomes.filter((o) => o.player_id)
  if (!withPlayerIds.length) {
    throw new Error(`Market ${marketId} has no outcomes with player_id — can't resolve`)
  }

  const activeSeason = season || new Date().getFullYear()
  const totals = await sumSeasonStats(
    withPlayerIds.map((o) => o.player_id),
    activeSeason,
    cfg.columns,
  )

  // Score each outcome (players with no stats get 0 for max, +Inf
  // for min so they don't accidentally win a "fewest X" market).
  const direction = market.stat_direction === 'min' ? 'min' : 'max'
  const scored = withPlayerIds.map((o) => {
    const val = totals.get(o.player_id)
    const fallback = direction === 'min' ? Number.POSITIVE_INFINITY : 0
    return { outcome: o, total: val ?? fallback }
  })

  scored.sort((a, b) => direction === 'min' ? a.total - b.total : b.total - a.total)
  const winner = scored[0]
  if (!winner) throw new Error(`No scorable outcomes for market ${marketId}`)

  logger.info(
    {
      marketId,
      stat: market.stat_category,
      direction,
      winner: winner.outcome.name,
      winnerTotal: winner.total,
      runnerUp: scored[1] ? `${scored[1].outcome.name}=${scored[1].total}` : null,
    },
    'Resolving stat-leader future',
  )

  return settleFuturesMarket(marketId, winner.outcome.name)
}

// Auto-resolve any stat-leader markets that have hit their close_at
// and are still active/closed. Called by the daily cron.
export async function autoResolveDueStatLeaderFutures() {
  const nowIso = new Date().toISOString()
  const { data: due, error } = await supabase
    .from('futures_markets')
    .select('id, title')
    .eq('resolution_type', 'stat_leader')
    .in('status', ['active', 'closed'])
    .not('close_at', 'is', null)
    .lte('close_at', nowIso)

  if (error) {
    logger.error({ error }, 'auto-resolve stat-leader query failed')
    return { resolved: 0, failed: 0 }
  }
  if (!due?.length) return { resolved: 0, failed: 0 }

  let resolved = 0
  let failed = 0
  for (const m of due) {
    try {
      await resolveStatLeaderFuture(m.id)
      resolved++
    } catch (err) {
      failed++
      logger.error({ err: err.message, marketId: m.id, title: m.title }, 'stat-leader auto-resolve failed')
    }
  }
  logger.info({ resolved, failed, total: due.length }, 'stat-leader auto-resolve batch done')
  return { resolved, failed }
}
