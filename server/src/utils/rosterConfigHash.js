// Starting roster slots used for config matching (alphabetical order, excludes bench/ir)
const STARTING_SLOTS = ['def', 'flex', 'k', 'qb', 'rb', 'sflex', 'te', 'wr']

// MockDraftPage's setup uses `superflex` while prep / leagues use `sflex`.
// Alias so a roster_slots blob with either key produces the same hash.
const KEY_ALIASES = { sflex: 'superflex' }

export function buildRosterConfigHash(rosterSlots) {
  const slots = rosterSlots || {}
  return STARTING_SLOTS.map((k) => {
    const alias = KEY_ALIASES[k]
    const count = slots[k] ?? (alias ? slots[alias] : 0) ?? 0
    return `${count}${k}`
  }).join('-')
}
