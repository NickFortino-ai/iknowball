import cron from 'node-cron'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { syncOdds } from './syncOdds.js'
import { scoreGames } from './scoreGames.js'
import { lockPicks } from './lockPicks.js'
import { syncFutures } from './syncFutures.js'

export function startScheduler() {
  if (env.ENABLE_ODDS_SYNC) {
    cron.schedule('*/30 * * * *', async () => {
      try { await syncOdds() } catch (err) { logger.error({ err }, 'Odds sync job failed') }
    })
    logger.info('Odds sync scheduled: every 30 minutes')
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

  if (env.ENABLE_FUTURES_SYNC) {
    cron.schedule('0 */6 * * *', async () => {
      try { await syncFutures() } catch (err) { logger.error({ err }, 'Futures sync job failed') }
    })
    logger.info('Futures sync scheduled: every 6 hours')
  }
}
