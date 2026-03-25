import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { settleProps } from '../services/propService.js'

/**
 * Map market_key to a function that computes actual value from nba_dfs_player_stats.
 */
const MARKET_STAT_MAP = {
  player_points: (s) => s.points,
  player_rebounds: (s) => s.rebounds,
  player_assists: (s) => s.assists,
  player_threes: (s) => s.three_pointers_made,
  player_blocks: (s) => s.blocks,
  player_steals: (s) => s.steals,
  player_points_rebounds_assists: (s) => s.points + s.rebounds + s.assists,
  player_points_rebounds: (s) => s.points + s.rebounds,
  player_points_assists: (s) => s.points + s.assists,
  player_rebounds_assists: (s) => s.rebounds + s.assists,
}

function normalizePlayerName(name) {
  return name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Auto-settle NBA player props using stats from nba_dfs_player_stats.
 * Finds locked/published props tied to final NBA games and settles them.
 */
export async function settleNBAProps() {
  // Get NBA sport ID
  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', 'basketball_nba')
    .single()

  if (!sport) return

  // Find unsettled NBA player props where the game is final
  const { data: props, error } = await supabase
    .from('player_props')
    .select('id, player_name, market_key, line, game_id, games!inner(id, status, starts_at)')
    .eq('sport_id', sport.id)
    .in('status', ['locked', 'published'])
    .eq('games.status', 'final')
    .limit(200)

  if (error) {
    logger.error({ error }, 'Failed to fetch unsettled NBA props')
    return
  }

  if (!props?.length) return

  // Get the game dates so we can look up stats
  const gameDates = new Set()
  for (const prop of props) {
    const date = new Date(prop.games.starts_at).toISOString().split('T')[0]
    gameDates.add(date)
  }

  // Fetch all NBA player stats for those dates
  const allStats = []
  for (const date of gameDates) {
    const { data: stats } = await supabase
      .from('nba_dfs_player_stats')
      .select('*')
      .eq('game_date', date)

    if (stats?.length) allStats.push(...stats)
  }

  if (!allStats.length) return

  // Index stats by normalized player name
  const statsByName = {}
  for (const s of allStats) {
    statsByName[normalizePlayerName(s.player_name)] = s
  }

  // Build settlements
  const settlements = []
  for (const prop of props) {
    const statFn = MARKET_STAT_MAP[prop.market_key]
    if (!statFn) continue // unsupported market (e.g., anytime TD)

    const stats = statsByName[normalizePlayerName(prop.player_name)]
    if (!stats) continue // no stats found for this player

    const actualValue = statFn(stats)
    let outcome
    if (actualValue > prop.line) outcome = 'over'
    else if (actualValue < prop.line) outcome = 'under'
    else outcome = 'push'

    settlements.push({
      propId: prop.id,
      outcome,
      actualValue,
    })
  }

  if (!settlements.length) return

  const results = await settleProps(settlements)
  const totalScored = results.reduce((sum, r) => sum + (r.scored || 0), 0)
  logger.info({ settled: settlements.length, picksScored: totalScored }, 'Auto-settled NBA player props')
}
