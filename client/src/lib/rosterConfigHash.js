// Starting roster slots used for config matching (alphabetical order, excludes bench/ir)
const STARTING_SLOTS = ['def', 'flex', 'k', 'qb', 'rb', 'sflex', 'te', 'wr']

export function buildRosterConfigHash(rosterSlots) {
  return STARTING_SLOTS.map(k => `${rosterSlots[k] || 0}${k}`).join('-')
}
