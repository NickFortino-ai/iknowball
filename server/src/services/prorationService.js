import { supabase } from '../config/supabase.js'

// Winner bonuses for multi-night / multi-week contests are prorated by how
// much of a season the league actually covered. The SERVER pays on nights (or
// NFL weeks) that were actually played; the settings UI used to project from
// the calendar span between starts_at and ends_at.
//
// Those two disagree whenever a league spans dates it doesn't play on — and
// days >= nights always, so the projection could only ever overpromise. It
// showed "the winner earns +24" on a league that could only ever pay 5.
//
// One basis, computed here, and handed to the client so it renders the number
// the payout will actually use.
//
// NOTE: completeLeagues.js still computes this inline at each award site.
// These MUST agree. Migrating those call sites to this helper is the obvious
// follow-up; it was left alone deliberately rather than refactoring the
// scoring job in the same change that fixes a display.
const PRORATION_BASIS = {
  nba_dfs:          { table: 'nba_dfs_nightly_results',  column: 'game_date', denominator: 180 },
  mlb_dfs:          { table: 'mlb_dfs_nightly_results',  column: 'game_date', denominator: 180 },
  wnba_dfs:         { table: 'wnba_dfs_nightly_results', column: 'game_date', denominator: 120 },
  hr_derby:         { table: 'hr_derby_picks',           column: 'game_date', denominator: 180 },
  strikeouts:       { table: 'strikeouts_picks',         column: 'game_date', denominator: 180 },
  three_point:      { table: 'three_point_picks',        column: 'game_date', denominator: 180 },
  wnba_three_point: { table: 'wnba_three_point_picks',   column: 'game_date', denominator: 120 },
  sacks:            { table: 'sacks_picks',              column: 'week',      denominator: 18 },
  ints:             { table: 'ints_picks',               column: 'week',      denominator: 18 },
  tackles:          { table: 'tackles_picks',            column: 'week',      denominator: 18 },
  receptions:       { table: 'receptions_picks',         column: 'week',      denominator: 18 },
  td_pass:          { table: 'td_pass_picks',            column: 'week',      denominator: 18 },
}

// Returns the fraction of a full season this league has played, or null for
// formats that don't prorate (bracket, survivor, pickem, traditional fantasy).
// Null means "no proration" — the caller should leave its own math alone
// rather than treating it as zero.
export async function getProrationFraction(league) {
  const basis = PRORATION_BASIS[league?.format]
  if (!basis) return null

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
