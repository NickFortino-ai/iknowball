import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { settleProps } from '../services/propService.js'
import { findESPNEventId, fetchPlayerBoxStats } from '../services/espnService.js'

const MARKET_STAT_MAP = {
  player_points: (s) => s.points,
  player_rebounds: (s) => s.rebounds,
  player_assists: (s) => s.assists,
  player_threes: (s) => s.threes,
  player_blocks: (s) => s.blocks,
  player_steals: (s) => s.steals,
  player_points_rebounds_assists: (s) => s.points + s.rebounds + s.assists,
  player_points_rebounds: (s) => s.points + s.rebounds,
  player_points_assists: (s) => s.points + s.assists,
  player_rebounds_assists: (s) => s.rebounds + s.assists,
}

function normalizePlayerName(name) {
  return (name || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
}

// Auto-settle WNBA player props using ESPN box scores. Mirrors the NBA
// job but sources stats from ESPN's summary endpoint (we don't have a
// wnba_dfs_player_stats sync — and don't need one just for this).
export async function settleWNBAProps() {
  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', 'basketball_wnba')
    .single()
  if (!sport) return

  const { data: props } = await supabase
    .from('player_props')
    .select('id, player_name, market_key, line, game_id, games!inner(id, home_team, away_team, starts_at, status)')
    .eq('sport_id', sport.id)
    .in('status', ['locked', 'published'])
    .eq('games.status', 'final')
    .limit(200)

  if (!props?.length) return

  // Group by game so we hit ESPN once per game, not once per prop.
  const byGame = {}
  for (const p of props) {
    if (!byGame[p.game_id]) byGame[p.game_id] = { game: p.games, props: [] }
    byGame[p.game_id].props.push(p)
  }

  const settlements = []
  for (const { game, props: gameProps } of Object.values(byGame)) {
    try {
      const espnId = await findESPNEventId('basketball_wnba', game.home_team, game.away_team, game.starts_at)
      if (!espnId) {
        logger.warn({ gameId: game.id, home: game.home_team, away: game.away_team }, 'No ESPN match for WNBA game — skipping props')
        continue
      }
      const playerStats = await fetchPlayerBoxStats('basketball_wnba', espnId)
      if (!Object.keys(playerStats).length) {
        logger.warn({ gameId: game.id, espnId }, 'No WNBA box stats from ESPN — skipping')
        continue
      }

      for (const prop of gameProps) {
        const stats = playerStats[normalizePlayerName(prop.player_name)]
        if (!stats) {
          // Player wasn't in the box score (DNP / inactive). Treat as
          // push so picks resolve to 0 points and don't shift the
          // user's record.
          logger.info({ propId: prop.id, player: prop.player_name, gameId: game.id }, 'WNBA player not in box — settling as push')
          settlements.push({ propId: prop.id, outcome: 'push', actualValue: null })
          continue
        }
        const calc = MARKET_STAT_MAP[prop.market_key]
        if (!calc) {
          logger.warn({ propId: prop.id, marketKey: prop.market_key }, 'Unmapped WNBA market — skipping prop')
          continue
        }
        const actualValue = calc(stats)
        let outcome
        if (actualValue > prop.line) outcome = 'over'
        else if (actualValue < prop.line) outcome = 'under'
        else outcome = 'push'
        settlements.push({ propId: prop.id, outcome, actualValue })
      }
    } catch (err) {
      logger.error({ err: err.message, gameId: game.id }, 'WNBA settle failed for game')
    }
  }

  if (settlements.length) {
    await settleProps(settlements)
    logger.info({ count: settlements.length }, 'WNBA props auto-settled')
  }
}
