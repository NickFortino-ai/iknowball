import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

/**
 * Compute a per-league readiness state for a user, used by the My Leagues
 * card list to show a tiny green/yellow/red corner indicator at-a-glance.
 *
 * Each entry is { state, detail } where state is one of:
 *   - 'ready'     → user has done what's needed. Green clip.
 *   - 'attention' → set but something needs eyes (e.g. injured starter).
 *                   Yellow clip.
 *   - 'action'    → user has not yet completed their pick/lineup. Red clip.
 *   - null        → no per-contest action applies (squares, bracket, etc).
 * `detail` is a short human-readable message used as a hover popover on
 * the card.
 *
 * Returns a Map<leagueId, { state, detail }>.
 */
function set(result, leagueId, state, detail) {
  result.set(leagueId, { state, detail })
}
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
    if (byFormat.fantasy?.length) {
      await computeFantasyReadiness(byFormat.fantasy, userId, result)
    }
    if (byFormat.pickem?.length) {
      await computePickemReadiness(byFormat.pickem, userId, result)
    }
  } catch (err) {
    logger.error({ err }, 'Failed to compute league readiness')
  }

  // Default everything else to 'ready' (no per-contest action expected)
  for (const l of activeLeagues) {
    if (!result.has(l.id)) set(result, l.id, 'ready', 'Ready for the next contest')
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
      set(result, l.id, 'action', "You haven't set tonight's lineup")
      continue
    }
    const flagged = []
    for (const slot of r[slotTable] || []) {
      const status = injuryByPlayer[slot.espn_player_id]
      if (status === 'Out' || (status && status !== 'Probable')) {
        flagged.push(status)
      }
    }
    if (flagged.length === 0) {
      set(result, l.id, 'ready', 'Lineup set')
    } else {
      const hasOut = flagged.includes('Out')
      const summary = flagged.length === 1
        ? `1 ${hasOut ? 'Out' : flagged[0]} player on your lineup`
        : `${flagged.length} flagged players on your lineup`
      set(result, l.id, 'attention', summary)
    }
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
      set(result, l.id, 'ready', "You're eliminated — no action needed")
      continue
    }
    const week = currentWeekByLeague[l.id]
    if (!week) {
      set(result, l.id, 'ready', 'No active period')
      continue
    }
    const pick = pickByLeague[l.id]
    if (pick) set(result, l.id, 'ready', 'Survivor pick submitted')
    else set(result, l.id, 'action', "You haven't made this period's pick")
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
    const n = countByLeague[l.id] || 0
    if (n > 0) set(result, l.id, 'ready', `${n}/3 hitter${n === 1 ? '' : 's'} picked for today`)
    else set(result, l.id, 'action', "You haven't picked today's hitters")
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
    if (has.has(l.id)) set(result, l.id, 'ready', `Week ${week} QB picked`)
    else set(result, l.id, 'action', `Week ${week} QB not picked yet`)
  }
}

/**
 * Fantasy traditional: ready if every required starter slot is filled AND no
 * starter is currently 'Out'. Questionable starters → attention.
 */
async function computeFantasyReadiness(leagues, userId, result) {
  const leagueIds = leagues.map((l) => l.id)
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('league_id, format, roster_slots')
    .in('league_id', leagueIds)
  const settingsByLeague = {}
  for (const s of settings || []) settingsByLeague[s.league_id] = s

  const { data: rosters } = await supabase
    .from('fantasy_rosters')
    .select('league_id, player_id, slot, nfl_players(full_name, injury_status, bye_week)')
    .in('league_id', leagueIds)
    .eq('user_id', userId)

  // Current NFL week — used to flag bye-week starters
  let currentNflWeek = null
  try {
    const { getCurrentNflWeek } = await import('./tdPassService.js')
    const w = await getCurrentNflWeek()
    currentNflWeek = w?.week || null
  } catch {}
  const rosterByLeague = {}
  for (const r of rosters || []) {
    if (!rosterByLeague[r.league_id]) rosterByLeague[r.league_id] = []
    rosterByLeague[r.league_id].push(r)
  }

  for (const l of leagues) {
    const s = settingsByLeague[l.id]
    // Salary-cap fantasy uses a different lineup model — defer to ready for now
    if (s?.format === 'salary_cap') {
      set(result, l.id, 'ready', 'Salary cap fantasy')
      continue
    }
    const slots = s?.roster_slots || {}
    const requiredStarterCount =
      (slots.qb || 0) + (slots.rb || 0) + (slots.wr || 0) + (slots.te || 0) +
      (slots.flex || 0) + (slots.superflex || 0) + (slots.k || 0) + (slots.def || 0)

    const myRoster = rosterByLeague[l.id] || []
    if (!myRoster.length) {
      set(result, l.id, 'ready', 'Draft not complete')
      continue
    }
    const starters = myRoster.filter((r) => r.slot && r.slot !== 'bench' && r.slot !== 'ir')
    if (requiredStarterCount > 0 && starters.length < requiredStarterCount) {
      set(result, l.id, 'action', `${starters.length}/${requiredStarterCount} starting slots filled`)
      continue
    }
    // Bye-week starters take priority — if any starter is on bye this week,
    // that's an action item, not just an attention flag.
    const onBye = currentNflWeek
      ? starters.filter((r) => r.nfl_players?.bye_week === currentNflWeek)
      : []
    if (onBye.length > 0) {
      const summary = onBye.length === 1
        ? `${onBye[0].nfl_players?.full_name || 'A starter'} is on bye`
        : `${onBye.length} starters on bye this week`
      set(result, l.id, 'action', summary)
      continue
    }
    const flagged = starters.filter((r) => {
      const inj = r.nfl_players?.injury_status
      return inj === 'Out' || (inj && inj !== 'Probable')
    })
    if (flagged.length === 0) {
      set(result, l.id, 'ready', 'Lineup set')
    } else {
      const hasOut = flagged.some((r) => r.nfl_players?.injury_status === 'Out')
      const summary = flagged.length === 1
        ? `${flagged[0].nfl_players?.full_name || 'A starter'} is ${flagged[0].nfl_players?.injury_status}`
        : `${flagged.length} ${hasOut ? 'injured' : 'flagged'} starters`
      set(result, l.id, 'attention', summary)
    }
  }
}

/**
 * Pickem: ready if user has submitted at least one league_pick for the
 * current league_week. (We don't enforce a games_per_week minimum here —
 * picking ANYTHING for the period clears the indicator.)
 */
async function computePickemReadiness(leagues, userId, result) {
  const leagueIds = leagues.map((l) => l.id)

  // Find current week per league (earliest non-completed)
  const { data: weeks } = await supabase
    .from('league_weeks')
    .select('id, league_id, week_number, status, starts_at')
    .in('league_id', leagueIds)
    .neq('status', 'completed')
    .order('starts_at', { ascending: true })

  const currentWeekByLeague = {}
  for (const w of weeks || []) {
    if (!currentWeekByLeague[w.league_id]) currentWeekByLeague[w.league_id] = w
  }

  const weekIds = Object.values(currentWeekByLeague).map((w) => w.id)
  const { data: picks } = weekIds.length
    ? await supabase
        .from('league_picks')
        .select('league_id, league_week_id')
        .in('league_week_id', weekIds)
        .eq('user_id', userId)
    : { data: [] }
  const countByLeague = {}
  for (const p of picks || []) {
    countByLeague[p.league_id] = (countByLeague[p.league_id] || 0) + 1
  }

  for (const l of leagues) {
    const week = currentWeekByLeague[l.id]
    if (!week) {
      set(result, l.id, 'ready', 'No active period')
      continue
    }
    const n = countByLeague[l.id] || 0
    if (n > 0) {
      set(result, l.id, 'ready', `${n} pick${n === 1 ? '' : 's'} in for week ${week.week_number}`)
    } else {
      set(result, l.id, 'action', `No picks yet for week ${week.week_number}`)
    }
  }
}
