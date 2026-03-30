import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from '../services/notificationService.js'
import { calculateNBAFantasyPoints, generateNBASalaries } from '../services/nbaDfsService.js'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'

function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

/**
 * Fetch player box score stats from ESPN for completed NBA games on a given date.
 * Returns array of { espnPlayerId, playerName, stats }.
 */
async function fetchCompletedGameStats(date) {
  const dateStr = date.replace(/-/g, '')
  let events
  try {
    const res = await fetch(`${ESPN_BASE}/basketball/nba/scoreboard?dates=${dateStr}`)
    if (!res.ok) throw new Error(`ESPN returned ${res.status}`)
    const data = await res.json()
    events = data.events || []
  } catch (err) {
    logger.error({ err, date }, 'Failed to fetch ESPN NBA scoreboard for DFS scoring')
    return { playerStats: [], allFinal: false, hasGames: false }
  }

  if (!events.length) return { playerStats: [], allFinal: true, hasGames: false }

  let allFinal = true
  const playerStats = []

  for (const event of events) {
    const competition = event.competitions?.[0]
    if (!competition) continue

    const statusType = competition.status?.type?.name || event.status?.type?.name
    const isFinal = statusType === 'STATUS_FINAL'
    const isLive = ['STATUS_IN_PROGRESS', 'STATUS_END_PERIOD', 'STATUS_HALFTIME', 'STATUS_OVERTIME'].includes(statusType)

    if (!isFinal && !isLive) {
      allFinal = false
      continue
    }
    if (!isFinal) allFinal = false

    // Fetch box score for this game
    const gameId = event.id
    let boxScore
    try {
      const res = await fetch(`${ESPN_BASE}/basketball/nba/summary?event=${gameId}`)
      if (!res.ok) continue
      boxScore = await res.json()
    } catch {
      continue
    }

    // Extract player stats from box score
    for (const team of boxScore.boxscore?.players || []) {
      for (const statGroup of team.statistics || []) {
        const headers = statGroup.labels || []
        for (const athlete of statGroup.athletes || []) {
          const espnId = athlete.athlete?.id
          const name = athlete.athlete?.displayName
          if (!espnId || !name) continue

          const rawStats = athlete.stats || []
          const statMap = {}
          headers.forEach((h, i) => { statMap[h] = rawStats[i] })

          // Parse ESPN stat abbreviations
          const mins = statMap['MIN'] || '0'
          const minsPlayed = parseInt(mins) || 0

          // Skip DNPs
          if (minsPlayed === 0 && (mins === '0' || mins === '--' || !mins)) continue

          playerStats.push({
            espnPlayerId: espnId,
            playerName: name,
            stats: {
              points: parseInt(statMap['PTS']) || 0,
              rebounds: parseInt(statMap['REB']) || 0,
              assists: parseInt(statMap['AST']) || 0,
              steals: parseInt(statMap['STL']) || 0,
              blocks: parseInt(statMap['BLK']) || 0,
              turnovers: parseInt(statMap['TO']) || 0,
              three_pointers_made: parseInt((statMap['3PT'] || '0').split('-')[0]) || 0,
              minutes_played: minsPlayed,
            },
          })
        }
      }
    }
  }

  return { playerStats, allFinal, hasGames: true }
}

/**
 * Store player stats and calculate fantasy points.
 */
async function upsertPlayerStats(playerStats, date, season) {
  if (!playerStats.length) return

  const rows = playerStats.map((p) => ({
    espn_player_id: p.espnPlayerId,
    player_name: p.playerName,
    game_date: date,
    season,
    ...p.stats,
    fantasy_points: calculateNBAFantasyPoints(p.stats),
    updated_at: new Date().toISOString(),
  }))

  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('nba_dfs_player_stats')
      .upsert(chunk, { onConflict: 'espn_player_id,game_date,season' })

    if (error) logger.error({ error, offset: i }, 'Failed to upsert NBA DFS player stats')
  }

  logger.info({ count: rows.length, date }, 'Upserted NBA DFS player stats')
}

/**
 * Score all rosters for the given date: update each slot's points_earned,
 * then aggregate to roster total_points and nightly_results.
 */
async function scoreRosters(date, season, allFinal = false) {
  // Get all fantasy points for this date
  const { data: stats } = await supabase
    .from('nba_dfs_player_stats')
    .select('espn_player_id, fantasy_points')
    .eq('game_date', date)
    .eq('season', season)

  if (!stats?.length) return

  const statsMap = {}
  for (const s of stats) {
    statsMap[s.espn_player_id] = Number(s.fantasy_points)
  }

  // Get all rosters for this date
  const { data: rosters } = await supabase
    .from('nba_dfs_rosters')
    .select('id, league_id, user_id, nba_dfs_roster_slots(id, espn_player_id)')
    .eq('game_date', date)
    .eq('season', season)

  if (!rosters?.length) return

  // Update each slot's points
  for (const roster of rosters) {
    let rosterTotal = 0
    for (const slot of roster.nba_dfs_roster_slots || []) {
      const pts = statsMap[slot.espn_player_id] || 0
      rosterTotal += pts
      await supabase
        .from('nba_dfs_roster_slots')
        .update({ points_earned: pts })
        .eq('id', slot.id)
    }

    // Update roster total
    await supabase
      .from('nba_dfs_rosters')
      .update({ total_points: rosterTotal })
      .eq('id', roster.id)
  }

  // Aggregate nightly results per league
  const leagueRosters = {}
  for (const r of rosters) {
    if (!leagueRosters[r.league_id]) leagueRosters[r.league_id] = []
    const total = (r.nba_dfs_roster_slots || []).reduce((sum, s) => sum + (statsMap[s.espn_player_id] || 0), 0)
    leagueRosters[r.league_id].push({ userId: r.user_id, totalPoints: total })
  }

  for (const [leagueId, entries] of Object.entries(leagueRosters)) {
    entries.sort((a, b) => b.totalPoints - a.totalPoints)

    const results = entries.map((e, i) => ({
      league_id: leagueId,
      user_id: e.userId,
      game_date: date,
      season,
      total_points: e.totalPoints,
      night_rank: i + 1,
      is_night_winner: allFinal && i === 0 && entries.length > 1,
    }))

    const { error } = await supabase
      .from('nba_dfs_nightly_results')
      .upsert(results, { onConflict: 'league_id,user_id,game_date,season' })

    if (error) logger.error({ error, leagueId, date }, 'Failed to upsert NBA DFS nightly results')
  }

  logger.info({ rosters: rosters.length, date, allFinal }, 'Scored NBA DFS rosters')
}

/**
 * For single-night NBA DFS leagues whose start date matches the given date:
 * remove members who didn't submit a roster and notify them.
 * Only runs once all games for that date are final.
 */
async function cleanupSingleNightNoRosters(date, season, allFinal) {
  if (!allFinal) return

  // Find single-night NBA DFS leagues starting on this date
  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name, starts_at, fantasy_settings(season_type)')
    .eq('format', 'nba_dfs')
    .in('status', ['open', 'active'])

  if (!leagues?.length) return

  for (const league of leagues) {
    const seasonType = league.fantasy_settings?.[0]?.season_type || league.fantasy_settings?.season_type
    if (seasonType !== 'single_week') continue

    const leagueStart = league.starts_at ? new Date(league.starts_at).toISOString().split('T')[0] : null
    if (leagueStart !== date) continue

    // Get all members
    const { data: members } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', league.id)

    if (!members?.length) continue

    // Get users who submitted rosters
    const { data: rosters } = await supabase
      .from('nba_dfs_rosters')
      .select('user_id')
      .eq('league_id', league.id)
      .eq('game_date', date)
      .eq('season', season)

    const rosterUserIds = new Set((rosters || []).map((r) => r.user_id))
    const noRosterMembers = members.filter((m) => !rosterUserIds.has(m.user_id))

    for (const member of noRosterMembers) {
      // Remove from league
      await supabase
        .from('league_members')
        .delete()
        .eq('league_id', league.id)
        .eq('user_id', member.user_id)

      await createNotification(member.user_id, 'league_update',
        `You didn't submit a roster in time for ${league.name}. Catch the next one!`,
        { leagueId: league.id })

      logger.info({ userId: member.user_id, leagueId: league.id, date }, 'Removed member from single-night DFS league (no roster)')
    }
  }
}

/**
 * Tighten joins_locked_at for NBA DFS leagues to the first tip-off of their start date.
 * Runs after salaries are generated so we know game times.
 */
async function tightenJoinLocks() {
  // Find NBA DFS leagues where joins_locked_at hasn't been tightened to a game time yet
  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, starts_at, joins_locked_at')
    .eq('format', 'nba_dfs')
    .in('status', ['open', 'active'])

  if (!leagues?.length) return

  for (const league of leagues) {
    if (!league.starts_at) continue
    const startDate = new Date(league.starts_at).toISOString().split('T')[0]

    // Get first game tip-off for that date
    const { data: firstGame } = await supabase
      .from('nba_dfs_salaries')
      .select('game_starts_at')
      .eq('game_date', startDate)
      .not('game_starts_at', 'is', null)
      .order('game_starts_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!firstGame?.game_starts_at) continue

    // Only tighten if current lock is after the first tip-off (or null)
    const tipOff = new Date(firstGame.game_starts_at)
    const currentLock = league.joins_locked_at ? new Date(league.joins_locked_at) : null
    if (!currentLock || currentLock > tipOff) {
      await supabase
        .from('leagues')
        .update({ joins_locked_at: tipOff.toISOString() })
        .eq('id', league.id)

      logger.info({ leagueId: league.id, tipOff: tipOff.toISOString() }, 'Tightened joins_locked_at to first tip-off')
    }
  }
}

/**
 * Main job: generate salaries for today, score yesterday's (or today's finished) games.
 */
export async function scoreNBADFS() {
  const today = todayET()
  const season = 2026

  // Generate salaries for today if not already done
  const { count: existingSalaries } = await supabase
    .from('nba_dfs_salaries')
    .select('id', { count: 'exact', head: true })
    .eq('game_date', today)
    .eq('season', season)

  if (!existingSalaries || existingSalaries === 0) {
    try {
      await generateNBASalaries(today, season)
    } catch (err) {
      logger.error({ err }, 'Failed to generate NBA DFS salaries')
    }
  }

  // Also generate tomorrow's salaries so users can build rosters a day early
  const tomorrowDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrow = tomorrowDate.toISOString().split('T')[0]

  const { count: tomorrowSalaries } = await supabase
    .from('nba_dfs_salaries')
    .select('id', { count: 'exact', head: true })
    .eq('game_date', tomorrow)
    .eq('season', season)

  if (!tomorrowSalaries || tomorrowSalaries === 0) {
    try {
      await generateNBASalaries(tomorrow, season)
    } catch (err) {
      logger.error({ err }, 'Failed to generate tomorrow NBA DFS salaries')
    }
  }

  // Tighten join locks to first tip-off once salaries exist
  await tightenJoinLocks()

  // Score today's completed games
  const { playerStats, allFinal, hasGames } = await fetchCompletedGameStats(today)

  if (!hasGames) {
    logger.debug({ date: today }, 'No NBA games today for DFS scoring')
    return
  }

  if (playerStats.length > 0) {
    await upsertPlayerStats(playerStats, today, season)
    await scoreRosters(today, season, allFinal)
    logger.info({ date: today, players: playerStats.length, allFinal }, 'NBA DFS scoring pass complete')
  }

  if (allFinal) {
    await cleanupSingleNightNoRosters(today, season, true)
  }

  // Also check yesterday in case late games weren't scored
  const yesterday = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const { count: yesterdayResults } = await supabase
    .from('nba_dfs_nightly_results')
    .select('id', { count: 'exact', head: true })
    .eq('game_date', yesterdayStr)
    .eq('season', season)

  // Re-score yesterday if we have no results yet (late games may have finished overnight)
  if (!yesterdayResults || yesterdayResults === 0) {
    const yester = await fetchCompletedGameStats(yesterdayStr)
    if (yester.playerStats.length > 0) {
      await upsertPlayerStats(yester.playerStats, yesterdayStr, season)
      await scoreRosters(yesterdayStr, season, yester.allFinal)
      logger.info({ date: yesterdayStr, players: yester.playerStats.length, allFinal: yester.allFinal }, 'Scored yesterday NBA DFS games')
    }
    if (yester.allFinal) {
      await cleanupSingleNightNoRosters(yesterdayStr, season, true)
    }
  }
}
