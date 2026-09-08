// THE definition of a fantasy roster's slots. Server side.
//
// Before this existed, ten files independently answered "which starter slots
// does this league have, in what order, and which positions may fill each" —
// two copies in fantasyService's starterPlan, one in its lineup validator,
// one in routes/dfs, and six in the client. They drifted, and the drift was
// the bug, repeatedly:
//
//   * FantasyDraftRoom had no IDP slots, so a roster read "17/16" and every
//     drafted defender fell to the bench
//   * the S slot accepted only S/FS/SS while Sleeper files nearly every
//     safety as DB, so it could never be filled
//   * flex and superflex were tested with `if (count >= 1)` instead of being
//     looped, so a flex:2 league silently ran one flex short — the extra
//     starter spilled onto the bench and the lineup validator rejected the
//     slot the UI was offering
//
// Client mirror: client/src/lib/rosterSlots.js. The two must agree; the
// client one carries the display labels, this one is the source of truth for
// eligibility and ordering. Change both together.

// Position codes mirror what Sleeper stamps on nfl_players.position.
//
// IDP families are deliberately wide. Sleeper files nearly every defensive
// back as 'DB' — only a handful of S/FS/SS rows exist league-wide and they
// are mostly retired — so an S slot that accepted only S/FS/SS was
// unfillable in practice.
export const SLOT_ELIGIBILITY = {
  qb: ['QB'],
  rb: ['RB'],
  wr: ['WR'],
  te: ['TE'],
  k: ['K'],
  def: ['DEF'],
  flex: ['RB', 'WR', 'TE'],
  superflex: ['QB', 'RB', 'WR', 'TE'],
  dl: ['DE', 'DT', 'NT', 'DL'],
  lb: ['LB', 'ILB', 'OLB', 'MLB'],
  db: ['CB', 'DB'],
  s: ['S', 'FS', 'SS', 'DB'],
}

// Default display labels, keyed by base slot. Views that want shorter forms
// (the matchup grid uses FLX / SFLX to fit its columns) override per key
// rather than rebuilding the list.
export const SLOT_LABELS = {
  qb: 'QB', rb: 'RB', wr: 'WR', te: 'TE', k: 'K', def: 'DEF',
  flex: 'FLEX', superflex: 'SFLEX', dl: 'DL', lb: 'LB', db: 'DB', s: 'S',
}

// Every position any starter slot can hold. Bench and IR accept all of them —
// without the IDP codes here an IDP league cannot bench or IR a defender.
export const ALL_ROSTERABLE_POSITIONS = [
  ...new Set(Object.values(SLOT_ELIGIBILITY).flat()),
]

// Canonical render/fill order. Offense, flex, kicker and team defense, then
// IDP. Callers that need a different order should sort the returned array
// rather than rebuilding it.
const SLOT_ORDER = ['qb', 'rb', 'wr', 'te', 'flex', 'superflex', 'k', 'def', 'dl', 'lb', 'db', 's']

// Slots whose first instance keeps the bare key. Historic roster rows say
// 'flex' and 'te', not 'flex1'/'te1', so numbering these from 1 would orphan
// every existing row. rb/wr/dl/lb/db/s have always been numbered from 1.
const BARE_FIRST = new Set(['qb', 'te', 'k', 'def', 'flex', 'superflex'])

export function slotKeyFor(base, index) {
  if (index === 1 && BARE_FIRST.has(base)) return base
  return `${base}${index}`
}

const DEFAULT_SLOTS = { qb: 1, rb: 2, wr: 3, te: 1, flex: 1, k: 1, def: 1, bench: 6, ir: 1 }

/**
 * Expand a league's roster_slots config into its ordered starter slots.
 *
 * Returns [{ key, base, positions }] — `key` is the value stored in
 * fantasy_rosters.slot, `base` is the config key it came from, `positions`
 * is the eligibility allowlist.
 *
 * Counts are counts. A slot configured 0 produces nothing; a slot configured
 * 2 produces two entries. There is no boolean special case for any slot.
 */
export function buildStarterSlots(rosterSlots) {
  const slots = rosterSlots || DEFAULT_SLOTS
  const out = []
  for (const base of SLOT_ORDER) {
    const count = Number(slots[base]) || 0
    for (let i = 1; i <= count; i++) {
      out.push({ key: slotKeyFor(base, i), base, positions: SLOT_ELIGIBILITY[base] })
    }
  }
  return out
}

/**
 * "Is this slot a starter?" — config-agnostic on purpose. Anything that is
 * not bench or IR counts, so a slot type added to the config scores without
 * anyone remembering to update a scoring allowlist. Orphan slots are demoted
 * to bench upstream by fillEmptyStarterSlots, so they never reach here.
 */
export function isStarterSlot(slot) {
  const s = String(slot || '').toLowerCase()
  if (!s) return false
  if (s === 'bench' || s.startsWith('bench')) return false
  if (s === 'ir' || s.startsWith('ir')) return false
  return true
}

/**
 * Maps used to validate a submitted lineup: the set of legal starter keys,
 * and per-slot position allowlists including bench and IR.
 */
export function buildLineupValidationMaps(rosterSlots) {
  const starters = buildStarterSlots(rosterSlots)
  const slotPositions = {
    bench: ALL_ROSTERABLE_POSITIONS,
    ir: ALL_ROSTERABLE_POSITIONS,
  }
  for (const s of starters) slotPositions[s.key] = s.positions
  return { starterKeys: starters.map((s) => s.key), slotPositions }
}
