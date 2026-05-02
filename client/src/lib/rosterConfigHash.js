// Starting roster slots used for config matching (alphabetical order, excludes bench/ir)
const STARTING_SLOTS = ['def', 'flex', 'k', 'qb', 'rb', 'sflex', 'te', 'wr']

// MockDraftPage's setup uses `superflex` while prep / leagues use `sflex`.
// Treat them as the same slot so rankings saved on one page match a mock
// set up on the other.
const KEY_ALIASES = { sflex: 'superflex' }

export function buildRosterConfigHash(rosterSlots) {
  const slots = rosterSlots || {}
  return STARTING_SLOTS.map((k) => {
    const alias = KEY_ALIASES[k]
    const count = slots[k] ?? (alias ? slots[alias] : 0) ?? 0
    return `${count}${k}`
  }).join('-')
}

// Reverses buildRosterConfigHash — given a hash like "1def-1flex-1k-1qb-2rb-0sflex-1te-2wr",
// returns { def: 1, flex: 1, k: 1, qb: 1, rb: 2, sflex: 0, te: 1, wr: 2 }.
export function parseRosterConfigHash(hash) {
  const slots = {}
  for (const token of (hash || '').split('-')) {
    const m = token.match(/^(\d+)(.+)$/)
    if (m) slots[m[2]] = parseInt(m[1], 10)
  }
  return slots
}
