import { logger } from '../utils/logger.js'

export function errorHandler(err, req, res, next) {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error')

  if (err.status) {
    return res.status(err.status).json({ error: err.message })
  }

  res.status(500).json({ error: 'Internal server error' })
}
