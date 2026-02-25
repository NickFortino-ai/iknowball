import { recalculateAllRecords } from '../services/recordService.js'
import { logger } from '../utils/logger.js'

export async function recalculateRecords() {
  logger.info('Starting scheduled record recalculation')
  const result = await recalculateAllRecords()
  logger.info(result, 'Scheduled record recalculation complete')
}
