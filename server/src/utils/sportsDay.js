// Sports-day timezone anchor — the CANONICAL date/anchor helper for the
// server. All new code doing "what day is this slate for" math must route
// through here.
//
// All US pro sports finish within the Pacific calendar day — the latest
// regular start is a 10pm PT West Coast game ending ~1am PT. By
// anchoring our "what day is this slate for?" math to PT we get a
// reliable boundary: every game on any given slate starts AND ends
// within the same PT calendar day.
//
// Why PT and not ET: with ET anchoring, a West Coast game starting
// 10pm PT begins at 1am ET — meaning it lives on a *different* ET day
// from the rest of its slate. That breaks scoreboard lookups, box-
// score scrapes, daily standings, and roster lock windows whenever
// the late game runs long.
//
// DO NOT introduce new ad-hoc `toLocaleDateString('en-CA', { timeZone:
// 'America/New_York' })` calls. Existing America/New_York references in
// server code are either (a) cron anchors matching NFL business hours,
// (b) external-API calendar matches (ESPN/Sleeper key by ET date), or
// (c) reminder-time-of-day business decisions. New code should almost
// always use PT-anchored helpers here.
//
// See feedback_no_utc_date_math and project_timezone_debt_audit for
// the rules and the 2026-07-09 audit that hardened this convention.

export const SPORTS_TZ = 'America/Los_Angeles'

/**
 * The current sports day as YYYY-MM-DD. Returns the PT calendar date.
 */
export function todaySportsDay() {
  return new Date().toLocaleDateString('en-CA', { timeZone: SPORTS_TZ })
}

/**
 * Add N days to a YYYY-MM-DD string and return the result as a YYYY-MM-DD
 * string. Noon-anchored so DST transitions never flip the date. Negative
 * `days` works fine.
 */
export function addDaysSportsDay(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

/**
 * The previous sports day as YYYY-MM-DD.
 */
export function yesterdaySportsDay() {
  return addDaysSportsDay(todaySportsDay(), -1)
}

/**
 * The next sports day as YYYY-MM-DD.
 */
export function tomorrowSportsDay() {
  return addDaysSportsDay(todaySportsDay(), 1)
}

/**
 * Convert a Date or ISO string to its sports-day (PT) date string.
 */
export function toSportsDay(input) {
  const d = typeof input === 'string' ? new Date(input) : input
  return d.toLocaleDateString('en-CA', { timeZone: SPORTS_TZ })
}

/**
 * Recover the commissioner-picked end date (PT YYYY-MM-DD) from a stored
 * league.ends_at. Stored end dates use the "end of sports day PT" convention:
 * next-day 10:00 UTC (= 3 AM PT next day). Shift back 12h so the picked date
 * lands cleanly inside the PT calendar day.
 */
export function leagueEndSportsDay(endsAt) {
  if (!endsAt) return null
  const d = new Date(new Date(endsAt).getTime() - 12 * 60 * 60 * 1000)
  return d.toLocaleDateString('en-CA', { timeZone: SPORTS_TZ })
}

/**
 * Recover the start date (PT YYYY-MM-DD) from a stored league.starts_at.
 * Start dates are noon-PT anchored, so a plain PT format works without the
 * 12h trick used for end dates.
 */
export function leagueStartSportsDay(startsAt) {
  if (!startsAt) return null
  return new Date(startsAt).toLocaleDateString('en-CA', { timeZone: SPORTS_TZ })
}
