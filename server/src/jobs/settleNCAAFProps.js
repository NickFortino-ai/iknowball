import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { settleProps } from '../services/propService.js'
import { findESPNEventId, fetchFootballPlayerBoxStats } from '../services/espnService.js'
import { stripAccents } from '../utils/name.js'

// Map prop market_key → actual value from a parsed ESPN football box line.
// Keep in sync with the NCAAF branch of enrichLockedPicksWithLiveStats in
// propService.js. Only the four markets the Odds API actually publishes for
// college are mapped; an unmapped market is skipped rather than guessed at.
const MARKET_STAT_MAP = {
  player_pass_yds: (s) => s.pass_yd,
  player_rush_yds: (s) => s.rush_yd,
  player_reception_yds: (s) => s.rec_yd,
  player_receptions: (s) => s.rec,
}

// Each game costs one scoreboard lookup plus one summary fetch. ESPN
// per-host blocked the server on 2026-08-26 over call volume, so the
// backlog is drained a slice at a time rather than in one burst. At a
// 15-minute cadence this still clears a full Saturday slate well before
// anyone looks on Sunday.
const MAX_GAMES_PER_RUN = 12

function normalizePlayerName(name) {
  // stripAccents FIRST so diacritics collapse to their ASCII base before the
  // [^a-z\s] regex would strip them entirely — the same trap that silently
  // stopped "Ekéler" matching "Ekeler" in the NFL job.
  return stripAccents(name || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Auto-settle NCAAF player props from ESPN box scores.
 *
 * Unlike NFL — which reads Sleeper's nfl_player_stats table — college has no
 * player-stats table of its own, so stats come straight from the ESPN game
 * summary. That means a per-GAME fetch, so props are grouped by game and only
 * a slice of games is processed per run.
 *
 * A prop whose game is final but whose player has no box line is left alone
 * rather than settled at zero: ESPN can publish a summary before the player
 * grids are populated, and a wrong settlement is far worse than a late one.
 */
export async function settleNCAAFProps() {
  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', 'americanfootball_ncaaf')
    .single()
  if (!sport) return

  const { data: props, error } = await supabase
    .from('player_props')
    .select('id, player_name, market_key, line, game_id, games!inner(id, status, home_team, away_team, starts_at)')
    .eq('sport_id', sport.id)
    .in('status', ['locked', 'published'])
    .eq('games.status', 'final')
    .limit(500)

  if (error) {
    logger.error({ error }, 'Failed to fetch unsettled NCAAF props')
    return
  }
  if (!props?.length) return

  // Group by game so one ESPN fetch serves every prop on that game.
  const byGame = new Map()
  for (const p of props) {
    if (!byGame.has(p.game_id)) byGame.set(p.game_id, { game: p.games, props: [] })
    byGame.get(p.game_id).props.push(p)
  }

  const slice = [...byGame.values()].slice(0, MAX_GAMES_PER_RUN)
  const skippedGames = byGame.size - slice.length

  const settlements = []
  let gamesDone = 0
  let noBoxScore = 0
  const unmatched = []

  for (const { game, props: gameProps } of slice) {
    let statsByName = {}
    try {
      const espnEventId = await findESPNEventId(
        'americanfootball_ncaaf', game.home_team, game.away_team, game.starts_at
      )
      if (!espnEventId) {
        noBoxScore++
        continue
      }
      statsByName = await fetchFootballPlayerBoxStats('americanfootball_ncaaf', espnEventId)
    } catch (err) {
      logger.warn({ err: err.message, gameId: game.id }, 'NCAAF box score fetch failed')
      continue
    }

    if (!Object.keys(statsByName).length) {
      noBoxScore++
      continue
    }
    gamesDone++

    for (const prop of gameProps) {
      const statFn = MARKET_STAT_MAP[prop.market_key]
      if (!statFn) continue

      const s = statsByName[normalizePlayerName(prop.player_name)]
      if (!s) {
        // Player has no box line. Common and legitimate: a backup listed in
        // the props who never took a snap has no ESPN row at all. Recorded
        // so a systematic name mismatch shows up as a pattern in the logs
        // rather than as props that quietly never settle.
        unmatched.push(prop.player_name)
        continue
      }

      const actualValue = statFn(s) || 0
      let outcome
      if (actualValue > prop.line) outcome = 'over'
      else if (actualValue < prop.line) outcome = 'under'
      else outcome = 'push'

      settlements.push({ propId: prop.id, outcome, actualValue })
    }
  }

  if (!settlements.length) {
    if (noBoxScore || unmatched.length) {
      logger.info({ noBoxScore, unmatched: unmatched.slice(0, 10) }, 'NCAAF prop settlement found nothing to settle')
    }
    return
  }

  const results = await settleProps(settlements)
  const totalScored = results.reduce((sum, r) => sum + (r.scored || 0), 0)
  logger.info({
    settled: settlements.length,
    picksScored: totalScored,
    gamesProcessed: gamesDone,
    gamesDeferred: skippedGames,
    noBoxScore,
    unmatchedPlayers: unmatched.length,
    unmatchedSample: unmatched.slice(0, 10),
  }, 'Auto-settled NCAAF player props')
}
