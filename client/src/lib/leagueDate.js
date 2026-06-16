// Shared formatters for league dates. All league displays should anchor
// to PT (the canonical sports day timezone), not the user's local zone
// and not ET — late West Coast games drift across day boundaries
// otherwise. End dates additionally need a 12h shift back because they're
// stored as "end of sports day PT" = next-day 10:00 UTC = next-day 3 AM PT;
// without the shift, "end of June 19 PT" displays as "Jun 20".

const SHORT = { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }

export function formatStartDateShort(isoStr) {
  if (!isoStr) return null
  return new Date(isoStr).toLocaleDateString('en-US', SHORT)
}

export function formatEndDateShort(isoStr) {
  if (!isoStr) return null
  // Shift back 12h so end-of-sports-day timestamps land squarely in the
  // commissioner-picked PT day. Noon-anchored values are unaffected.
  const shifted = new Date(new Date(isoStr).getTime() - 12 * 60 * 60 * 1000)
  return shifted.toLocaleDateString('en-US', SHORT)
}
