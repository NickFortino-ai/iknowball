// Client mirror of server's sports-day anchor. All US pro sports finish
// within the Pacific calendar day, so we anchor "today" and "tomorrow"
// to PT regardless of the user's local timezone. This keeps client and
// server agreeing on which slate a user is looking at — no more
// "this user sees tonight's games on the wrong tab because they're in
// Hawaii" or "ET user sees a late West Coast final under tomorrow."

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
