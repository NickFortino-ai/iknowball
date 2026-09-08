// THE definition of a fantasy roster's slots. Client side.
//
// Mirror of server/src/utils/rosterSlots.js. They must agree — the server is
// the source of truth for eligibility and ordering, and it validates every
// lineup this client submits, so a divergence here shows up as the UI
// offering a slot the server then rejects.
//
// Before this existed, six client components each built their own slot list
// (FantasyMyTeam, FantasyMatchup, FantasyLiveView, FantasyDraftRoom,
// FantasyPlayerBrowser, RosterList, ForceLineupModal) alongside four on the
// server. They drifted, and the drift was the bug, repeatedly:
//
//   * FantasyDraftRoom had no IDP slots, so a roster read "17/16" and every
//     drafted defender fell to the bench
//   * the S slot accepted only S/FS/SS while Sleeper files nearly every
//     safety as DB, so it could never be filled
//   * flex and superflex were tested with `if (count >= 1)` instead of being
//     looped, so a flex:2 league ran one flex short — the extra starter
//     spilled onto the bench and saving the lineup failed validation
//
// If you are adding a slot type, change this file and its server twin, and
// nothing else should need to know.

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
  // Sleeper files nearly every safety as DB, so an S slot that accepted only
  // S/FS/SS was unfillable — it rendered "Empty S — tap to assign" with no
  // eligible player anywhere on the roster.
  s: ['S', 'FS', 'SS', 'DB'],
}

export const SLOT_LABELS = {
  qb: 'QB', rb: 'RB', wr: 'WR', te: 'TE', k: 'K', def: 'DEF',
  flex: 'FLEX', superflex: 'SFLEX', dl: 'DL', lb: 'LB', db: 'DB', s: 'S',
}

// Compact labels for the matchup grid, whose columns are too narrow for the
// full words.
export const SLOT_LABELS_SHORT = { ...SLOT_LABELS, flex: 'FLX', superflex: 'SFLX' }

export const ALL_ROSTERABLE_POSITIONS = [
  ...new Set(Object.values(SLOT_ELIGIBILITY).flat()),
]

const SLOT_ORDER = ['qb', 'rb', 'wr', 'te', 'flex', 'superflex', 'k', 'def', 'dl', 'lb', 'db', 's']

// Slots whose first instance keeps the bare key. Historic roster rows say
// 'flex' and 'te', not 'flex1'/'te1'.
const BARE_FIRST = new Set(['qb', 'te', 'k', 'def', 'flex', 'superflex'])

export function slotKeyFor(base, index) {
  if (index === 1 && BARE_FIRST.has(base)) return base
  return `${base}${index}`
}

const DEFAULT_SLOTS = { qb: 1, rb: 2, wr: 3, te: 1, flex: 1, k: 1, def: 1, bench: 6, ir: 1 }

/**
 * Expand a league's roster_slots config into its ordered starter slots.
 * Returns [{ key, base, label, shortLabel, positions }].
 *
 * Counts are counts — a slot configured 2 produces two entries. No slot has
 * a boolean special case.
 */
export function buildStarterSlots(rosterSlots) {
  const slots = rosterSlots || DEFAULT_SLOTS
  const out = []
  for (const base of SLOT_ORDER) {
    const count = Number(slots[base]) || 0
    for (let i = 1; i <= count; i++) {
      out.push({
        key: slotKeyFor(base, i),
        base,
        label: SLOT_LABELS[base],
        shortLabel: SLOT_LABELS_SHORT[base],
        positions: SLOT_ELIGIBILITY[base],
      })
    }
  }
  return out
}

/** Anything that is not bench or IR. Mirrors the server's isStarterSlot. */
export function isStarterSlot(slot) {
  const s = String(slot || '').toLowerCase()
  if (!s) return false
  if (s === 'bench' || s.startsWith('bench')) return false
  if (s === 'ir' || s.startsWith('ir')) return false
  return true
}

/** True for an IR slot. IR players are neither starters nor bench. */
export function isIrSlot(slot) {
  return String(slot || '').toLowerCase().startsWith('ir')
}

/** Does this player's position fit this slot? Handles "WR/DB" dual positions. */
export function positionFitsSlot(position, slotKeyOrBase, rosterSlots) {
  const base = (buildStarterSlots(rosterSlots).find((s) => s.key === slotKeyOrBase) || {}).base
    || String(slotKeyOrBase || '').replace(/\d+$/, '')
  const allowed = SLOT_ELIGIBILITY[base]
  if (!allowed) return false
  // The server sends dual-eligible players as "WR/DB"; either side may match.
  return String(position || '').split('/').map((p) => p.trim().toUpperCase()).some((p) => allowed.includes(p))
}
