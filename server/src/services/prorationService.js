import { supabase } from '../config/supabase.js'

// ---------------------------------------------------------------------------
// WINNER BONUSES FOR MULTI-NIGHT / MULTI-WEEK CONTESTS
// ---------------------------------------------------------------------------
//
// 1st gets `50 + memberCount`, and 2nd and 3rd follow at 40% and 20% of it —
// the same 1 : 0.40 : 0.20 ladder SALARY_CAP_FULL_SEASON_BONUSES uses at every
// league size, so a contest and a fantasy league of the same size pay a
// recognisably similar shape.
//
// The old ladder was six size tiers topping out at 110 and paying NOTHING
// below 1st. It priced an 8-person season-long 3-point contest at 30, versus
// 60 for an 8-team fantasy league — less than half, for a format that asks
// for a pick every night from October to April instead of a lineup once a
// week. 50 + n puts those within two points of each other.
//
// NOTE ON SHAPE: this is deliberately much flatter than the fantasy table,
// which is ~7.5 x n (150 at 20 members). Here 20 members pays 70. Small
// leagues — all of the real ones so far — go up sharply; a hypothetical 41+
// member contest lands slightly below the old 110. If big contests ever
// matter, this is the line to steepen.
const CONTEST_BONUS_RATIOS = { 1: 1, 2: 0.4, 3: 0.2 }

export function contestFullSeasonBonus(rank, memberCount) {
  const ratio = CONTEST_BONUS_RATIOS[rank]
  if (!ratio) return 0
  const n = Math.max(1, memberCount || 1)
  return Math.round((50 + n) * ratio)
}

// ---------------------------------------------------------------------------
// PRORATION
// ---------------------------------------------------------------------------
//
// A two-week contest should not pay what a six-month one pays, so the bonus
// scales by how much of a season the league covers.
//
// The basis is the league's CONFIGURED SPAN — starts_at to ends_at — not the
// nights it has played so far. A league signed up for all 175 nights of an
// NBA season is a full-season league on its opening night, and the stakes it
// advertises on day one are the stakes it should pay in April.
//
// Counting nights-played instead made the number mean "what you would get if
// the league ended this minute", which on day one of Shooters Shoot was
// 1/180 of the bonus — it rendered "+7 for 1st" on a contest that will pay
// 65, and 180 nights of near-full-season play still only ever reached 0.94.
//
// `seasonDays` is the calendar length of a full regular season, so a league
// spanning one divides out to exactly 1.0:
//   NBA  Oct 20 -> Apr 13   ~175 days
//   MLB  Mar 26 -> Sep 28   ~186 days
//   WNBA May 16 -> Sep 11   ~120 days
//   NFL  18 weeks           ~126 days
//
// `table`/`column`/`denominator` are the old nights-played basis, kept as the
// fallback for a league whose dates are missing or implausible — see
// [[season_dates never reaches league creation]], where a stale constant can
// hand a league a one-year ends_at. Without the sanity check, a 365-day span
// would divide to >1, clamp to a full bonus, and pay a six-month prize for
// whatever few nights actually got played.
const PRORATION_BASIS = {
  nba_dfs:          { seasonDays: 175, table: 'nba_dfs_nightly_results',  column: 'game_date', denominator: 180 },
  mlb_dfs:          { seasonDays: 186, table: 'mlb_dfs_nightly_results',  column: 'game_date', denominator: 180 },
  wnba_dfs:         { seasonDays: 120, table: 'wnba_dfs_nightly_results', column: 'game_date', denominator: 120 },
  hr_derby:         { seasonDays: 186, table: 'hr_derby_picks',           column: 'game_date', denominator: 180 },
  strikeouts:       { seasonDays: 186, table: 'strikeouts_picks',         column: 'game_date', denominator: 180 },
  three_point:      { seasonDays: 175, table: 'three_point_picks',        column: 'game_date', denominator: 180 },
  wnba_three_point: { seasonDays: 120, table: 'wnba_three_point_picks',   column: 'game_date', denominator: 120 },
  sacks:            { seasonDays: 126, table: 'sacks_picks',              column: 'week',      denominator: 18 },
  ints:             { seasonDays: 126, table: 'ints_picks',               column: 'week',      denominator: 18 },
  tackles:          { seasonDays: 126, table: 'tackles_picks',            column: 'week',      denominator: 18 },
  receptions:       { seasonDays: 126, table: 'receptions_picks',         column: 'week',      denominator: 18 },
  td_pass:          { seasonDays: 126, table: 'td_pass_picks',            column: 'week',      denominator: 18 },
}

// Dates beyond this multiple of a season are treated as data, not intent.
const IMPLAUSIBLE_SPAN_MULTIPLE = 1.5

// Cover this much of a season and you ARE a full-season league, paid in full.
//
// Without the snap, "full season" almost never lands on exactly 1.0: the
// seasonDays figures are round numbers, a league's starts_at and ends_at
// carry times of day, and a commissioner opening a week after tip-off still
// means to run the whole thing. Shooters Shoot spans 175 days against a
// seasonDays of 175 and still divided out to 0.9977, which pays the same 58
// after rounding but renders a "scaled to 100%" footnote on a league that
// isn't scaled at all.
const FULL_SEASON_SNAP = 0.95

function configuredSpanDays(league) {
  if (!league?.starts_at || !league?.ends_at) return null
  const start = new Date(league.starts_at).getTime()
  const end = new Date(league.ends_at).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return (end - start) / 86400000
}

async function playedFraction(league, basis) {
  const { data, error } = await supabase
    .from(basis.table)
    .select(basis.column)
    .eq('league_id', league.id)

  // A query failure must not silently read as "played nothing" — that would
  // render a +0 bonus on a healthy league. Fall back to no proration.
  if (error) return null

  const played = new Set((data || []).map((r) => r[basis.column])).size
  return Math.min(1, played / basis.denominator)
}

// Returns the fraction of a full season this league covers, or null for
// formats that don't prorate (bracket, survivor, pickem, traditional fantasy).
// Null means "no proration" — the caller should leave its own math alone
// rather than treating it as zero.
export async function getProrationFraction(league) {
  const basis = PRORATION_BASIS[league?.format]
  if (!basis) return null

  const span = configuredSpanDays(league)
  if (span !== null && span <= basis.seasonDays * IMPLAUSIBLE_SPAN_MULTIPLE) {
    const raw = span / basis.seasonDays
    return raw >= FULL_SEASON_SNAP ? 1 : raw
  }

  return playedFraction(league, basis)
}

/**
 * The bonus function completeLeagues.js hands to awardPositionBasedPoints for
 * a contest format: the full-season 1st/2nd/3rd ladder, prorated.
 *
 * This exists because twelve award sites used to compute the identical thing
 * inline — same query, same Math.min, same `rank === 1` ladder — which is
 * twelve places for a formula change to be applied eleven times.
 */
export async function getContestBonusFn(league) {
  const fraction = await getProrationFraction(league)
  const scale = fraction === null ? 1 : fraction
  return (rank, n) => Math.round(contestFullSeasonBonus(rank, n) * scale)
}
