import { logger } from '../utils/logger.js'

/**
 * Log level follows who is at fault.
 *
 * Everything used to log at `error` as "Unhandled error", including
 * perfectly correct 4xx responses. During a draft that meant a steady
 * stream of red for "This player has already been drafted" (409) and "It is
 * not your turn to pick" (400) — both of which are the server working, just
 * telling a user no.
 *
 * The cost isn't noise for its own sake: on 2026-09-05 a genuine failure
 * (PGRST205 on fantasy_waiver_state, meaning waivers were broken league-wide)
 * sat in the log looking exactly like dozens of routine 409s. Real problems
 * have to look different from routine ones or nobody spots them.
 *
 * 4xx  -> warn   the caller asked for something invalid; expected traffic
 * 5xx  -> error  we failed; someone should look
 */
export function errorHandler(err, req, res, next) {
  const status = err.status || 500
  const isClientError = status >= 400 && status < 500

  const context = { err, path: req.path, method: req.method, status }
  if (isClientError) {
    // Message only — a 409 needs no stack, and the stack is what made these
    // visually indistinguishable from real faults.
    logger.warn({ ...context, err: err.message }, 'Request rejected')
  } else {
    logger.error(context, 'Unhandled error')
  }

  if (err.status) {
    return res.status(err.status).json({ error: err.message })
  }

  res.status(500).json({ error: err.message || 'Internal server error' })
}
