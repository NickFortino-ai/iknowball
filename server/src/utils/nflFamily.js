// The NFL "family" — regular season + preseason. These are separate
// sport rows in the `sports` table (distinct sport_id) so that fantasy,
// DFS, league, and prop code paths that filter on the regular NFL key
// never accidentally pick up preseason games. Preseason is opt-in for
// the specific code paths that want it: game ingestion, score sync,
// and user-facing rollups on the picks board / NFL leaderboard.

export const NFL_REGULAR_KEY = 'americanfootball_nfl'
export const NFL_PRESEASON_KEY = 'americanfootball_nfl_preseason'
export const NFL_FAMILY_KEYS = [NFL_REGULAR_KEY, NFL_PRESEASON_KEY]

// Expand a user-facing sport key into the set of sport keys that should
// be included in reads/rollups. For NFL, that's both regular + preseason.
// Everything else is passed through unchanged.
export function expandSportFamily(sportKey) {
  if (sportKey === NFL_REGULAR_KEY) return NFL_FAMILY_KEYS
  return [sportKey]
}

// Roll a sport key up to its user-facing "display" key. Preseason rolls
// up to regular NFL so filters, tabs, and leaderboards bucket it under
// "NFL". Everything else maps to itself.
export function rollupSportKey(sportKey) {
  if (sportKey === NFL_PRESEASON_KEY) return NFL_REGULAR_KEY
  return sportKey
}
