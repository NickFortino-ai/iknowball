import app from './app.js'
import { env } from './config/env.js'
import { logger } from './utils/logger.js'
import { startScheduler } from './jobs/scheduler.js'

app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`)
  startScheduler()
})
