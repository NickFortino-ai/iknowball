import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { settleProps } from '../services/propService.js'
import { findESPNEventId, fetchPlayerBoxStats } from '../services/espnService.js'

// College basketball prop settlement — the job that did not exist.
//
// NCAAB props have been generated, featured and locked since the sport was
// added, and NOTHING ever graded them: there is no settleNCAABProps anywhere
// and the scheduler never referenced one. Measured 2026-11-18: 168 of 177
// NCAAB props sat unsettled on games that were already FINAL, with 25 user
// picks riding on them. Only 2 had ever settled, presumably by hand.
//
// Nothing was broken — the feature was simply never built. It is easy to
// miss because every neighbouring sport has a settler, so the Props tab
// looks uniformly supported from the outside.
//
// Modelled on settleWNBAProps rather than settleNBAProps: the NBA job reads
// nba_dfs_player_stats, and college has no equivalent table. ESPN's summary
// endpoint is the only source, and espnService already carries the paths for
// both college leagues, so this needed no new plumbing.

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

async function settleForSport(sportKey, label) {
  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', sportKey)
    .single()
  if (!sport) return

  const { data: props, error } = await supabase
    .from('player_props')
    .select('id, player_name, market_key, line, game_id, games!inner(id, home_team, away_team, starts_at, status)')
    .eq('sport_id', sport.id)
    .in('status', ['locked', 'published'])
    .eq('games.status', 'final')
    // Explicit .order() before the cap, for the reason settleNCAAFProps
    // documents: an unordered limit in PostgREST returns an ARBITRARY slice,
    // not the first N, so without it the props outside the window are never
    // settled at all — starvation rather than truncation.
    .order('id')
    .limit(200)

  if (error) {
    logger.error({ error, sportKey }, `Failed to fetch unsettled ${label} props`)
    return
  }
  if (!props?.length) return

  // One ESPN round trip per GAME, not per prop. A single college game can
  // carry a dozen props and they all read the same box score.
  const byGame = {}
  for (const p of props) {
    if (!byGame[p.game_id]) byGame[p.game_id] = { game: p.games, props: [] }
    byGame[p.game_id].props.push(p)
  }

  // Capped per run for the reason the NCAAF job documents: college has no
  // stats table, so each game costs a scoreboard lookup plus a summary
  // fetch, and ESPN per-host blocked this server once already over call
  // volume. A backlog drains across successive runs.
  const games = Object.values(byGame).slice(0, 12)

  const settlements = []
  let unmatchedGames = 0
  for (const { game, props: gameProps } of games) {
    try {
      const espnId = await findESPNEventId(sportKey, game.home_team, game.away_team, game.starts_at)
      if (!espnId) {
        unmatchedGames++
        logger.warn({ gameId: game.id, home: game.home_team, away: game.away_team }, `No ESPN match for ${label} game — skipping props`)
        continue
      }
      const playerStats = await fetchPlayerBoxStats(sportKey, espnId)
      // An EMPTY box is not evidence of anything. Skipping here is what
      // makes the DNP push below safe: a player can only be judged absent
      // from a box score we actually hold.
      if (!Object.keys(playerStats).length) {
        logger.warn({ gameId: game.id, espnId }, `No ${label} box stats from ESPN — skipping`)
        continue
      }

      for (const prop of gameProps) {
        const calc = MARKET_STAT_MAP[prop.market_key]
        if (!calc) {
          logger.warn({ propId: prop.id, marketKey: prop.market_key }, `Unmapped ${label} market — skipping prop`)
          continue
        }
        const stats = playerStats[normalizePlayerName(prop.player_name)]
        if (!stats) {
          // Did not dress. Push returns the stake and fires the DNP
          // notification — the same treatment the NBA and WNBA jobs give it.
          logger.info({ propId: prop.id, player: prop.player_name, gameId: game.id }, `${label} player not in box — settling as push`)
          settlements.push({ propId: prop.id, outcome: 'push', actualValue: null })
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
      logger.error({ err: err.message, gameId: game.id }, `${label} settle failed for game`)
    }
  }

  if (settlements.length) {
    const results = await settleProps(settlements)
    const totalScored = results.reduce((sum, r) => sum + (r.scored || 0), 0)
    logger.info({ settled: settlements.length, picksScored: totalScored, unmatchedGames, pendingGames: Object.keys(byGame).length }, `${label} props auto-settled`)
  }
}

export async function settleNCAABProps() {
  return settleForSport('basketball_ncaab', 'NCAAB')
}

// WNCAAB currently carries zero props, so this settles nothing today. Wired
// anyway: the whole reason NCAAB went ungraded for its entire life is that
// adding a sport's props and adding its settler are separate acts, and the
// second one is invisible until a user asks why their pick never resolved.
export async function settleWNCAABProps() {
  return settleForSport('basketball_wncaab', 'WNCAAB')
}
