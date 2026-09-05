/**
 * Tell "the database was unreachable" apart from "the row doesn't exist".
 *
 * Written after the 2026-09-04 draft outage. Dozens of call sites are
 * written as:
 *
 *     const { data: member } = await supabase.from('league_members')...
 *     if (!member) throw new Error('You are not a member of this league')  // 403
 *
 * The error is discarded, so a failed query is indistinguishable from a
 * missing row. When the connection pool emptied, fourteen people who were
 * unambiguously in their own league were told they weren't members of it,
 * and the commissioner's league returned "League not found". Losing a
 * request during an incident is survivable; telling users they've been
 * removed from their league is not.
 *
 * These codes mean "infrastructure", never "no such row", so they must
 * surface as 503 and let the client retry rather than being translated
 * into an authorization or existence verdict.
 */

const INFRA_CODES = new Set([
  'PGRST003', // PostgREST: timed out acquiring connection from connection pool
  '57014',    // Postgres: canceling statement due to statement timeout
  '57P01',    // admin_shutdown
  '57P02',    // crash_shutdown
  '57P03',    // cannot_connect_now
  '53300',    // too_many_connections
  '53400',    // configuration_limit_exceeded
  '08000',    // connection_exception
  '08003',    // connection_does_not_exist
  '08006',    // connection_failure
])

/** True when `err` is a transport/capacity failure rather than a data answer. */
export function isInfraError(err) {
  if (!err) return false
  if (INFRA_CODES.has(err.code)) return true
  const msg = String(err.message || '').toLowerCase()
  return msg.includes('connection pool')
    || msg.includes('statement timeout')
    || msg.includes('fetch failed')
    || msg.includes('econnreset')
}

/**
 * Rethrow as 503 when `error` is an infrastructure failure; otherwise do
 * nothing so the caller's own "not found" / "not a member" logic runs.
 *
 * Call this immediately after any query whose empty result would be read
 * as a permission or existence decision:
 *
 *     const { data: member, error } = await supabase...
 *     throwIfInfra(error)
 *     if (!member) { ...403... }
 */
export function throwIfInfra(error, context = undefined) {
  if (!isInfraError(error)) return
  const err = new Error('The server is busy right now. Please try again in a moment.')
  err.status = 503
  err.code = error.code
  err.cause = error
  if (context) err.context = context
  throw err
}
