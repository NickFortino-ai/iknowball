import { supabase } from '../config/supabase.js'

// When a salary cap fantasy league actually begins.
//
// `leagues.starts_at` is synthetic for these leagues — createLeague
// defaults it to `new Date()`, so it records when the commissioner
// clicked create, not when play starts. "Salary and Peanut Butter" was
// created 2026-08-03 for a season kicking off 2026-09-09.
//
// The real signal is the first kickoff of the league's target NFL week:
// `single_week` for single-week leagues, Week 1 for full-season. Three
// call sites derived that independently before this file existed — the
// Open Leagues payload, getLeagueDetails, and the activation gate in
// completeLeagues — and a fourth consumer forgetting to compensate is
// exactly how the pre-start info box silently never rendered.
//
// game_date is anchored to 10:00 UTC (~6 AM ET) so a Thursday-night
// opener gates on that Thursday rather than the Monday of the week. All
// callers must share this anchor or they'll disagree about whether a
// league has begun.
export const SALARY_CAP_START_ANCHOR_UTC = '10:00:00Z'

function anchor(gameDate) {
  return gameDate ? new Date(`${gameDate}T${SALARY_CAP_START_ANCHOR_UTC}`).toISOString() : null
}

/**
 * First kickoff for one (season, week), anchored. Null when the schedule
 * row is missing — callers fall back to the stored starts_at rather than
 * treating a schedule gap as "starts now".
 */
export async function salaryCapWeekStart(season, week) {
  if (!season) return null
  const { data, error } = await supabase
    .from('nfl_schedule')
    .select('game_date')
    .eq('season', season)
    .eq('week', week || 1)
    .order('game_date', { ascending: true })
    .limit(1)
  if (error) return null
  return anchor(data?.[0]?.game_date)
}

/**
 * Batched variant for lists. Takes ["2026:1", "2026:5"] style pairs and
 * returns Map<pair, iso>. One query per distinct pair, so a page full of
 * salary cap leagues sharing Week 1 costs a single lookup.
 */
export async function salaryCapStartsForPairs(pairs) {
  const out = new Map()
  await Promise.all([...new Set(pairs)].map(async (pair) => {
    const [season, week] = String(pair).split(':').map(Number)
    const iso = await salaryCapWeekStart(season, week)
    if (iso) out.set(pair, iso)
  }))
  return out
}

/**
 * Effective start for a single league row. Returns null for anything
 * that isn't salary cap fantasy, so callers can `?? league.starts_at`.
 */
export async function salaryCapEffectiveStart(league) {
  if (league?.format !== 'fantasy' || !league?.id) return null
  const { data: fs } = await supabase
    .from('fantasy_settings')
    .select('format, season, single_week')
    .eq('league_id', league.id)
    .maybeSingle()
  if (fs?.format !== 'salary_cap') return null
  return salaryCapWeekStart(fs.season, fs.single_week || 1)
}
