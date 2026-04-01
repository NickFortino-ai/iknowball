import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { calculateFantasyPoints } from './sleeperService.js'
import { fetchGameLog, calcWeightedFppg, fetchDefensiveRankings, applyDefensiveAdjustment } from '../utils/dfsAlgorithm.js'

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

  const { data, error } = await query.limit(200)
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

  // Upsert roster
  const { data: roster, error: rosterError } = await supabase
    .from('dfs_rosters')
    .upsert({
      league_id: leagueId,
      user_id: userId,
      nfl_week: week,
      season,
      total_salary: totalSalary,
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
 * Auto-generate salaries from player projections/rankings.
 */
/**
 * Calculate NFL fantasy points from a single game stat map (ESPN gamelog).
 * Half-PPR scoring.
 */
function nflGameFpts(statMap) {
  // NFL gamelog labels vary by position — handle common ones
  const passYds = parseFloat(statMap['YDS'] || statMap['PYDS'] || 0)
  const passTD = parseFloat(statMap['TD'] || statMap['PTD'] || 0)
  const int = parseFloat(statMap['INT'] || 0)
  const rushYds = parseFloat(statMap['RYDS'] || 0)
  const rushTD = parseFloat(statMap['RTD'] || 0)
  const rec = parseFloat(statMap['REC'] || 0)
  const recYds = parseFloat(statMap['RECYDS'] || 0)
  const recTD = parseFloat(statMap['RECTD'] || 0)
  const fumLost = parseFloat(statMap['FUML'] || 0)

  // Basic half-PPR
  return passYds * 0.04 + passTD * 4 - int * 2
    + rushYds * 0.1 + rushTD * 6
    + rec * 0.5 + recYds * 0.1 + recTD * 6
    - fumLost * 2
}

/**
 * NFL salary from FPPG.
 * $4,500 base + $400/fppg, capped at $10,000.
 */
function nflFppgToSalary(fppg) {
  if (!fppg || fppg <= 0) return 4500
  const salary = Math.round((4500 + fppg * 400) / 100) * 100
  return Math.max(4500, Math.min(10000, salary))
}

export async function generateSalaries(week, season) {
  logger.info({ week, season }, 'Generating DFS salaries')

  const { data: players, error } = await supabase
    .from('nfl_players')
    .select('id, position, search_rank, projected_pts_half_ppr, espn_id, team')
    .eq('status', 'Active')
    .not('team', 'is', null)
    .in('position', ['QB', 'RB', 'WR', 'TE', 'DEF'])
    .order('search_rank', { ascending: true })

  if (error) throw error

  // Fetch defensive rankings (cached 6h)
  const defRankings = await fetchDefensiveRankings('football/nfl')

  // TODO: We'd need to know each player's opponent this week for defensive adjustment.
  // For now, fetch NFL schedule for this week to build team→opponent map.
  let teamOpponentMap = {}
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${season}`)
    if (res.ok) {
      const data = await res.json()
      for (const event of data.events || []) {
        const comp = event.competitions?.[0]
        if (!comp) continue
        const teams = comp.competitors || []
        if (teams.length === 2) {
          const t0 = teams[0].team?.abbreviation
          const t1 = teams[1].team?.abbreviation
          if (t0 && t1) {
            teamOpponentMap[t0] = t1
            teamOpponentMap[t1] = t0
          }
        }
      }
    }
  } catch { /* ignore */ }

  const salaries = []

  for (const player of (players || [])) {
    const pos = player.position
    let salary

    if (pos === 'DEF') {
      // DEF: rank-based, no game log
      const posCount = salaries.filter((s) => s._pos === 'DEF').length + 1
      salary = Math.max(2500, Math.min(5000, 5000 - (posCount - 1) * 75))
      salary = Math.round(salary / 100) * 100
    } else if (player.espn_id) {
      // Use weighted FPPG from game log
      const gameLog = await fetchGameLog(player.espn_id, 'football/nfl', season)
      const seasonFppg = player.projected_pts_half_ppr || 0
      const fppg = calcWeightedFppg(nflGameFpts, gameLog, seasonFppg, { recentN: 4, midN: 8 })
      salary = nflFppgToSalary(fppg)

      // Apply defensive adjustment
      const opponent = teamOpponentMap[player.team]
      if (opponent) {
        salary = applyDefensiveAdjustment(salary, opponent, defRankings, 32)
      }
    } else {
      // No ESPN ID — fall back to rank-based
      const posCount = salaries.filter((s) => s._pos === pos).length + 1
      salary = Math.max(4500, Math.min(10000, 10000 - (posCount - 1) * 100))
      salary = Math.round(salary / 100) * 100
    }

    salaries.push({
      player_id: player.id,
      nfl_week: week,
      season,
      salary,
      _pos: pos, // temp field for counting, not stored
    })
  }

  // Remove temp field before upsert
  for (const s of salaries) delete s._pos

  // Batch upsert
  const CHUNK = 500
  let upserted = 0
  for (let i = 0; i < salaries.length; i += CHUNK) {
    const chunk = salaries.slice(i, i + CHUNK)
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
  return { upserted, total: salaries.length }
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
