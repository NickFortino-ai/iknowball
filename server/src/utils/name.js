// Shared name normalization for accent-insensitive matching across
// player lookups. Multiple ESPN endpoints serve the same athlete under
// slightly different encodings (e.g. "Jovana Nogić" vs "Jovana Nogic"),
// so direct string equality misses high-profile players whenever a
// diacritic differs. Use stripAccents on both sides of a comparison.

export function stripAccents(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function normalizeName(s) {
  return stripAccents(s).toLowerCase().trim()
}
