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

// Which designations can occupy an IR roster slot in traditional fantasy.
//
// A SUPERSET of "Out" and "IR": PUP is a multi-week absence by definition — a
// player on the physically-unable-to-perform list misses a minimum number of
// games — so holding him on the active roster costs a manager a slot for
// something he cannot influence. Added 2026-09-10 at Nick's request.
//
// 'injured reserve' is here because the raw feed has used the long form as
// well as 'IR'.
//
// Deliberately NOT here, though all three are also unavailable: 'sus'
// (suspension is disciplinary, not injury), 'dnr', and 'doubtful' (a
// week-to-week tag, not a long-term absence). Widen only on request — this is
// a league-rules decision, not a data-correctness one, which is why it does
// NOT simply reuse isUnavailable().
export const IR_ELIGIBLE_STATUSES = new Set([
  'out', 'ir', 'injured reserve', 'pup',
])

/** True when this injury_status may be placed in an IR slot. */
export function isIrEligible(injuryStatus) {
  return IR_ELIGIBLE_STATUSES.has(String(injuryStatus || '').toLowerCase())
}
