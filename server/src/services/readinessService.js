import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

/**
 * Compute a per-league readiness state for a user, used by the My Leagues
 * card list to show a tiny green/yellow/red corner indicator at-a-glance.
 *
 * Possible values:
 *   - 'ready'     → user has done what's needed for the next contest in this
 *                   league. Green clip.
 *   - 'attention' → user has set their lineup/picks but something needs eyes
 *                   (e.g. an injured starter). Yellow clip.
 *   - 'action'    → user has not yet completed their pick/lineup for the
 *                   upcoming contest. Red clip.
 *   - null        → no per-contest action applies (squares, bracket, etc).
 *
 * Implementation philosophy: ship a useful MVP. Formats with the highest
 * action-frequency (DFS, daily survivor, hr_derby, td_pass) get full
 * computation. Lower-frequency formats default to 'ready' so the indicator
 * never lies (it would be worse to show green when an action is needed).
 *
 * Returns a Map<leagueId, state>.
 */
export async function computeLeagueReadiness(userId, leagues) {
  const result = new Map()
  if (!leagues?.length) return result

  // Skip non-active leagues entirely
  const activeLeagues = leagues.filter((l) => l.status === 'active')
  if (!activeLeagues.length) return result

  // Group by format for batched queries
  const byFormat = {}
  for (const l of activeLeagues) {
    if (!byFormat[l.format]) byFormat[l.format] = []
    byFormat[l.format].push(l)
  }

  // Today (Eastern) — used for DFS / hr_derby
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  try {
    if (byFormat.nba_dfs?.length) {
      await computeDfsReadiness(byFormat.nba_dfs, userId, todayET, 'nba_dfs_rosters', 'nba_dfs_roster_slots', 'nba_dfs_salaries', result)
    }
    if (byFormat.mlb_dfs?.length) {
      await computeDfsReadiness(byFormat.mlb_dfs, userId, todayET, 'mlb_dfs_rosters', 'mlb_dfs_roster_slots', 'mlb_dfs_salaries', result)
    }
    if (byFormat.survivor?.length) {
      await computeSurvivorReadiness(byFormat.survivor, userId, result)
    }
    if (byFormat.hr_derby?.length) {
      await computeHrDerbyReadiness(byFormat.hr_derby, userId, todayET, result)
    }
    if (byFormat.td_pass?.length) {
      await computeTdPassReadiness(byFormat.td_pass, userId, result)
    }
  } catch (err) {
    logger.error({ err }, 'Failed to compute league readiness')
  }

  // Default everything else to 'ready' (no per-contest action expected)
  for (const l of activeLeagues) {
    if (!result.has(l.id)) result.set(l.id, 'ready')
  }
  return result
}

/**
 * DFS readiness: a roster exists for tonight AND none of its players have an
 * injury status of 'Out'. Players with 'Questionable' / 'Day-To-Day' flag the
 * lineup as 'attention'.
 */
async function computeDfsReadiness(leagues, userId, todayET, rosterTable, slotTable, salaryTable, result) {
  const leagueIds = leagues.map((l) => l.id)
  const { data: rosters } = await supabase
    .from(rosterTable)
    .select(`id, league_id, ${slotTable}(espn_player_id)`)
    .in('league_id', leagueIds)
    .eq('user_id', userId)
    .eq('game_date', todayET)

  const rosterByLeague = {}
  for (const r of rosters || []) {
    rosterByLeague[r.league_id] = r
  }

  // Pull injury statuses for every player on every roster in one query
  const allPlayerIds = new Set()
  for (const r of rosters || []) {
    for (const slot of r[slotTable] || []) {
      if (slot.espn_player_id) allPlayerIds.add(slot.espn_player_id)
    }
  }
  let injuryByPlayer = {}
  if (allPlayerIds.size > 0) {
    const { data: salaries } = await supabase
      .from(salaryTable)
      .select('espn_player_id, injury_status')
      .eq('game_date', todayET)
      .in('espn_player_id', [...allPlayerIds])
    for (const s of salaries || []) {
      if (s.injury_status) injuryByPlayer[s.espn_player_id] = s.injury_status
    }
  }

  for (const l of leagues) {
    const r = rosterByLeague[l.id]
    if (!r) {
      result.set(l.id, 'action')
      continue
    }
    let hasOut = false
    let hasFlag = false
    for (const slot of r[slotTable] || []) {
      const status = injuryByPlayer[slot.espn_player_id]
      if (status === 'Out') hasOut = true
      else if (status && status !== 'Probable') hasFlag = true
    }
    result.set(l.id, hasOut || hasFlag ? 'attention' : 'ready')
  }
}

/**
 * Survivor readiness: ready if the user is eliminated (no action possible),
 * or if they have a pick for the current league_week (status pending/locked/
 * survived). Otherwise → action.
 */
async function computeSurvivorReadiness(leagues, userId, result) {
  const leagueIds = leagues.map((l) => l.id)
  const nowIso = new Date().toISOString()

  // Find each league's current week (the active one, or the next upcoming)
  const { data: weeks } = await supabase
    .from('league_weeks')
    .select('id, league_id, status, starts_at, ends_at')
    .in('league_id', leagueIds)
    .neq('status', 'completed')
    .order('starts_at', { ascending: true })

  // First non-completed week per league (earliest)
  const currentWeekByLeague = {}
  for (const w of weeks || []) {
    if (!currentWeekByLeague[w.league_id]) currentWeekByLeague[w.league_id] = w
  }

  // Pull picks for those week ids
  const weekIds = Object.values(currentWeekByLeague).map((w) => w.id)
  const { data: picks } = weekIds.length
    ? await supabase
        .from('survivor_picks')
        .select('league_id, league_week_id, status')
        .in('league_week_id', weekIds)
        .eq('user_id', userId)
    : { data: [] }
  const pickByLeague = {}
  for (const p of picks || []) pickByLeague[p.league_id] = p

  // Also check eliminated members — if user is eliminated, no action needed
  const { data: eliminations } = await supabase
    .from('league_members')
    .select('league_id, lives_remaining')
    .in('league_id', leagueIds)
    .eq('user_id', userId)
  const eliminatedSet = new Set(
    (eliminations || []).filter((m) => m.lives_remaining === 0).map((m) => m.league_id)
  )

  for (const l of leagues) {
    if (eliminatedSet.has(l.id)) {
      result.set(l.id, 'ready')
      continue
    }
    const week = currentWeekByLeague[l.id]
    if (!week) {
      result.set(l.id, 'ready') // no current week — nothing to do
      continue
    }
    const pick = pickByLeague[l.id]
    result.set(l.id, pick ? 'ready' : 'action')
  }
}

async function computeHrDerbyReadiness(leagues, userId, todayET, result) {
  const leagueIds = leagues.map((l) => l.id)
  const { data: picks } = await supabase
    .from('hr_derby_picks')
    .select('league_id')
    .in('league_id', leagueIds)
    .eq('user_id', userId)
    .eq('game_date', todayET)
  const countByLeague = {}
  for (const p of picks || []) {
    countByLeague[p.league_id] = (countByLeague[p.league_id] || 0) + 1
  }
  for (const l of leagues) {
    // HR Derby allows up to 3 picks per day. Any pick at all = ready.
    result.set(l.id, (countByLeague[l.id] || 0) > 0 ? 'ready' : 'action')
  }
}

async function computeTdPassReadiness(leagues, userId, result) {
  const { getCurrentNflWeek } = await import('./tdPassService.js')
  const { week } = await getCurrentNflWeek()
  const leagueIds = leagues.map((l) => l.id)
  const { data: picks } = await supabase
    .from('td_pass_picks')
    .select('league_id')
    .in('league_id', leagueIds)
    .eq('user_id', userId)
    .eq('week', week)
  const has = new Set((picks || []).map((p) => p.league_id))
  for (const l of leagues) {
    result.set(l.id, has.has(l.id) ? 'ready' : 'action')
  }
}
