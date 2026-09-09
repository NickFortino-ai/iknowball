// Which injury designations mean a player cannot take the field.
//
// One definition, because this question was being answered independently in
// at least four places and they disagreed. The recurring mistake was testing
// for 'Out' — which does NOT appear in nfl_players at all outside of the
// weekly game-status window — and treating that as complete. That made every
// such check effectively IR-only, silently ignoring PUP, suspended and DNR.
//
// Deliberately NOT here:
//   Questionable — expected to play. Holds his roster slot, carries a badge,
//                  and keeps his projection.
//   NA           — Sleeper's "no designation" placeholder, not an injury.
//                  Josh Jacobs carries it while starting.
export const UNAVAILABLE_INJURY_STATUSES = new Set([
  'out', 'doubtful', 'ir', 'pup', 'sus', 'suspended', 'dnr',
])

/** True when this injury_status means the player cannot play. */
export function isUnavailable(injuryStatus) {
  return UNAVAILABLE_INJURY_STATUSES.has(String(injuryStatus || '').toLowerCase())
}
