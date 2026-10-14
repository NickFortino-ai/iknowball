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

// Tile art, keyed by the arcade's full sport key. The per-sport images are
// the same files the Props tiles use — shared rather than copied, so a sport
// looks like itself wherever it appears.
//
// 'all' has its own art rather than a Props file, because it is a catch-all
// and no single sport's photograph can stand for it. Nick's illustration of
// the three balls does. It lives under backdrops/trivia/ since nothing in
// Props has an "every sport" tile to use it.
//
// Full paths rather than bare filenames: these no longer all come from one
// folder, and a helper that silently assumes one would send the next entry
// to the wrong place.
//
// Sports with no entry fall back to a plain bordered tile.
const SPORT_BACKDROPS = {
  all: '/backdrops/trivia/all-sports.webp',
  americanfootball_nfl: '/backdrops/props/nfl.jpg',
  basketball_nba: '/backdrops/props/nba.webp',
  baseball_mlb: '/backdrops/props/mlb.jpg',
  americanfootball_ncaaf: '/backdrops/props/ncaaf.jpg',
  basketball_ncaab: '/backdrops/props/ncaab.webp',
  basketball_wnba: '/backdrops/props/wnba.jpg',
}

export function sportLabel(key) {
  return SPORT_LABELS[key] || key
}

/** Public URL of a sport's backdrop, or null when we have no art for it. */
export function sportBackdrop(key) {
  return SPORT_BACKDROPS[key] || null
}

/** Sort a list of `{ key }` into display order. */
export function orderSports(list) {
  const rank = (k) => {
    const i = SPORT_ORDER.indexOf(k)
    return i === -1 ? SPORT_ORDER.length : i
  }
  return [...(list || [])].sort((a, b) => rank(a.key) - rank(b.key))
}
