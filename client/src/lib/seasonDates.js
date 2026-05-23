// REGULAR-season start and end dates by sport (approximate, updated yearly).
// Full-season leagues run through the regular season only — playoff games
// don't count.

export function getSeasonEndDate(sportKey) {
  const year = new Date().getFullYear()
  const dates = {
    basketball_nba: `${year}-04-12`,
    americanfootball_nfl: `${year + 1}-01-05`,
    baseball_mlb: `${year}-09-29`,
    basketball_ncaab: `${year}-03-08`,
    basketball_wncaab: `${year}-03-08`,
    americanfootball_ufl: `${year}-06-15`,
    americanfootball_ncaaf: `${year}-12-07`,
    basketball_wnba: `${year}-09-14`,
    icehockey_nhl: `${year}-04-18`,
    soccer_usa_mls: `${year}-10-18`,
  }
  const endDate = dates[sportKey] || `${year}-12-31`
  if (new Date(endDate) < new Date()) {
    const d = new Date(endDate)
    d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().split('T')[0]
  }
  return endDate
}

export function getSeasonStartDate(sportKey) {
  const year = new Date().getFullYear()
  const dates = {
    basketball_nba: `${year}-10-21`,
    americanfootball_nfl: `${year}-09-04`,
    baseball_mlb: `${year}-03-27`,
    basketball_ncaab: `${year}-11-03`,
    basketball_wncaab: `${year}-11-03`,
    americanfootball_ufl: `${year}-03-28`,
    americanfootball_ncaaf: `${year}-08-23`,
    basketball_wnba: `${year}-05-16`,
    icehockey_nhl: `${year}-10-07`,
    soccer_usa_mls: `${year}-02-22`,
  }
  return dates[sportKey] || null
}

export function isSeasonUnderway(sportKey) {
  if (!sportKey || sportKey === 'all') return false
  const start = getSeasonStartDate(sportKey)
  const end = getSeasonEndDate(sportKey)
  if (!start || !end) return false
  const now = new Date()
  return new Date(start) <= now && now <= new Date(end)
}

/**
 * End of the current NFL week — used by single-week contest leagues
 * (sacks / ints / tackles / receptions / td_pass). Returns the upcoming
 * Tuesday 09:00 in the user's local time, which sits comfortably after
 * Monday Night Football wraps. Already-Tuesday-morning bumps to next
 * Tuesday so a Tuesday-create still includes the full week ahead.
 */
export function getNflWeekEnd() {
  const d = new Date()
  const day = d.getDay() // Sun=0, Mon=1, Tue=2, ...
  // Days until next Tuesday 09:00. If it's already Tuesday past 9am we
  // jump to the next Tuesday; before 9am Tuesday counts as still in
  // this week (catches a Tuesday-morning makeup game).
  let daysUntilTuesday = (2 - day + 7) % 7
  if (daysUntilTuesday === 0 && d.getHours() >= 9) daysUntilTuesday = 7
  d.setDate(d.getDate() + daysUntilTuesday)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}
