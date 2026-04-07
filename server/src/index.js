import app from './app.js'
import { env } from './config/env.js'
import { logger } from './utils/logger.js'
import { startScheduler } from './jobs/scheduler.js'
import { validateSchema } from './jobs/validateSchema.js'
import { validateUpstream } from './jobs/validateUpstream.js'
import cron from 'node-cron'

app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`)
  startScheduler()
  // Boot-time schema smoke check — surfaces column typos in deploy logs
  validateSchema().catch((err) => logger.error({ err }, 'Schema validation crashed'))
  // Boot-time upstream API shape check — surfaces Sleeper API drift
  validateUpstream().catch((err) => logger.error({ err }, 'Upstream validation crashed'))
  // Re-check upstream once a day so Sleeper drift doesn't go undetected
  // for weeks if the server doesn't reboot
  cron.schedule('15 4 * * *', () => {
    validateUpstream().catch((err) => logger.error({ err }, 'Daily upstream validation crashed'))
  }, { timezone: 'America/New_York' })
})
