import cron from 'node-cron'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { syncOdds } from './syncOdds.js'
import { scoreGames } from './scoreGames.js'
import { lockPicks } from './lockPicks.js'

export function startScheduler() {
  if (env.ENABLE_ODDS_SYNC) {
    cron.schedule('*/15 * * * *', async () => {
      try { await syncOdds() } catch (err) { logger.error({ err }, 'Odds sync job failed') }
    })
    logger.info('Odds sync scheduled: every 15 minutes')
  }

  if (env.ENABLE_GAME_SCORING) {
    cron.schedule('*/5 * * * *', async () => {
      try { await scoreGames() } catch (err) { logger.error({ err }, 'Score games job failed') }
    })
    logger.info('Game scoring scheduled: every 5 minutes')
  }

  if (env.ENABLE_PICK_LOCK) {
    cron.schedule('* * * * *', async () => {
      try { await lockPicks() } catch (err) { logger.error({ err }, 'Lock picks job failed') }
    })
    logger.info('Pick lock scheduled: every 1 minute')
  }
}
