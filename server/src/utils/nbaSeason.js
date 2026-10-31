// ESPN labels an NBA season by the year it ENDS: 2026-27 is season 2027.
//
// This matters more than it looks. `new Date().getFullYear()` is the right
// season year for MLB, the WNBA, the NFL and college football — all of which
// ESPN labels by the year the season STARTS — and it is wrong for the NBA for
// the three months between October and January, which is exactly when a new
// NBA season is at its most interesting.
//
// Lived in routes/threePoint.js until 2026-10-20, where the player-modal
// gamelog couldn't reach it.

/** The season currently being played (or about to be). Oct 2026 → 2027. */
export function currentNbaSeason(now = new Date()) {
  const pt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const y = pt.getFullYear()
  // Sep onward belongs to the season that ends next year.
  return pt.getMonth() >= 8 ? y + 1 : y
}

/**
 * The last season with a COMPLETE 82-game regular season behind it.
 *
 * Used where a full sample beats a current one — ranking a contest on opening
 * night, where every current-season total is still 0.
 */
export function lastCompletedNbaRegularSeason(now = new Date()) {
  const pt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const y = pt.getFullYear()
  const m = pt.getMonth()            // 0 = Jan
  if (m >= 8) return y               // Sep-Dec: season starting now is y+1, so y is done
  if (m <= 5) return y - 1           // Jan-Jun: season y is still being played
  return y                           // Jul-Aug: offseason, season y finished in June
}

/**
 * The season year to ask ESPN for, for any sport.
 *
 * Only the NBA differs from the calendar year. Centralised so the next place
 * that needs a season param doesn't re-derive the rule and get the NBA wrong.
 */
export function espnSeasonYear(sport, now = new Date()) {
  // Basketball seasons straddle the new year and ESPN names them by the year
  // they END: 2026-27 is season 2027. College basketball follows the same
  // convention as the NBA, so it belongs here too — the calendar year would
  // ask for the season that just finished, and ESPN answers with completed
  // totals rather than an error, which is the trap. Every other sport here
  // (NFL, MLB, WNBA, MLS, college football) runs inside one calendar year.
  if (sport === 'basketball_nba' || sport === 'basketball_ncaab' || sport === 'basketball_wncaab') {
    return currentNbaSeason(now)
  }
  return now.getFullYear()
}
