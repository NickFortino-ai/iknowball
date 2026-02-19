import { logger } from '../utils/logger.js'
import { syncFuturesForSport } from '../services/futuresService.js'
import { FUTURES_SPORT_KEYS } from '../services/oddsService.js'

export async function syncFutures() {
  logger.info('Starting futures sync...')

  const sports = Object.keys(FUTURES_SPORT_KEYS)
  let total = 0

  for (const sportKey of sports) {
    try {
      const { synced } = await syncFuturesForSport(sportKey)
      total += synced
    } catch (err) {
      logger.error({ err: err.message, sportKey }, 'Failed to sync futures for sport')
    }
  }

  logger.info({ total }, 'Futures sync complete')
}
