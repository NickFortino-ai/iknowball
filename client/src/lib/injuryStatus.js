// Client mirror of server/src/utils/injuryStatus.js. The two must agree: the
// client decides whether to OFFER "Move to IR", the server decides whether to
// ACCEPT it, and a disagreement shows the button then rejects the save.
//
// PUP is eligible — a player on the physically-unable-to-perform list misses a
// minimum number of games by definition, so holding him on the active roster
// costs a slot for something the manager cannot influence.
//
// Deliberately NOT eligible, though all are unavailable: 'sus' (disciplinary,
// not injury), 'dnr', and 'doubtful' (week-to-week, not a long-term absence).
const IR_ELIGIBLE_STATUSES = new Set(['out', 'ir', 'injured reserve', 'pup'])

/** True when this injury_status may be placed in an IR slot. */
export function isIrEligible(injuryStatus) {
  return IR_ELIGIBLE_STATUSES.has(String(injuryStatus || '').toLowerCase())
}
