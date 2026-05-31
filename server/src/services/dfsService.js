import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { calculateFantasyPoints } from './sleeperService.js'

const DFS_SLOTS = ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'WR3', 'TE', 'FLEX', 'DEF']
const FLEX_ELIGIBLE = ['RB', 'WR', 'TE']

/**
 * Get player pool with salaries for a given week.
 */
export async function getPlayerPool(week, season, position = null) {
  let query = supabase
    .from('dfs_weekly_salaries')
    .select('salary, nfl_players(id, full_name, position, team, headshot_url, injury_status)')
    .eq('nfl_week', week)
    .eq('season', season)
    .order('salary', { ascending: false })

  if (position) {
    if (position === 'FLEX') {
      query = query.in('nfl_players.position', FLEX_ELIGIBLE)
    } else {
      query = query.eq('nfl_players.position', position)
    }
  }

  // Cap high enough to include all 32 DEFs (priced $2,500-$5,000,
  // sorted last by salary DESC) alongside the ~500-player offensive pool.
  const { data, error } = await query.limit(800)
  if (error) throw error

  return (data || []).map((d) => ({
    ...d.nfl_players,
    salary: d.salary,
  }))
}

/**
 * Get user's DFS roster for a specific week.
 */
export async function getDFSRoster(leagueId, userId, week, season) {
  const { data: roster } = await supabase
    .from('dfs_rosters')
    .select('*, dfs_roster_slots(*, nfl_players(id, full_name, position, team, headshot_url))')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('nfl_week', week)
    .eq('season', season)
    .maybeSingle()

  return roster
}

/**
 * Save/update a DFS roster.
 */
export async function saveDFSRoster(leagueId, userId, week, season, slots, salaryCap) {
  // Validate slot count and types
  if (!slots || slots.length === 0) {
    const err = new Error('Roster cannot be empty')
    err.status = 400
    throw err
  }

  for (const slot of slots) {
    if (!DFS_SLOTS.includes(slot.roster_slot)) {
      const err = new Error(`Invalid roster slot: ${slot.roster_slot}`)
      err.status = 400
      throw err
    }
  }

  // Check for duplicate slots
  const slotNames = slots.map((s) => s.roster_slot)
  if (new Set(slotNames).size !== slotNames.length) {
    const err = new Error('Duplicate roster slots')
    err.status = 400
    throw err
  }

  // Validate FLEX position eligibility
  const flexSlot = slots.find((s) => s.roster_slot === 'FLEX')
  if (flexSlot) {
    const { data: flexPlayer } = await supabase
      .from('nfl_players')
      .select('position')
      .eq('id', flexSlot.player_id)
      .single()

    if (flexPlayer && !FLEX_ELIGIBLE.includes(flexPlayer.position)) {
      const err = new Error('FLEX slot must be RB, WR, or TE')
      err.status = 400
      throw err
    }
  }

  // Calculate total salary
  const totalSalary = slots.reduce((sum, s) => sum + s.salary, 0)
  if (totalSalary > salaryCap) {
    const err = new Error(`Roster exceeds salary cap ($${totalSalary.toLocaleString()} > $${salaryCap.toLocaleString()})`)
    err.status = 400
    throw err
  }

  // Upsert roster. submitted_at is intentionally cleared on every save so
  // any edit after Submit puts the lineup back into "needs resubmit" state.
  const { data: roster, error: rosterError } = await supabase
    .from('dfs_rosters')
    .upsert({
      league_id: leagueId,
      user_id: userId,
      nfl_week: week,
      season,
      total_salary: totalSalary,
      submitted_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'league_id,user_id,nfl_week,season' })
    .select()
    .single()

  if (rosterError) throw rosterError

  // Delete existing unlocked slots and re-insert
  await supabase
    .from('dfs_roster_slots')
    .delete()
    .eq('roster_id', roster.id)
    .eq('is_locked', false)

  // Insert new slots (only unlocked ones)
  const slotRows = slots
    .filter((s) => !s.is_locked)
    .map((s) => ({
      roster_id: roster.id,
      player_id: s.player_id,
      roster_slot: s.roster_slot,
      salary: s.salary,
    }))

  if (slotRows.length > 0) {
    const { error: slotsError } = await supabase
      .from('dfs_roster_slots')
      .upsert(slotRows, { onConflict: 'roster_id,roster_slot' })

    if (slotsError) throw slotsError
  }

  return getDFSRoster(leagueId, userId, week, season)
}

/**
 * Mark the current week's NFL salary cap roster as explicitly submitted.
 * Requires a full 9/9 lineup. The next save() call will clear submitted_at.
 */
export async function submitDFSRoster(leagueId, userId, week, season) {
  const { data: roster } = await supabase
    .from('dfs_rosters')
    .select('id, dfs_roster_slots(roster_slot)')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('nfl_week', week)
    .eq('season', season)
    .maybeSingle()

  if (!roster) {
    const err = new Error('No roster to submit — add players first')
    err.status = 400
    throw err
  }
  if ((roster.dfs_roster_slots || []).length < DFS_SLOTS.length) {
    const err = new Error(`Lineup incomplete — ${(roster.dfs_roster_slots || []).length}/${DFS_SLOTS.length} slots filled`)
    err.status = 400
    throw err
  }

  const submittedAt = new Date().toISOString()
  const { error } = await supabase
    .from('dfs_rosters')
    .update({ submitted_at: submittedAt, updated_at: submittedAt })
    .eq('id', roster.id)
  if (error) throw error
  return { submitted_at: submittedAt }
}

/**
 * Get DFS standings for a league.
 */
export async function getDFSStandings(leagueId) {
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('champion_metric, season')
    .eq('league_id', leagueId)
    .single()

  const { data: results, error } = await supabase
    .from('dfs_weekly_results')
    .select('user_id, nfl_week, total_points, week_rank, is_week_winner, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)
    .order('nfl_week', { ascending: true })

  if (error) throw error

  // Aggregate by user
  const userMap = {}
  for (const r of (results || [])) {
    if (!userMap[r.user_id]) {
      userMap[r.user_id] = {
        user: r.users,
        totalPoints: 0,
        weeklyWins: 0,
        weeks: [],
      }
    }
    userMap[r.user_id].totalPoints += Number(r.total_points)
    if (r.is_week_winner) userMap[r.user_id].weeklyWins++
    userMap[r.user_id].weeks.push({
      week: r.nfl_week,
      points: r.total_points,
      rank: r.week_rank,
      isWinner: r.is_week_winner,
    })
  }

  const standings = Object.values(userMap)

  // Sort by champion metric
  if (settings?.champion_metric === 'most_wins') {
    standings.sort((a, b) => b.weeklyWins - a.weeklyWins || b.totalPoints - a.totalPoints)
  } else {
    standings.sort((a, b) => b.totalPoints - a.totalPoints)
  }

  return {
    standings: standings.map((s, i) => ({ ...s, rank: i + 1 })),
    championMetric: settings?.champion_metric || 'total_points',
  }
}

/**
 * Get weekly scores for all members in a league.
 */
export async function getWeeklyResults(leagueId, week) {
  const { data, error } = await supabase
    .from('dfs_weekly_results')
    .select('*, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)
    .eq('nfl_week', week)
    .order('week_rank', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Score every NFL salary cap (DFS) league for a given week+season.
 * Builds dfs_weekly_results rows with total_points, week_rank, is_week_winner.
 *
 * Should be called after nfl_player_stats is up to date for the week
 * (e.g. immediately after syncWeeklyStats). Uses the league's
 * fantasy_settings.scoring_format for the points field.
 */
export async function scoreNflDfsWeek(week, season) {
  // 1. All rosters for this week+season across every league
  const { data: rosters } = await supabase
    .from('dfs_rosters')
    .select('id, league_id, user_id, dfs_roster_slots(player_id)')
    .eq('nfl_week', week)
    .eq('season', season)

  if (!rosters?.length) {
    logger.info({ week, season }, 'NFL DFS scoring: no rosters for week')
    return { scored: 0 }
  }

  // 2. Per-league scoring rules (custom JSONB takes priority over preset)
  const leagueIds = [...new Set(rosters.map((r) => r.league_id))]
  const { data: settingsRows } = await supabase
    .from('fantasy_settings')
    .select('league_id, scoring_format, scoring_rules')
    .in('league_id', leagueIds)

  const { applyScoringRules, buildScoringRulesFromPreset } = await import('./fantasyService.js')
  const rulesByLeague = {}
  for (const s of settingsRows || []) {
    rulesByLeague[s.league_id] = s.scoring_rules || buildScoringRulesFromPreset(s.scoring_format)
  }

  // 3. All player stats for the rostered player ids this week — pull every
  // raw stat column so we can apply custom rules per league
  const allPlayerIds = [...new Set(
    rosters.flatMap((r) => (r.dfs_roster_slots || []).map((s) => s.player_id)).filter(Boolean)
  )]

  let statsMap = {}
  if (allPlayerIds.length) {
    const { data: stats } = await supabase
      .from('nfl_player_stats')
      .select('player_id, pass_yd, pass_td, pass_int, rush_yd, rush_td, rec, rec_yd, rec_td, fum_lost, two_pt, fgm_0_39, fgm_40_49, fgm_50_plus, xpm, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed')
      .eq('week', week)
      .eq('season', season)
      .in('player_id', allPlayerIds)

    for (const st of stats || []) statsMap[st.player_id] = st
  }

  // 4. Aggregate per league using each league's own rules
  const leagueRosters = {}
  for (const r of rosters) {
    if (!leagueRosters[r.league_id]) leagueRosters[r.league_id] = []
    const rules = rulesByLeague[r.league_id]
    const total = (r.dfs_roster_slots || []).reduce((sum, slot) => {
      const st = statsMap[slot.player_id]
      return sum + applyScoringRules(st, rules)
    }, 0)
    leagueRosters[r.league_id].push({ userId: r.user_id, totalPoints: total })
  }

  // 5. Upsert dfs_weekly_results rows per league
  let scored = 0
  for (const [leagueId, entries] of Object.entries(leagueRosters)) {
    entries.sort((a, b) => b.totalPoints - a.totalPoints)
    const results = entries.map((e, i) => ({
      league_id: leagueId,
      user_id: e.userId,
      nfl_week: week,
      season,
      total_points: e.totalPoints,
      week_rank: i + 1,
      is_week_winner: i === 0,
    }))

    const { error } = await supabase
      .from('dfs_weekly_results')
      .upsert(results, { onConflict: 'league_id,user_id,nfl_week,season' })

    if (error) {
      logger.error({ error, leagueId, week, season }, 'Failed to upsert NFL DFS weekly results')
    } else {
      scored += results.length
    }
  }

  logger.info({ week, season, scored, leagues: leagueIds.length }, 'NFL DFS week scoring complete')
  return { scored }
}

/**
 * Auto-generate salaries from player projections/rankings.
 */
// NFL DFS pricing: Value-Based Drafting (VBD) on Sleeper weekly projections.
//
// For each position, we rank players who Sleeper projects to play this week,
// pick the player at REPLACEMENT_RANK[pos] as the "replacement-level" baseline,
// and price everyone else by points-above-replacement. The position-specific
// floors/caps come from FanDuel calibration. Bye-week / inactive / unprojected
// players price at floor — they're not part of this week's slate.
//
// Why this replaces the old per-position FPPG curves: scarcity is what makes
// elite TEs valuable, and scarcity changes weekly (bye distribution, injuries).
// Sleeper's projection bakes in matchup, usage, opponent strength, and snap
// share — there's no upside left to model on top of it. This is intentionally
// simpler than the prior weighted-gamelog + staleness + starter-signal pipeline.
const REPLACEMENT_RANK = { QB: 30, RB: 30, WR: 60, TE: 25, K: 20, DEF: 20 }
const POS_FLOOR = { QB: 5500, RB: 4000, WR: 4000, TE: 3500, K: 4000, DEF: 3500 }
const POS_CAP = { QB: 10000, RB: 9600, WR: 9900, TE: 8500, K: 5800, DEF: 5500 }
// Per-position $ added per fantasy point above replacement. QB lower because
// QB projection spread is tight (8-10 pt VBD for elites) and a flat slope
// would send every starter to the cap. TEs steepest because the elite tier
// is thinnest — TE12 vs TE25 is a real chasm.
const SALARY_PER_VBD = { QB: 400, RB: 650, WR: 650, TE: 700, K: 650, DEF: 650 }

export async function generateSalaries(week, season) {
  logger.info({ week, season }, 'Generating DFS salaries')

  // Pull every player we might price. Filter on team IS NOT NULL so retired
  // players (their team is nulled by the Sleeper sync) drop out; keep IR/PUP
  // so the slate surfaces them with their injury_status flagged.
  const { data: players, error } = await supabase
    .from('nfl_players')
    .select('id, position, team, injury_status, depth_chart_order')
    .not('team', 'is', null)
    .in('position', ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])

  if (error) throw error

  // Sleeper weekly projections for THIS (season, week). This is the entire
  // pricing signal — no gamelog blend, no staleness discount, no defensive
  // multiplier. Sleeper already bakes in matchup, opponent, usage, snap share.
  const { data: projectionRows } = await supabase
    .from('nfl_player_projections')
    .select('player_id, pts_half_ppr')
    .eq('season', season)
    .eq('week', week)
  const projectionMap = new Map(
    (projectionRows || []).map((r) => [r.player_id, Number(r.pts_half_ppr) || 0])
  )
  logger.info(
    { projections_loaded: projectionMap.size, week, season },
    'Loaded Sleeper weekly projections for pricing'
  )

  // Compute replacement-level projection per position. Only players Sleeper
  // projects to actually play this week (projection > 0) enter the ranking
  // — bye-week and inactive players would otherwise drag the baseline down.
  const projByPos = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] }
  for (const p of players || []) {
    const proj = projectionMap.get(p.id)
    if (proj != null && proj > 0 && projByPos[p.position]) {
      projByPos[p.position].push(proj)
    }
  }
  const replacementByPos = {}
  for (const pos of Object.keys(REPLACEMENT_RANK)) {
    const sorted = (projByPos[pos] || []).slice().sort((a, b) => b - a)
    const rank = REPLACEMENT_RANK[pos]
    replacementByPos[pos] = sorted.length >= rank ? sorted[rank - 1] : (sorted[sorted.length - 1] || 0)
  }
  logger.info({ replacementByPos, week, season }, 'NFL VBD replacement levels')

  const salaries = []
  for (const player of players || []) {
    const pos = player.position
    if (!REPLACEMENT_RANK[pos]) continue // unknown position, skip

    const proj = projectionMap.get(player.id) || 0
    const replacement = replacementByPos[pos] || 0
    const vbd = Math.max(0, proj - replacement)

    let salary = POS_FLOOR[pos] + vbd * (SALARY_PER_VBD[pos] || 500)
    salary = Math.round(salary / 100) * 100
    salary = Math.max(POS_FLOOR[pos], Math.min(POS_CAP[pos], salary))

    // QB depth-chart override. Sleeper occasionally projects backup QBs
    // generously (4-5 pts) which would put a third-stringer near the QB
    // floor of $5,500. depth_chart_order >= 2 means Sleeper has flagged
    // them as behind another QB; force a clearly-lower price.
    if (pos === 'QB' && player.depth_chart_order && player.depth_chart_order >= 2) {
      salary = player.depth_chart_order === 2 ? 5000 : 4000
    }

    salaries.push({
      player_id: player.id,
      nfl_week: week,
      season,
      salary,
      algorithm_salary: salary,
    })
  }

  // Honor manual overrides — fetch existing rows that admins have edited
  // and preserve their salary value while still refreshing algorithm_salary.
  const { data: manualRows } = await supabase
    .from('dfs_weekly_salaries')
    .select('player_id, salary')
    .eq('season', season)
    .eq('nfl_week', week)
    .eq('manually_set', true)

  if (manualRows?.length) {
    const manualMap = new Map(manualRows.map((r) => [r.player_id, r.salary]))
    let preserved = 0
    for (const s of salaries) {
      if (manualMap.has(s.player_id)) {
        s.salary = manualMap.get(s.player_id)
        preserved++
      }
    }
    logger.info({ preserved, manually_set: manualRows.length }, 'Preserved admin manual salary overrides')
  }

  // Batch upsert. updated_at is set by DB trigger / column default on update.
  const CHUNK = 500
  let upserted = 0
  for (let i = 0; i < salaries.length; i += CHUNK) {
    const chunk = salaries.slice(i, i + CHUNK).map((s) => ({ ...s, updated_at: new Date().toISOString() }))
    const { error: upsertError } = await supabase
      .from('dfs_weekly_salaries')
      .upsert(chunk, { onConflict: 'player_id,nfl_week,season' })

    if (upsertError) {
      logger.error({ upsertError, offset: i }, 'Failed to upsert salary chunk')
    } else {
      upserted += chunk.length
    }
  }

  logger.info({ upserted, total: salaries.length, week, season }, 'DFS salary generation complete')
  return { upserted, total: salaries.length, manual_preserved: manualRows?.length || 0 }
}

/**
 * Admin: set/update individual player salaries.
 */
export async function setSalaries(salaries) {
  const { error } = await supabase
    .from('dfs_weekly_salaries')
    .upsert(salaries, { onConflict: 'player_id,nfl_week,season' })

  if (error) throw error
  return { updated: salaries.length }
}
