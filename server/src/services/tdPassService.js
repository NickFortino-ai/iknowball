import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

/**
 * Determine the current NFL week + season for the TD Pass competition.
 * Uses nfl_schedule directly so the result reflects what's actually loaded
 * in the DB (no Sleeper roundtrip required).
 */
export async function getCurrentNflWeek() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  // Find the smallest week number whose latest game is still today-or-future.
  const { data: rows } = await supabase
    .from('nfl_schedule')
    .select('season, week, game_date')
    .gte('game_date', today)
    .order('week', { ascending: true })
    .order('game_date', { ascending: true })
    .limit(1)
  if (rows?.length) {
    return { season: rows[0].season, week: rows[0].week }
  }
  // Fallback: highest known week (offseason / postseason)
  const { data: latest } = await supabase
    .from('nfl_schedule')
    .select('season, week')
    .order('season', { ascending: false })
    .order('week', { ascending: false })
    .limit(1)
  if (latest?.length) return { season: latest[0].season, week: latest[0].week }
  return { season: new Date().getUTCFullYear(), week: 1 }
}

/**
 * Latest kickoff time of the current NFL week. Used as the joins_locked_at
 * for a TD Pass league created mid-week — users can join up until the start
 * of the very last game (e.g. MNF nightcap on a doubleheader week).
 *
 * Returns an ISO timestamp string, or null if no games are loaded.
 */
export async function getCurrentWeekLastKickoff() {
  const { week, season } = await getCurrentNflWeek()
  // Look up the date range for that week
  const { data: weekRows } = await supabase
    .from('nfl_schedule')
    .select('game_date')
    .eq('season', season)
    .eq('week', week)
  if (!weekRows?.length) return null
  const dates = weekRows.map((r) => r.game_date).sort()
  const minDate = dates[0]
  const maxDate = dates[dates.length - 1]

  // Find the latest NFL kickoff in that range from the games table (real ts)
  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', 'americanfootball_nfl')
    .single()
  if (!sport?.id) return null
  const { data: games } = await supabase
    .from('games')
    .select('starts_at')
    .eq('sport_id', sport.id)
    .gte('starts_at', `${minDate}T00:00:00Z`)
    .lt('starts_at', `${maxDate}T23:59:59Z`)
    .order('starts_at', { ascending: false })
    .limit(1)
  return games?.[0]?.starts_at || null
}

/**
 * Set of QB player_ids whose game has already started for the current week.
 * We use the same Eastern-day rule as the fantasy waiver lock.
 */
async function getLockedTeamSet() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const { data: lockedGames } = await supabase
    .from('nfl_schedule')
    .select('home_team, away_team')
    .lte('game_date', today)
  const teams = new Set()
  for (const g of lockedGames || []) {
    if (g.home_team) teams.add(g.home_team)
    if (g.away_team) teams.add(g.away_team)
  }
  return teams
}

/**
 * Returns the QB pool for a TD Pass league pick. Excludes:
 *  - QBs the user has already picked any other week
 *  - QBs whose team game has already started today (locked)
 */
export async function getAvailableQBs(leagueId, userId) {
  const { data: usedPicks } = await supabase
    .from('td_pass_picks')
    .select('qb_player_id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
  const usedSet = new Set((usedPicks || []).map((p) => p.qb_player_id))

  const lockedTeams = await getLockedTeamSet()

  const { data: qbs } = await supabase
    .from('nfl_players')
    .select('id, full_name, team, headshot_url, injury_status')
    .eq('position', 'QB')
    .not('team', 'is', null)
    .order('full_name', { ascending: true })

  // Pull current-week NFL games so we can attach matchup info to each QB
  const matchupByTeam = await getCurrentWeekMatchups()

  return (qbs || [])
    .filter((q) => !usedSet.has(q.id))
    .filter((q) => !lockedTeams.has(q.team))
    .map((q) => {
      const m = matchupByTeam[q.team] || null
      return {
        id: q.id,
        full_name: q.full_name,
        team: q.team,
        headshot_url: q.headshot_url,
        injury_status: q.injury_status,
        matchup: m, // { opponent, home_away, starts_at } | null
      }
    })
}

/**
 * Build a map: team_abbr → { opponent, home_away, starts_at } for the
 * current NFL week. Pulls from the live `games` table (which is what the
 * picks UI uses elsewhere) so abbreviations match.
 */
async function getCurrentWeekMatchups() {
  const { week, season } = await getCurrentNflWeek()
  const { data: weekRows } = await supabase
    .from('nfl_schedule')
    .select('game_date')
    .eq('season', season)
    .eq('week', week)
  if (!weekRows?.length) return {}
  const dates = weekRows.map((r) => r.game_date).sort()
  const minDate = dates[0]
  const maxDate = dates[dates.length - 1]

  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', 'americanfootball_nfl')
    .single()
  if (!sport?.id) return {}

  const { data: games } = await supabase
    .from('games')
    .select('home_team, away_team, starts_at')
    .eq('sport_id', sport.id)
    .gte('starts_at', `${minDate}T00:00:00Z`)
    .lt('starts_at', `${maxDate}T23:59:59Z`)

  const byTeam = {}
  for (const g of games || []) {
    if (g.home_team) {
      byTeam[g.home_team] = { opponent: g.away_team, home_away: 'home', starts_at: g.starts_at }
    }
    if (g.away_team) {
      byTeam[g.away_team] = { opponent: g.home_team, home_away: 'away', starts_at: g.starts_at }
    }
  }
  return byTeam
}

export async function getMyPicks(leagueId, userId) {
  const { data } = await supabase
    .from('td_pass_picks')
    .select('*')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .order('week', { ascending: true })
  return data || []
}

/**
 * Every pick from every member of the league. Used by the History view so
 * everyone can see what each member picked in past weeks (and the current
 * week, once locked).
 */
export async function getLeaguePicks(leagueId) {
  const { data } = await supabase
    .from('td_pass_picks')
    .select('id, user_id, season, week, qb_player_id, qb_name, team, headshot_url, td_count, scored_at, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)
    .order('week', { ascending: true })
  return data || []
}

export async function submitPick(leagueId, userId, qbPlayerId) {
  if (!qbPlayerId) {
    const err = new Error('qb_player_id required')
    err.status = 400
    throw err
  }

  // Verify membership
  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!member) {
    const err = new Error('Not a member of this league')
    err.status = 403
    throw err
  }

  const { season, week } = await getCurrentNflWeek()

  // Resolve the QB
  const { data: qb } = await supabase
    .from('nfl_players')
    .select('id, full_name, team, headshot_url')
    .eq('id', qbPlayerId)
    .single()
  if (!qb) {
    const err = new Error('QB not found')
    err.status = 404
    throw err
  }

  // Lock check — can't pick a QB whose game has already started
  const lockedTeams = await getLockedTeamSet()
  if (lockedTeams.has(qb.team)) {
    const err = new Error("That QB's game has already started")
    err.status = 400
    throw err
  }

  // Already used this QB?
  const { data: alreadyUsed } = await supabase
    .from('td_pass_picks')
    .select('id, week')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('qb_player_id', qbPlayerId)
    .maybeSingle()
  if (alreadyUsed) {
    const err = new Error(`You already picked ${qb.full_name} in week ${alreadyUsed.week}`)
    err.status = 400
    throw err
  }

  // Replace any prior pick for the current week (allowed until lock)
  await supabase
    .from('td_pass_picks')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('week', week)

  const { data, error } = await supabase
    .from('td_pass_picks')
    .insert({
      league_id: leagueId,
      user_id: userId,
      season,
      week,
      qb_player_id: qbPlayerId,
      qb_name: qb.full_name,
      team: qb.team,
      headshot_url: qb.headshot_url,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Standings = total accumulated passing TDs across all picks per user.
 */
export async function getStandings(leagueId) {
  const { data: picks } = await supabase
    .from('td_pass_picks')
    .select('user_id, td_count')
    .eq('league_id', leagueId)
  if (!picks?.length) return { standings: [] }

  const totals = {}
  for (const p of picks) {
    if (!totals[p.user_id]) totals[p.user_id] = { totalTds: 0, picks: 0 }
    totals[p.user_id].totalTds += p.td_count || 0
    totals[p.user_id].picks += 1
  }

  // Include every member, even those with zero picks yet
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)

  const rows = (members || []).map((m) => ({
    user: m.users || { id: m.user_id },
    totalTds: totals[m.user_id]?.totalTds || 0,
    picks: totals[m.user_id]?.picks || 0,
  }))
    .sort((a, b) => b.totalTds - a.totalTds || b.picks - a.picks)
    .map((r, i) => ({ ...r, rank: i + 1 }))

  return { standings: rows }
}

/**
 * Score every pending td_pass pick. Reads pass_td from nfl_player_stats
 * for each (player, season, week) and writes td_count back to the pick.
 * Called from the NFL stats sync loop so scores update mid-game.
 */
export async function scoreAllTdPassPicks() {
  const { data: picks } = await supabase
    .from('td_pass_picks')
    .select('id, qb_player_id, season, week, td_count')
  if (!picks?.length) return { scored: 0 }

  // Load every relevant stat row in one query
  const keys = picks.map((p) => `${p.qb_player_id}|${p.season}|${p.week}`)
  const playerIds = [...new Set(picks.map((p) => p.qb_player_id))]
  const seasons = [...new Set(picks.map((p) => p.season))]

  const { data: statRows } = await supabase
    .from('nfl_player_stats')
    .select('player_id, season, week, pass_td')
    .in('player_id', playerIds)
    .in('season', seasons)
  const statMap = {}
  for (const s of statRows || []) {
    statMap[`${s.player_id}|${s.season}|${s.week}`] = Number(s.pass_td) || 0
  }

  let scored = 0
  for (const p of picks) {
    const live = statMap[`${p.qb_player_id}|${p.season}|${p.week}`] || 0
    if (live !== (p.td_count || 0)) {
      const { error } = await supabase
        .from('td_pass_picks')
        .update({ td_count: live, scored_at: new Date().toISOString() })
        .eq('id', p.id)
      if (!error) scored++
    }
  }
  if (scored > 0) logger.info({ scored }, 'TD Pass picks scored')
  return { scored }
}
