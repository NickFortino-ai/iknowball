// Sports whose UPCOMING games open the revamped pregame modal (GameIntelModal).
//
// Broader than INJURY_SPORTS on the server, which is only about lineup/injury
// coverage. This set is about whether the PREVIEW is worth opening — odds,
// team leaders, recent form or schedule, venue — which works for any sport
// ESPN publishes a summary for. NCAAF has no lineup feed at all but is
// exactly the sport the preview was built for.
//
// Shared by the Picks page and both scoreboards so the three surfaces can't
// disagree about which games are tappable. Live and final games are NOT
// governed by this — those open Game Center, which works for any sport in the
// server's SPORT_TO_PATH.
export const GAME_INTEL_SPORTS = new Set([
  'basketball_nba',
  'basketball_wnba',
  'americanfootball_nfl',
  'americanfootball_ncaaf',
  'baseball_mlb',
  'icehockey_nhl',
])

export function hasPregameIntel(sportKey) {
  return GAME_INTEL_SPORTS.has(sportKey)
}
