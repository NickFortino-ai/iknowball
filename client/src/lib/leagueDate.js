// Shared formatters for league dates. All league displays should anchor
// to PT (the canonical sports day timezone), not the user's local zone
// and not ET — late West Coast games drift across day boundaries
// otherwise. End dates additionally need a 12h shift back because they're
// stored as "end of sports day PT" = next-day 10:00 UTC = next-day 3 AM PT;
// without the shift, "end of June 19 PT" displays as "Jun 20".

const SHORT = { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }
const LONG = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' }

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

// Same as formatEndDateShort but includes the year — used in the
// settings dialog header "Runs until Jun 19, 2026".
export function formatEndDateLong(isoStr) {
  if (!isoStr) return null
  const shifted = new Date(new Date(isoStr).getTime() - 12 * 60 * 60 * 1000)
  return shifted.toLocaleDateString('en-US', LONG)
}

// Concise date + time for banners like "Drafts Aug 24, 7:00 PM". Time
// renders in the viewer's local zone so members see the moment they'll
// need to be online, not the commissioner's PT clock.
export function formatDraftDateShort(isoStr) {
  if (!isoStr) return null
  const d = new Date(isoStr)
  const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${datePart}, ${timePart}`
}
