// Surname extraction for compact displays — survivor pick chips, anywhere a
// full name won't fit.
//
// The naive "last word" rule was in use before this and got Amon-Ra St. Brown
// wrong, rendering him as "Brown". Two things have to be handled:
//
//   1. Generational suffixes. "Marvin Harrison Jr." should be "Harrison", not
//      "Jr.". Stripped before anything else.
//
//   2. Surname particles — St., Van, De, Della and friends. These belong to
//      the surname: "St. Brown", "Van Ginkel", "De La Cruz".
//
// The trap in (2) is that several of those words are also FIRST names. Van
// Jefferson's surname is Jefferson, not "Van Jefferson". So a particle only
// joins the surname when it isn't the first token — which is exactly the
// difference between "Amon-Ra St. Brown" (3 tokens, particle in the middle)
// and "Van Jefferson" (2 tokens, particle leading).
const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v'])

const PARTICLES = new Set([
  'st', 'st.', 'saint',
  'van', 'von', 'der', 'den', 'ter',
  'de', 'del', 'della', 'di', 'da', 'dos', 'du',
  'la', 'le', 'lo',
])

/**
 * Last name for display. Falls back to the whole string when there's nothing
 * sensible to trim.
 */
export function playerLastName(fullName) {
  const raw = String(fullName || '').trim()
  if (!raw) return ''

  let parts = raw.split(/\s+/)

  // Drop generational suffixes from the end (there can be more than one in
  // scraped data, e.g. "Deion Sanders Jr. II").
  while (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1].toLowerCase())) {
    parts = parts.slice(0, -1)
  }
  if (parts.length === 1) return parts[0]

  // Walk backwards over particles, but never consume the first token — that
  // one is the given name, however particle-like it looks.
  let start = parts.length - 1
  while (start > 1 && PARTICLES.has(parts[start - 1].toLowerCase())) {
    start -= 1
  }

  return parts.slice(start).join(' ')
}
