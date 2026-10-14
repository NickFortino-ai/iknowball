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

  // An HTML body is NEVER a data answer. PostgREST and GoTrue speak JSON, so
  // a message containing a markup document came from a proxy sitting in front
  // of them rather than from the database itself.
  //
  // Added after the 2026-10-13 Supabase outage, which this function did not
  // catch. Queries came back carrying Cloudflare's "502 Bad Gateway" page as
  // their message, and because none of the string tests below matched, every
  // call site read the failure as a data answer — including the login
  // resolver, which told Nick his own account did not exist.
  if (msg.includes('<html')) return true
  if (msg.includes('bad gateway')
    || msg.includes('gateway time-out')
    || msg.includes('gateway timeout')
    || msg.includes('service unavailable')) return true

  // Supabase's edge returns this when it cannot route to the project at all —
  // seen on /users/me/invitations during the same outage. It reads like a
  // configuration mistake and is not one.
  if (msg.includes('project not specified')) return true

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
