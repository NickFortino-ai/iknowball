/**
 * How sports are named and ordered wherever the arcade lists them.
 *
 * One module because there are two lists — the trivia category picker and
 * the leaderboard's sport filter — and a label defined twice is a label that
 * ends up saying two things.
 *
 * NCAAF reads as "College Football" rather than the key. NCAAF is what the
 * data calls it and what a scoreboard header has room for; a category you
 * pick before playing has room for the words, and the words are what people
 * say out loud.
 */
export const SPORT_LABELS = {
  all: 'All Sports',
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  americanfootball_ncaaf: 'College Football',
  basketball_ncaab: 'College Basketball',
  basketball_wnba: 'WNBA',
  icehockey_nhl: 'NHL',
  soccer_usa_mls: 'MLS',
}

// Deliberate, not alphabetical and not by question count — this is the order
// these leagues matter in to the people using IKB. Anything unlisted falls
// to the end rather than disappearing.
const SPORT_ORDER = [
  'americanfootball_nfl',
  'basketball_nba',
  'baseball_mlb',
  'americanfootball_ncaaf',
  'basketball_ncaab',
  'basketball_wnba',
  'icehockey_nhl',
  'soccer_usa_mls',
]

export function sportLabel(key) {
  return SPORT_LABELS[key] || key
}

/** Sort a list of `{ key }` into display order. */
export function orderSports(list) {
  const rank = (k) => {
    const i = SPORT_ORDER.indexOf(k)
    return i === -1 ? SPORT_ORDER.length : i
  }
  return [...(list || [])].sort((a, b) => rank(a.key) - rank(b.key))
}
