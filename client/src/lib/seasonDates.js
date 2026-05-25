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

// Approximate playoff/postseason end dates by sport. These are when the
// championship round wraps up (NBA Finals, World Series, Stanley Cup, etc.)
// — updated yearly. Returned in the same year-rollover style as
// getSeasonEndDate: if the date is already past, roll forward a year so
// "this year's playoffs" always points to the next live postseason.
export function getPlayoffEndDate(sportKey) {
  const year = new Date().getFullYear()
  const dates = {
    basketball_nba: `${year}-06-22`,
    basketball_wnba: `${year}-10-20`,
    baseball_mlb: `${year}-11-05`,
    icehockey_nhl: `${year}-06-18`,
    americanfootball_nfl: `${year + 1}-02-09`,
    americanfootball_ufl: `${year}-06-15`,
  }
  const endDate = dates[sportKey]
  if (!endDate) return null
  if (new Date(endDate) < new Date()) {
    const d = new Date(endDate)
    d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().split('T')[0]
  }
  return endDate
}

// True only between the regular-season end and the playoff end — i.e.,
// playoffs are happening right now. During the regular season returns false;
// after the championship round returns false.
export function arePlayoffsUnderway(sportKey) {
  if (!sportKey || sportKey === 'all') return false
  if (isSeasonUnderway(sportKey)) return false
  const playoffEnd = getPlayoffEndDate(sportKey)
  if (!playoffEnd) return false
  const now = new Date()
  return now <= new Date(playoffEnd)
}

// End date used by Full Season DFS/contest leagues. During the regular
// season this is the regular-season end (consistent with the legacy
// behavior). During playoffs we extend through the championship round so
// "Full Season" picked in mid-May means "through the Finals", not "ended
// last month". Falls back to regular-season end for sports without a
// configured playoff date.
export function getFullSeasonLeagueEndDate(sportKey) {
  if (arePlayoffsUnderway(sportKey)) {
    const playoffEnd = getPlayoffEndDate(sportKey)
    if (playoffEnd) return playoffEnd
  }
  return getSeasonEndDate(sportKey)
}

// Sport-specific copy for the playoff button label and helper text.
// Used when arePlayoffsUnderway returns true, so the Full Season option
// reads as "Through the Finals" / "Runs through the NBA Finals." rather
// than the generic regular-season language.
export function getPlayoffsButtonLabel(sportKey) {
  return ({
    basketball_nba: 'Through the Finals',
    basketball_wnba: 'Through the Finals',
    baseball_mlb: 'Through the World Series',
    icehockey_nhl: 'Through the Cup Finals',
    americanfootball_nfl: 'Through the Super Bowl',
  })[sportKey] || 'Through Postseason'
}

export function getPlayoffsHelperText(sportKey) {
  return ({
    basketball_nba: 'Runs through the NBA Finals.',
    basketball_wnba: 'Runs through the WNBA Finals.',
    baseball_mlb: 'Runs through the World Series.',
    icehockey_nhl: 'Runs through the Stanley Cup Finals.',
    americanfootball_nfl: 'Runs through the Super Bowl.',
  })[sportKey] || 'Runs through end of postseason.'
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
