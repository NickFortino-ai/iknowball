// Sports-day timezone anchor.
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
// Use these helpers instead of ad-hoc toLocaleDateString('en-CA',
// { timeZone: 'America/New_York' }) calls in any new code dealing
// with daily slates or game-day reasoning.

export const SPORTS_TZ = 'America/Los_Angeles'

/**
 * The current sports day as YYYY-MM-DD. Returns the PT calendar date.
 */
export function todaySportsDay() {
  return new Date().toLocaleDateString('en-CA', { timeZone: SPORTS_TZ })
}

/**
 * The previous sports day as YYYY-MM-DD.
 */
export function yesterdaySportsDay() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: SPORTS_TZ }))
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

/**
 * Convert a Date or ISO string to its sports-day (PT) date string.
 */
export function toSportsDay(input) {
  const d = typeof input === 'string' ? new Date(input) : input
  return d.toLocaleDateString('en-CA', { timeZone: SPORTS_TZ })
}
