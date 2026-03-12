import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { scoreCompletedGame, scoreParlayLegs, trySettleParlay } from '../services/scoringService.js'
import { scoreSurvivorPicks } from '../services/survivorService.js'
import { scoreLeaguePicks } from '../services/leaguePickService.js'
import { scoreBracketMatchups } from '../services/bracketService.js'
import { fetchESPNScoreboard, matchESPNToGame } from '../services/espnService.js'

function toEasternDateString(utcDateStr) {
  const d = new Date(utcDateStr)
  // Format as YYYYMMDD in US Eastern time for ESPN API
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '')
}

async function finalizeStuckGames() {
  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000)

  // Find games stuck in 'live' status that started more than 8 hours ago
  const { data: stuckGames, error } = await supabase
    .from('games')
    .select('*, sports(key)')
    .eq('status', 'live')
    .lt('starts_at', eightHoursAgo.toISOString())

  if (error) {
    logger.error({ error }, 'Failed to query stuck live games')
    return
  }

  if (!stuckGames?.length) return

  logger.info({ count: stuckGames.length }, 'Found games stuck in live status, checking ESPN')

  // Group by sport key + date for efficient ESPN queries
  const groups = {}
  for (const game of stuckGames) {
    const sportKey = game.sports?.key
    if (!sportKey) continue
    const dateStr = toEasternDateString(game.starts_at)
    const groupKey = `${sportKey}|${dateStr}`
    if (!groups[groupKey]) groups[groupKey] = { sportKey, dateStr, games: [] }
    groups[groupKey].games.push(game)
  }

  let finalized = 0
  for (const { sportKey, dateStr, games } of Object.values(groups)) {
    let espnEvents
    try {
      espnEvents = await fetchESPNScoreboard(sportKey, dateStr)
    } catch (err) {
      logger.error({ err, sportKey, dateStr }, 'Failed to fetch ESPN scoreboard for stuck games')
      continue
    }

    if (!espnEvents?.length) continue

    for (const game of games) {
      const match = espnEvents.find((e) => matchESPNToGame(e, game))
      if (!match || match.state !== 'post') continue

      // ESPN confirms game is final — determine winner
      let winner = null
      if (match.homeScore > match.awayScore) winner = 'home'
      else if (match.awayScore > match.homeScore) winner = 'away'

      // Only update if still live (prevents race condition with scoreGames)
      const { data: updated, error: updateError } = await supabase
        .from('games')
        .update({
          status: 'final',
          home_score: match.homeScore,
          away_score: match.awayScore,
          winner,
          updated_at: new Date().toISOString(),
        })
        .eq('id', game.id)
        .eq('status', 'live')
        .select()
        .single()

      if (updateError || !updated) {
        if (updateError) logger.error({ updateError, gameId: game.id }, 'Failed to finalize stuck game via ESPN')
        continue
      }

      logger.info({ gameId: game.id, home: game.home_team, away: game.away_team, winner, homeScore: match.homeScore, awayScore: match.awayScore }, 'Finalized stuck game via ESPN')

      // Run full scoring pipeline
      try {
        await scoreCompletedGame(game.id, winner, game.sport_id)
        await scoreParlayLegs(game.id, winner)
        await scoreSurvivorPicks(game.id, winner)
        await scoreLeaguePicks(game.id, winner)

        if (winner) {
          try {
            await scoreBracketMatchups(game.home_team, game.away_team, winner, match.homeScore, match.awayScore)
          } catch (err) {
            logger.error({ err, gameId: game.id }, 'Failed to auto-settle bracket matchups for stuck game')
          }
        }
      } catch (err) {
        // Revert game to live so it gets retried next cycle
        logger.error({ err, gameId: game.id }, 'Scoring failed for stuck game, reverting to live for retry')
        await supabase
          .from('games')
          .update({ status: 'live', updated_at: new Date().toISOString() })
          .eq('id', game.id)
        continue
      }

      finalized++
    }
  }

  if (finalized > 0) {
    logger.info({ finalized }, 'Finalized stuck games via ESPN')
  }
}

export async function settleStuckParlays() {
  // Step 1: Finalize games stuck in 'live' using ESPN as fallback
  try {
    await finalizeStuckGames()
  } catch (err) {
    logger.error({ err }, 'Failed to finalize stuck games')
  }

  // Step 2: Settle parlay legs whose game is final but leg status is still pending/locked
  const { data: stuckLegs, error } = await supabase
    .from('parlay_legs')
    .select('id, picked_team, parlay_id, games!inner(winner)')
    .in('status', ['pending', 'locked'])
    .eq('games.status', 'final')

  if (error) {
    logger.error({ error }, 'Failed to query stuck parlay legs')
    return
  }

  if (!stuckLegs?.length) return

  logger.info({ count: stuckLegs.length }, 'Found stuck parlay legs, settling')

  for (const leg of stuckLegs) {
    const winner = leg.games.winner
    let legStatus
    if (winner === null) {
      legStatus = 'push'
    } else if (leg.picked_team === winner) {
      legStatus = 'won'
    } else {
      legStatus = 'lost'
    }

    const { error: updateError } = await supabase
      .from('parlay_legs')
      .update({ status: legStatus, updated_at: new Date().toISOString() })
      .eq('id', leg.id)

    if (updateError) {
      logger.error({ updateError, legId: leg.id }, 'Failed to update stuck parlay leg')
    }
  }

  // Settle affected parlays
  const parlayIds = [...new Set(stuckLegs.map((l) => l.parlay_id))]
  for (const parlayId of parlayIds) {
    try {
      await trySettleParlay(parlayId)
    } catch (err) {
      logger.error({ err, parlayId }, 'Failed to settle parlay from cleanup job')
    }
  }

  logger.info({ legsFixed: stuckLegs.length, parlaysChecked: parlayIds.length }, 'Stuck parlay cleanup complete')
}
