import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { settleProps } from '../services/propService.js'
import { getCurrentNflWeek } from '../services/tdPassService.js'

// Map prop market_key → actual value from an nfl_player_stats row (Sleeper
// weekly stats). Keep in sync with the NFL branch of
// enrichLockedPicksWithLiveStats in propService.js.
const MARKET_STAT_MAP = {
  player_pass_yds: (s) => s.pass_yd,
  player_pass_tds: (s) => s.pass_td,
  player_pass_completions: (s) => s.pass_cmp,
  player_pass_attempts: (s) => s.pass_att,
  player_pass_interceptions: (s) => s.pass_int,
  player_rush_yds: (s) => s.rush_yd,
  player_rush_attempts: (s) => s.rush_att,
  player_reception_yds: (s) => s.rec_yd,
  player_receptions: (s) => s.rec,
  // Anytime TD = rushing or receiving TD (standard book definition; excludes
  // passing TDs). Line is typically 0.5 so this resolves over/under cleanly.
  player_anytime_td: (s) => (s.rush_td || 0) + (s.rec_td || 0),
}

function normalizePlayerName(name) {
  return (name || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Auto-settle NFL player props from Sleeper weekly stats (nfl_player_stats).
 * Unlike the daily NBA/MLB/WNBA jobs, NFL stats are weekly — keyed by
 * (player_id, season, week), not game_date — so we look up the current NFL
 * week's stats and match props by player name. A prop whose game is final
 * but whose player has no weekly stats row yet is left for a later tick
 * (could be mid-sync) rather than force-pushed.
 */
export async function settleNFLProps() {
  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', 'americanfootball_nfl')
    .single()
  if (!sport) return

  const { data: props, error } = await supabase
    .from('player_props')
    .select('id, player_name, market_key, line, game_id, games!inner(id, status, starts_at)')
    .eq('sport_id', sport.id)
    .in('status', ['locked', 'published'])
    .eq('games.status', 'final')
    .limit(200)

  if (error) {
    logger.error({ error }, 'Failed to fetch unsettled NFL props')
    return
  }
  if (!props?.length) return

  const { season, week } = await getCurrentNflWeek()

  // Pull this week's stats joined to player names so we can match props
  // (which only carry player_name) without a separate id map.
  const { data: stats } = await supabase
    .from('nfl_player_stats')
    .select('player_id, pass_yd, pass_td, pass_cmp, pass_att, pass_int, rush_yd, rush_att, rec, rec_yd, rec_td, rush_td, nfl_players!inner(full_name)')
    .eq('season', season)
    .eq('week', week)

  if (!stats?.length) return

  const statsByName = {}
  for (const s of stats) {
    const name = s.nfl_players?.full_name
    if (name) statsByName[normalizePlayerName(name)] = s
  }

  const settlements = []
  for (const prop of props) {
    const statFn = MARKET_STAT_MAP[prop.market_key]
    if (!statFn) continue // unsupported market

    const s = statsByName[normalizePlayerName(prop.player_name)]
    if (!s) continue // no weekly stats yet — wait (mid-sync) or settle manually

    const actualValue = statFn(s) || 0
    let outcome
    if (actualValue > prop.line) outcome = 'over'
    else if (actualValue < prop.line) outcome = 'under'
    else outcome = 'push'

    settlements.push({ propId: prop.id, outcome, actualValue })
  }

  if (!settlements.length) return

  const results = await settleProps(settlements)
  const totalScored = results.reduce((sum, r) => sum + (r.scored || 0), 0)
  logger.info({ settled: settlements.length, picksScored: totalScored, season, week }, 'Auto-settled NFL player props')
}
