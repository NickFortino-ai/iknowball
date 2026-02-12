import { supabase } from '../config/supabase.js'
import { fetchScores } from '../services/oddsService.js'
import { logger } from '../utils/logger.js'
import { scoreCompletedGame } from '../services/scoringService.js'

export async function scoreGames() {
  logger.info('Starting game scoring...')

  let scores
  try {
    scores = await fetchScores('americanfootball_nfl')
  } catch (err) {
    logger.error({ err }, 'Failed to fetch scores')
    return
  }

  const completedEvents = scores.filter((e) => e.completed)
  logger.info({ completed: completedEvents.length, total: scores.length }, 'Fetched scores')

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

    await scoreCompletedGame(game.id, winner, game.sport_id)
    scored++
  }

  logger.info({ scored }, 'Game scoring complete')
}
