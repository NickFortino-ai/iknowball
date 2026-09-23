// Shared formatters for league dates — the CANONICAL date/time RENDERING
// helper for the client. Complements lib/sportsDay.js (canonical anchor
// math): sportsDay computes and compares, leagueDate renders.
//
// All league displays should anchor to PT (the canonical sports day
// timezone), not the user's local zone and not ET — late West Coast games
// drift across day boundaries otherwise. End dates additionally need a
// 12h shift back because they're stored as "end of sports day PT" =
// next-day 10:00 UTC = next-day 3 AM PT; without the shift, "end of June
// 19 PT" displays as "Jun 20".
//
// Exception: draft start/game start times render in viewer-local
// (formatDraftDateShort) — the user needs to know when the moment is on
// their own clock, not the commissioner's. All other league dates
// anchor PT so mid-month boundaries are TZ-invariant across the roster.
//
// See feedback_no_utc_date_math and project_timezone_debt_audit for
// the 2026-07-09 audit that hardened this convention.

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

/**
 * What a league's "runs until" label says.
 *
 * Lived as four copies — LeagueCard, LeagueInfoModal, OpenLeaguesSection and
 * JoinLeaguePage — which is the shape that has already cost this codebase
 * twice (the four GameStatusBadge copies, the two injury badges). They had
 * not diverged semantically yet; adding the bracket case to four files was
 * how that would have started.
 *
 * Returns null when there is nothing meaningful to say.
 */
export function formatRunsUntil(league) {
  if (league.format === 'survivor') return 'Last one standing'
  if (league.format === 'squares') return 'End of game'
  // A bracket runs until someone wins it. Its ends_at is only ever an
  // estimate — a best-of-seven can finish four days apart depending on how
  // the series goes — so showing a date implies precision we don't have.
  if (league.format === 'bracket') return 'Through the playoffs'
  if (league.duration === 'full_season') return 'End of season'
  if (league.duration === 'playoffs_only') return 'End of playoffs'
  if (league.ends_at) return formatEndDateShort(league.ends_at)
  return null
}

/**
 * The whole phrase, so every surface words it identically.
 *
 * Brackets deliberately skip the start–end range: "Runs Sep 30 – Through the
 * playoffs" reads as a mistake. They get one clause whether or not the league
 * has started.
 */
export function formatLeagueRuns(league) {
  const end = formatRunsUntil(league)
  if (league.format === 'bracket') return 'Runs through the playoffs'
  const start = formatStartDateShort(league.starts_at)
  const notStartedYet = league.starts_at && new Date(league.starts_at) > new Date()
  if (notStartedYet && start && end) return `Runs ${start} – ${end}`
  if (notStartedYet && start) return `Starts ${start}`
  if (end) return `Runs until ${end}`
  return null
}
