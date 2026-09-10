// NFL team abbreviation → nickname, for surfaces with room to spell it out.
//
// Deliberately NOT derived by reversing the maps in teamLogos.js: those are
// keyed by full team name across every sport we carry, and the abbreviations
// collide — ATL is both the Falcons and the Dream, CHI both the Bears and the
// Sky, LV both the Raiders and the Aces. Reversing them would confidently
// mislabel WNBA and NBA players. This map is NFL-only and callers must know
// they are looking at an NFL player before using it.
//
// Keys are Sleeper's abbreviations, which is what nfl_players.team holds.
// WSH / JAC / LA and the relocated-franchise codes are included because ESPN
// and older rows use them.
const NFL_TEAM_NICKNAMES = {
  ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills',
  CAR: 'Panthers', CHI: 'Bears', CIN: 'Bengals', CLE: 'Browns',
  DAL: 'Cowboys', DEN: 'Broncos', DET: 'Lions', GB: 'Packers',
  HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars', KC: 'Chiefs',
  LAC: 'Chargers', LAR: 'Rams', LV: 'Raiders', MIA: 'Dolphins',
  MIN: 'Vikings', NE: 'Patriots', NO: 'Saints', NYG: 'Giants',
  NYJ: 'Jets', PHI: 'Eagles', PIT: 'Steelers', SEA: 'Seahawks',
  SF: '49ers', TB: 'Buccaneers', TEN: 'Titans', WAS: 'Commanders',
  // Alternate / legacy codes seen from ESPN and older stored rows
  WSH: 'Commanders', JAC: 'Jaguars', LA: 'Rams',
  OAK: 'Raiders', SD: 'Chargers', STL: 'Rams',
}

/**
 * Nickname for an NFL team abbreviation, or null if it isn't one we know.
 * Returning null rather than the input lets callers decide the fallback —
 * usually showing the raw abbreviation, which is right for free agents ('FA')
 * and for college teams on NCAAF rows.
 */
export function nflTeamNickname(abbr) {
  if (!abbr) return null
  return NFL_TEAM_NICKNAMES[String(abbr).toUpperCase()] || null
}

export default NFL_TEAM_NICKNAMES
