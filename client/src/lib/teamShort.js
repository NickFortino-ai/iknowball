// Short label for a picked team name — used on survivor pick chips
// where horizontal space is tight and the last word is usually the
// mascot (Portland Trail Blazers → Blazers).
//
// Handles the All-Star Game edge case: names like "American League"
// or "National League" collapse to just "League" under the naive
// last-word rule, which is ambiguous. When the tail word is a generic
// descriptor (League, Conference, Team, Division, All-Stars), fall
// back to initials so "National League" → "NL".
const GENERIC_TAIL = new Set([
  'league',
  'conference',
  'team',
  'division',
  'all-stars',
  'allstars',
])

export function shortTeamLabel(fullName) {
  if (!fullName) return ''
  const words = fullName.trim().split(/\s+/)
  if (words.length === 1) return words[0]
  const lastLower = words[words.length - 1].toLowerCase()
  if (GENERIC_TAIL.has(lastLower)) {
    return words.map((w) => w[0]).join('').toUpperCase()
  }
  return words[words.length - 1]
}
