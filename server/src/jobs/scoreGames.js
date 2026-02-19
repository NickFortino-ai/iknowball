import { supabase } from '../config/supabase.js'
import { fetchScores } from '../services/oddsService.js'
import { logger } from '../utils/logger.js'
import { scoreCompletedGame, scoreParlayLegs } from '../services/scoringService.js'
import { scoreSurvivorPicks } from '../services/survivorService.js'
import { scoreBracketMatchups } from '../services/bracketService.js'

async function scoreSport(sportKey) {
  // Smart gate: only call API if there are games that need scoring
  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', sportKey)
    .single()

  if (!sport) {
    logger.warn({ sportKey }, 'Sport not found in database, skipping scoring')
    return 0
  }

  const now = new Date()
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000)

  // Check for live games
  const { count: liveCount } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('sport_id', sport.id)
    .eq('status', 'live')

  // Check for games that started in the last 12 hours but aren't final yet
  // (covers timing gaps, overtime, extra innings, and rain delays)
  const { count: recentCount } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('sport_id', sport.id)
    .neq('status', 'final')
    .gte('starts_at', twelveHoursAgo.toISOString())
    .lte('starts_at', now.toISOString())

  if (liveCount === 0 && recentCount === 0) {
    logger.debug({ sportKey }, 'No live or recently started games, skipping score fetch')
    return 0
  }

  let scores
  try {
    scores = await fetchScores(sportKey)
  } catch (err) {
    logger.error({ err, sportKey }, 'Failed to fetch scores')
    return 0
  }

  const completedEvents = scores.filter((e) => e.completed)
  logger.info({ sportKey, completed: completedEvents.length, total: scores.length }, 'Fetched scores')

  let scored = 0
  for (const event of completedEvents) {
    const { data: game } = await supabase
      .from('games')
      .select('*')
      .eq('external_id', event.id)
      .single()

    if (!game || game.status === 'final') continue

    const homeScore = event.scores?.find((s) => s.name === event.home_team)
    const awayScore = event.scores?.find((s) => s.name === event.away_team)

    const homePoints = parseInt(homeScore?.score || '0', 10)
    const awayPoints = parseInt(awayScore?.score || '0', 10)

    let winner = null
    if (homePoints > awayPoints) winner = 'home'
    else if (awayPoints > homePoints) winner = 'away'

    const { error } = await supabase
      .from('games')
      .update({
        status: 'final',
        home_score: homePoints,
        away_score: awayPoints,
        winner,
        updated_at: new Date().toISOString(),
      })
      .eq('id', game.id)

    if (error) {
      logger.error({ error, gameId: game.id }, 'Failed to update game score')
      continue
    }

    try {
      await scoreCompletedGame(game.id, winner, game.sport_id)
      await scoreParlayLegs(game.id, winner)
      await scoreSurvivorPicks(game.id, winner)

      if (winner) {
        try {
          await scoreBracketMatchups(game.home_team, game.away_team, winner)
        } catch (err) {
          logger.error({ err, gameId: game.id }, 'Failed to auto-settle bracket matchups')
        }
      }
    } catch (err) {
      // Revert game to live so it gets retried next scoring cycle
      logger.error({ err, gameId: game.id }, 'Scoring failed, reverting game to live for retry')
      await supabase
        .from('games')
        .update({ status: 'live', updated_at: new Date().toISOString() })
        .eq('id', game.id)
      continue
    }

    scored++
  }

  return scored
}

export async function scoreGames() {
  logger.info('Starting game scoring...')

  const sports = ['americanfootball_nfl', 'basketball_nba', 'baseball_mlb', 'basketball_ncaab', 'americanfootball_ncaaf', 'basketball_wnba', 'icehockey_nhl', 'soccer_usa_mls']
  let total = 0

  for (const sportKey of sports) {
    const count = await scoreSport(sportKey)
    total += count
  }

  logger.info({ total }, 'Game scoring complete')
}
