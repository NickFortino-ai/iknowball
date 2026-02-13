import { supabase } from '../config/supabase.js'
import { fetchScores } from '../services/oddsService.js'
import { logger } from '../utils/logger.js'
import { scoreCompletedGame } from '../services/scoringService.js'
import { scoreSurvivorPicks } from '../services/survivorService.js'

async function scoreSport(sportKey) {
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

    await scoreCompletedGame(game.id, winner, game.sport_id)
    await scoreSurvivorPicks(game.id, winner)
    scored++
  }

  return scored
}

export async function scoreGames() {
  logger.info('Starting game scoring...')

  const sports = ['americanfootball_nfl', 'basketball_nba', 'baseball_mlb']
  let total = 0

  for (const sportKey of sports) {
    const count = await scoreSport(sportKey)
    total += count
  }

  logger.info({ total }, 'Game scoring complete')
}
