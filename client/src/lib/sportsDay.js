// Client mirror of server's sports-day anchor — the CANONICAL date/anchor
// helper for the client. All new code doing "what day is this slate for"
// math must route through here.
//
// All US pro sports finish within the Pacific calendar day, so we anchor
// "today" and "tomorrow" to PT regardless of the user's local timezone.
// This keeps client and server agreeing on which slate a user is looking
// at — no more "this user sees tonight's games on the wrong tab because
// they're in Hawaii" or "ET user sees a late West Coast final under
// tomorrow."
//
// This module is for date-KEY math (comparing dates, extracting a
// calendar day, adding days). For VIEWER-LOCAL time RENDERING (game
// starts, message timestamps, draft dates in the viewer's own clock),
// see lib/leagueDate.js — those correctly do NOT force a timezone
// because a user in ET wants to see their game time as "8:20 PM" on
// their own clock, not "5:20 PM PT."
//
// See feedback_no_utc_date_math and project_timezone_debt_audit for
// the 2026-07-09 audit that hardened this convention.

export const SPORTS_TZ = 'America/Los_Angeles'

export function todaySportsDay() {
  return new Date().toLocaleDateString('en-CA', { timeZone: SPORTS_TZ })
}

export function tomorrowSportsDay() {
  // Anchor on the PT calendar date, then add a day via noon-anchored Date math.
  // The earlier implementation used `toISOString().split('T')[0]` which returns
  // a UTC date — for users in PT (or further west) during evening hours, that
  // is the day AFTER PT-tomorrow, so the contest views requested the wrong date
  // and got an empty player pool.
  return addDaysSportsDay(todaySportsDay(), 1)
}

export function addDaysSportsDay(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA')
}

// Recover the commissioner-picked end date (PT YYYY-MM-DD) from a stored
// league.ends_at. Stored end dates use the "end of sports day PT" convention:
// next-day 10:00 UTC (= 3 AM PT next day). Shift back 12h so the picked date
// lands cleanly inside the PT calendar day.
export function leagueEndSportsDay(endsAt) {
  if (!endsAt) return null
  const d = new Date(new Date(endsAt).getTime() - 12 * 60 * 60 * 1000)
  return d.toLocaleDateString('en-CA', { timeZone: SPORTS_TZ })
}

// Recover the start date (PT YYYY-MM-DD) from a stored league.starts_at.
// Start dates are noon-PT anchored, so a plain PT format works without the
// 12h trick used for end dates.
export function leagueStartSportsDay(startsAt) {
  if (!startsAt) return null
  return new Date(startsAt).toLocaleDateString('en-CA', { timeZone: SPORTS_TZ })
}
