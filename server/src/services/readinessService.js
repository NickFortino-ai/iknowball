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

/**
 * For each sport key that's relevant today, decide whether the contest day
 * is "done" — i.e. the latest game for that sport has been over long enough
 * that there's nothing the user can do about today. Returns Set<sportKey>.
 *
 * Heuristic: latest game's starts_at + 4 hours < now. Once true, the
 * readiness check returns null (no clip) until the natural day rollover at
 * midnight ET, when a new game day begins.
 */
async function getDoneSportsForToday(sportKeys, userTz) {
  const done = new Set()
  if (!sportKeys?.length) return done
  const tz = userTz || 'America/New_York'
  const todayLocal = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  let offset
  try {
    const offsetMatch = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value
    offset = offsetMatch?.replace('GMT', '') || '+00:00'
  } catch {
    offset = '-05:00'
  }
  const startOfDay = new Date(`${todayLocal}T00:00:00${offset}`)
  const endOfDay = new Date(`${todayLocal}T23:59:59${offset}`)

  const { data: sportRows } = await supabase
    .from('sports')
    .select('id, key')
    .in('key', sportKeys)
  const idByKey = {}
  for (const s of sportRows || []) idByKey[s.key] = s.id

  const sportIds = Object.values(idByKey)
  if (!sportIds.length) return done

  // Pull every game today for these sports along with its status. We'll
  // mark a sport as "done" when it has at least one game today AND none of
  // those games are still upcoming or live. Postponed counts as "not
  // contributing", so a fully postponed slate also counts as done.
  const { data: games } = await supabase
    .from('games')
    .select('sport_id, status')
    .in('sport_id', sportIds)
    .gte('starts_at', startOfDay.toISOString())
    .lte('starts_at', endOfDay.toISOString())

  const stateBySport = {}
  for (const g of games || []) {
    if (!stateBySport[g.sport_id]) {
      stateBySport[g.sport_id] = { total: 0, openish: 0 }
    }
    stateBySport[g.sport_id].total++
    if (g.status === 'upcoming' || g.status === 'live') {
      stateBySport[g.sport_id].openish++
    }
  }

  for (const [key, sportId] of Object.entries(idByKey)) {
    const s = stateBySport[sportId]
    if (!s || s.total === 0) continue // no games today — don't suppress
    if (s.openish === 0) done.add(key) // every game is final/postponed
  }
  return done
}
export async function computeLeagueReadiness(userId, leagues, userTz) {
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

  // Pre-compute which sports are "done" for today (last game ended 4h ago).
  // Daily formats whose sport is done will return null (no clip) until the
  // ET day rollover, so the indicator doesn't flip to red the moment the
  // last game ends.
  const relevantSportKeys = new Set()
  if (byFormat.nba_dfs?.length) relevantSportKeys.add('basketball_nba')
  if (byFormat.mlb_dfs?.length || byFormat.hr_derby?.length) relevantSportKeys.add('baseball_mlb')
  if (byFormat.survivor?.length) {
    for (const l of byFormat.survivor) {
      if (l.sport && l.settings?.pick_frequency === 'daily') relevantSportKeys.add(l.sport)
    }
  }
  const doneSports = await getDoneSportsForToday([...relevantSportKeys], userTz)

  try {
    if (byFormat.nba_dfs?.length) {
      if (!doneSports.has('basketball_nba')) {
        await computeDfsReadiness(byFormat.nba_dfs, userId, todayET, 'nba_dfs_rosters', 'nba_dfs_roster_slots', 'nba_dfs_salaries', result)
      }
    }
    if (byFormat.mlb_dfs?.length) {
      if (!doneSports.has('baseball_mlb')) {
        await computeDfsReadiness(byFormat.mlb_dfs, userId, todayET, 'mlb_dfs_rosters', 'mlb_dfs_roster_slots', 'mlb_dfs_salaries', result)
      }
    }
    if (byFormat.survivor?.length) {
      // Filter out daily survivor leagues whose sport day is done
      const eligible = byFormat.survivor.filter((l) => {
        const isDaily = l.settings?.pick_frequency === 'daily'
        return !(isDaily && doneSports.has(l.sport))
      })
      if (eligible.length) await computeSurvivorReadiness(eligible, userId, result)
    }
    if (byFormat.hr_derby?.length) {
      if (!doneSports.has('baseball_mlb')) {
        await computeHrDerbyReadiness(byFormat.hr_derby, userId, todayET, result)
      }
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
    if (byFormat.squares?.length) {
      await computeSquaresReadiness(byFormat.squares, userId, result)
    }
    if (byFormat.bracket?.length) {
      await computeBracketReadiness(byFormat.bracket, userId, result)
    }
    // Salary cap fantasy is the same league.format='fantasy' bucket — handled
    // inside computeFantasyReadiness now.
  } catch (err) {
    logger.error({ err }, 'Failed to compute league readiness')
  }

  // Anything we don't have a definite signal for stays null (no clip).
  // Showing nothing is strictly better than lying with a green dot.
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
  // Pull EVERY salary row for tonight that touches one of our roster players,
  // including null injury_status, so we can distinguish "healthy" from
  // "we have no record of this player". A missing row means we can't verify
  // injuries — better to leave the clip off than show a false green.
  const knownPlayer = new Set()
  const injuryByPlayer = {}
  if (allPlayerIds.size > 0) {
    const { data: salaries } = await supabase
      .from(salaryTable)
      .select('espn_player_id, injury_status')
      .eq('game_date', todayET)
      .in('espn_player_id', [...allPlayerIds])
    for (const s of salaries || []) {
      knownPlayer.add(s.espn_player_id)
      if (s.injury_status) injuryByPlayer[s.espn_player_id] = s.injury_status
    }
  }

  for (const l of leagues) {
    const r = rosterByLeague[l.id]
    if (!r) {
      set(result, l.id, 'action', "You haven't set tonight's lineup")
      continue
    }
    const slots = r[slotTable] || []
    // Every roster player must have a known salary row for us to trust the
    // injury check. If any player is missing from the salaries table for
    // tonight, leave readiness null rather than green-lying.
    const allKnown = slots.every((s) => knownPlayer.has(s.espn_player_id))
    if (!allKnown) {
      // Don't set anything — readiness stays null and the card shows no clip
      continue
    }
    const outPlayers = []
    const flagged = []
    for (const slot of slots) {
      const status = injuryByPlayer[slot.espn_player_id]
      if (status === 'Out') outPlayers.push(status)
      else if (status && status !== 'Probable') flagged.push(status)
    }
    if (outPlayers.length > 0) {
      const summary = outPlayers.length === 1
        ? '1 Out player on your lineup'
        : `${outPlayers.length} Out players on your lineup`
      set(result, l.id, 'action', summary)
    } else if (flagged.length > 0) {
      const summary = flagged.length === 1
        ? `1 ${flagged[0]} player on your lineup`
        : `${flagged.length} flagged players on your lineup`
      set(result, l.id, 'attention', summary)
    } else {
      set(result, l.id, 'ready', 'Lineup set, no injuries')
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
  const now = new Date().toISOString()

  // Pull every period for these leagues so we can pick whichever one
  // matches the survivor service's "current period" rule:
  // (a) the period whose starts_at <= now <= ends_at, or
  // (b) if none match (between periods), the next upcoming period.
  const { data: weeks } = await supabase
    .from('league_weeks')
    .select('id, league_id, starts_at, ends_at')
    .in('league_id', leagueIds)
    .order('starts_at', { ascending: true })

  const weeksByLeague = {}
  for (const w of weeks || []) {
    if (!weeksByLeague[w.league_id]) weeksByLeague[w.league_id] = []
    weeksByLeague[w.league_id].push(w)
  }
  const currentWeekByLeague = {}
  for (const [lid, wks] of Object.entries(weeksByLeague)) {
    const active = wks.find((w) => w.starts_at <= now && w.ends_at >= now)
    if (active) {
      currentWeekByLeague[lid] = active
    } else {
      const upcoming = wks.find((w) => w.starts_at > now)
      if (upcoming) currentWeekByLeague[lid] = upcoming
    }
  }

  // Pull this user's picks for ALL of these leagues — match by league_id
  // rather than by week_id so a pick made for an adjacent period (e.g.
  // user picked early for the next week) still counts as "ready".
  const { data: picks } = await supabase
    .from('survivor_picks')
    .select('league_id, league_week_id, status')
    .in('league_id', leagueIds)
    .eq('user_id', userId)
  const picksByLeague = {}
  for (const p of picks || []) {
    if (!picksByLeague[p.league_id]) picksByLeague[p.league_id] = []
    picksByLeague[p.league_id].push(p)
  }

  // Eliminated users don't need to do anything
  const { data: members } = await supabase
    .from('league_members')
    .select('league_id, lives_remaining')
    .in('league_id', leagueIds)
    .eq('user_id', userId)
  const eliminatedSet = new Set(
    (members || []).filter((m) => m.lives_remaining === 0).map((m) => m.league_id)
  )

  for (const l of leagues) {
    if (eliminatedSet.has(l.id)) {
      set(result, l.id, 'ready', "You're eliminated — no action needed")
      continue
    }
    const week = currentWeekByLeague[l.id]
    if (!week) {
      // No current/upcoming period found — nothing to do
      set(result, l.id, 'ready', 'No active period')
      continue
    }
    const userPicks = picksByLeague[l.id] || []
    const hasPickForCurrent = userPicks.some((p) => p.league_week_id === week.id)
    if (hasPickForCurrent) {
      set(result, l.id, 'ready', 'Survivor pick submitted')
    } else {
      set(result, l.id, 'action', "You haven't made this period's pick")
    }
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
 * Check if all NFL games for a given fantasy week are final/postponed.
 * When true, the readiness clip should be suppressed until the week rolls over.
 */
async function isNflWeekDone(week, season) {
  if (!week || !season) return false
  try {
    const { getNflGamesForWeek } = await import('./sleeperService.js')
    // Sleeper doesn't have a direct week→games endpoint, so we check our DB
    // for NFL games in the week's date range. NFL weeks roughly:
    // Thursday through Monday. We check if any game is still upcoming/live.
    const { data: sportRow } = await supabase
      .from('sports')
      .select('id')
      .eq('key', 'americanfootball_nfl')
      .single()
    if (!sportRow) return false

    // Get all NFL games that have fantasy stats for this week
    const { data: stats } = await supabase
      .from('nfl_player_stats')
      .select('game_id')
      .eq('week', week)
      .eq('season', season)
      .limit(1)

    // If no stats rows exist for this week, the week hasn't started
    if (!stats?.length) return false

    // Check if any NFL game is still live or upcoming this week by looking at
    // games within a reasonable window. NFL weeks span Thu-Mon.
    // Alternative approach: check fantasy_matchups status
    const { data: matchups } = await supabase
      .from('fantasy_matchups')
      .select('status')
      .eq('week', week)
      .limit(5)

    // If all matchups for this week are 'completed', the week is done
    if (matchups?.length > 0 && matchups.every((m) => m.status === 'completed')) {
      return true
    }
  } catch {}
  return false
}

/**
 * Fantasy traditional: ready if every required starter slot is filled AND no
 * starter is currently 'Out'. Questionable starters → attention.
 */
async function computeFantasyReadiness(leagues, userId, result) {
  const leagueIds = leagues.map((l) => l.id)
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('league_id, format, roster_slots, current_week, season')
    .in('league_id', leagueIds)
  const settingsByLeague = {}
  for (const s of settings || []) settingsByLeague[s.league_id] = s

  // Check if all NFL games for the current fantasy week are done.
  // If so, suppress clips until the week rolls over (Tuesday 3 AM ET).
  const weekDoneCache = {}
  for (const s of settings || []) {
    if (s.current_week && s.season) {
      const key = `${s.season}-${s.current_week}`
      if (!(key in weekDoneCache)) {
        weekDoneCache[key] = await isNflWeekDone(s.current_week, s.season)
      }
    }
  }

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

  // Salary cap fantasy uses dfs_rosters keyed by nfl_week. Pre-fetch for all
  // salary cap leagues in one shot using the current NFL week, and join the
  // slot rows so we can apply the same injury/bye check as traditional.
  const salaryCapLeagueIds = (leagues || [])
    .filter((l) => settingsByLeague[l.id]?.format === 'salary_cap')
    .map((l) => l.id)
  let salaryCapRosterByLeague = {}
  if (salaryCapLeagueIds.length && currentNflWeek) {
    const { data: dfsRosters } = await supabase
      .from('dfs_rosters')
      .select('league_id, id, dfs_roster_slots(player_id, nfl_players(full_name, injury_status, bye_week))')
      .in('league_id', salaryCapLeagueIds)
      .eq('user_id', userId)
      .eq('nfl_week', currentNflWeek)
    for (const r of dfsRosters || []) salaryCapRosterByLeague[r.league_id] = r
  }

  for (const l of leagues) {
    const s = settingsByLeague[l.id]
    // No settings row at all → can't verify, leave null
    if (!s) continue
    // If all NFL games for this week are final, suppress the clip
    const weekKey = s.current_week && s.season ? `${s.season}-${s.current_week}` : null
    if (weekKey && weekDoneCache[weekKey]) continue
    // Salary cap fantasy: red if no lineup OR any Out player; yellow if any
    // Questionable/Doubtful; green otherwise. Bye-week players in the lineup
    // are also red since the slot is effectively wasted.
    if (s.format === 'salary_cap') {
      if (!currentNflWeek) continue // can't verify
      const r = salaryCapRosterByLeague[l.id]
      if (!r) {
        set(result, l.id, 'action', `No lineup set for week ${currentNflWeek}`)
        continue
      }
      const slots = r.dfs_roster_slots || []
      const onBye = slots.filter((sl) => sl.nfl_players?.bye_week === currentNflWeek)
      if (onBye.length > 0) {
        const summary = onBye.length === 1
          ? `${onBye[0].nfl_players?.full_name || 'A player'} is on bye`
          : `${onBye.length} players on bye this week`
        set(result, l.id, 'action', summary)
        continue
      }
      const outPlayers = slots.filter((sl) => sl.nfl_players?.injury_status === 'Out')
      if (outPlayers.length > 0) {
        const summary = outPlayers.length === 1
          ? `${outPlayers[0].nfl_players?.full_name || 'A player'} is Out`
          : `${outPlayers.length} Out players in your lineup`
        set(result, l.id, 'action', summary)
        continue
      }
      const flagged = slots.filter((sl) => {
        const inj = sl.nfl_players?.injury_status
        return inj && inj !== 'Probable' && inj !== 'Out'
      })
      if (flagged.length > 0) {
        const summary = flagged.length === 1
          ? `${flagged[0].nfl_players?.full_name || 'A player'} is ${flagged[0].nfl_players?.injury_status}`
          : `${flagged.length} flagged players in your lineup`
        set(result, l.id, 'attention', summary)
      } else {
        set(result, l.id, 'ready', `Lineup set for week ${currentNflWeek}`)
      }
      continue
    }
    const slots = s.roster_slots || {}
    const requiredStarterCount =
      (slots.qb || 0) + (slots.rb || 0) + (slots.wr || 0) + (slots.te || 0) +
      (slots.flex || 0) + (slots.superflex || 0) + (slots.k || 0) + (slots.def || 0)
    if (requiredStarterCount === 0) continue // unknown roster shape, don't guess

    const myRoster = rosterByLeague[l.id] || []
    if (!myRoster.length) continue // draft not complete or empty roster — null
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
    const outStarters = starters.filter((r) => r.nfl_players?.injury_status === 'Out')
    if (outStarters.length > 0) {
      const summary = outStarters.length === 1
        ? `${outStarters[0].nfl_players?.full_name || 'A starter'} is Out`
        : `${outStarters.length} Out starters`
      set(result, l.id, 'action', summary)
      continue
    }
    const flagged = starters.filter((r) => {
      const inj = r.nfl_players?.injury_status
      return inj && inj !== 'Probable'
    })
    if (flagged.length === 0) {
      set(result, l.id, 'ready', 'Lineup set')
    } else {
      const summary = flagged.length === 1
        ? `${flagged[0].nfl_players?.full_name || 'A starter'} is ${flagged[0].nfl_players?.injury_status}`
        : `${flagged.length} flagged starters`
      set(result, l.id, 'attention', summary)
    }
  }
}

/**
 * Pickem: ready only if the user has submitted ALL required picks for the
 * current period. The required count comes from leagues.settings.games_per_week.
 * If that setting is missing we conservatively leave readiness null rather
 * than guessing.
 */
async function computePickemReadiness(leagues, userId, result) {
  const leagueIds = leagues.map((l) => l.id)
  const now = new Date().toISOString()

  // Pull all periods so we can match the active one by [starts_at, ends_at]
  // (mirrors the survivor approach — status can lag).
  const { data: weeks } = await supabase
    .from('league_weeks')
    .select('id, league_id, week_number, starts_at, ends_at')
    .in('league_id', leagueIds)
    .order('starts_at', { ascending: true })

  const weeksByLeague = {}
  for (const w of weeks || []) {
    if (!weeksByLeague[w.league_id]) weeksByLeague[w.league_id] = []
    weeksByLeague[w.league_id].push(w)
  }
  const currentWeekByLeague = {}
  for (const [lid, wks] of Object.entries(weeksByLeague)) {
    const active = wks.find((w) => w.starts_at <= now && w.ends_at >= now)
    currentWeekByLeague[lid] = active || wks.find((w) => w.starts_at > now) || null
  }

  const weekIds = Object.values(currentWeekByLeague).filter(Boolean).map((w) => w.id)
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
    if (!week) continue // no active period — leave null
    const required = Number(l.settings?.games_per_week) || null
    const n = countByLeague[l.id] || 0
    if (!required) {
      // Can't verify the threshold — leave the clip off rather than guess
      continue
    }
    if (n >= required) {
      set(result, l.id, 'ready', `${n}/${required} picks in for week ${week.week_number}`)
    } else if (n > 0) {
      set(result, l.id, 'attention', `${n}/${required} picks in for week ${week.week_number}`)
    } else {
      set(result, l.id, 'action', `0/${required} picks for week ${week.week_number}`)
    }
  }
}

/**
 * Squares: yellow once the user has claimed at least one square; green once
 * every square on the board (10x10 = 100 total) has been claimed by anyone.
 * Action (red) only when the user has claimed nothing yet.
 */
async function computeSquaresReadiness(leagues, userId, result) {
  const leagueIds = leagues.map((l) => l.id)
  const { data: boards } = await supabase
    .from('squares_boards')
    .select('id, league_id, total_squares')
    .in('league_id', leagueIds)
  const boardByLeague = {}
  for (const b of boards || []) boardByLeague[b.league_id] = b

  const boardIds = (boards || []).map((b) => b.id)
  const { data: claims } = boardIds.length
    ? await supabase
        .from('squares_claims')
        .select('board_id, user_id')
        .in('board_id', boardIds)
    : { data: [] }

  const totalByBoard = {}
  const myCountByBoard = {}
  for (const c of claims || []) {
    totalByBoard[c.board_id] = (totalByBoard[c.board_id] || 0) + 1
    if (c.user_id === userId) {
      myCountByBoard[c.board_id] = (myCountByBoard[c.board_id] || 0) + 1
    }
  }

  for (const l of leagues) {
    const board = boardByLeague[l.id]
    if (!board) continue // no board yet — leave null
    const expected = Number(board.total_squares) || 100
    const myClaims = myCountByBoard[board.id] || 0
    const totalClaims = totalByBoard[board.id] || 0
    if (myClaims === 0) {
      set(result, l.id, 'action', "You haven't claimed any squares")
    } else if (totalClaims < expected) {
      set(result, l.id, 'attention', `${myClaims} claimed · ${totalClaims}/${expected} board filled`)
    } else {
      set(result, l.id, 'ready', `Board full · you have ${myClaims}`)
    }
  }
}

/**
 * Bracket: yellow if the user is in the league but the bracket isn't filled
 * out yet (or hasn't been generated). Green once their entry has picks for
 * every matchup. Null if there's no tournament for the league.
 */
async function computeBracketReadiness(leagues, userId, result) {
  const leagueIds = leagues.map((l) => l.id)
  const { data: tournaments } = await supabase
    .from('bracket_tournaments')
    .select('id, league_id, locks_at, status')
    .in('league_id', leagueIds)
  const tournamentByLeague = {}
  for (const t of tournaments || []) tournamentByLeague[t.league_id] = t

  const tournamentIds = (tournaments || []).map((t) => t.id)

  // Total matchups per tournament (the target pick count)
  const { data: matchups } = tournamentIds.length
    ? await supabase
        .from('bracket_matchups')
        .select('tournament_id')
        .in('tournament_id', tournamentIds)
    : { data: [] }
  const matchupCountByTournament = {}
  for (const m of matchups || []) {
    matchupCountByTournament[m.tournament_id] =
      (matchupCountByTournament[m.tournament_id] || 0) + 1
  }

  // User entries
  const { data: entries } = tournamentIds.length
    ? await supabase
        .from('bracket_entries')
        .select('id, tournament_id')
        .in('tournament_id', tournamentIds)
        .eq('user_id', userId)
    : { data: [] }
  const entryByTournament = {}
  for (const e of entries || []) entryByTournament[e.tournament_id] = e

  // Pick count per entry
  const entryIds = (entries || []).map((e) => e.id)
  const { data: picks } = entryIds.length
    ? await supabase
        .from('bracket_picks')
        .select('entry_id')
        .in('entry_id', entryIds)
    : { data: [] }
  const pickCountByEntry = {}
  for (const p of picks || []) {
    pickCountByEntry[p.entry_id] = (pickCountByEntry[p.entry_id] || 0) + 1
  }

  for (const l of leagues) {
    const t = tournamentByLeague[l.id]
    if (!t) continue // no tournament yet
    const totalMatchups = matchupCountByTournament[t.id] || 0
    if (totalMatchups === 0) {
      // Tournament exists but bracket isn't published yet
      set(result, l.id, 'attention', "Bracket isn't available yet")
      continue
    }
    const entry = entryByTournament[t.id]
    if (!entry) {
      set(result, l.id, 'action', "You haven't filled out the bracket")
      continue
    }
    const filledPicks = pickCountByEntry[entry.id] || 0
    if (filledPicks >= totalMatchups) {
      set(result, l.id, 'ready', 'Bracket filled out')
    } else {
      set(result, l.id, 'action', `${filledPicks}/${totalMatchups} picks made`)
    }
  }
}
