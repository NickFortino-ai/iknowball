import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from '../services/notificationService.js'
import { calculateNBAFantasyPoints, generateNBASalaries } from '../services/nbaDfsService.js'
import { todaySportsDay, tomorrowSportsDay, yesterdaySportsDay } from '../utils/sportsDay.js'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'

// Misnamed for legacy reasons — sports day is anchored to PT, not ET. Kept
// as a thin alias to avoid a sweeping rename.
const todayET = todaySportsDay

/**
 * Decide whether nba_dfs_salaries for a given date needs (re)generation.
 * Returns true if we have no rows OR ESPN's scoreboard shows more games
 * than we have distinct game start times for. The latter catches the
 * case where NBA added a game (e.g. playoff series winner clinches and
 * a Game N+1 gets scheduled the next day) AFTER the cron's first run
 * for that date had already populated the salary set.
 */
async function nbaSalariesAreStale(date, season) {
  const { count: existing } = await supabase
    .from('nba_dfs_salaries')
    .select('id', { count: 'exact', head: true })
    .eq('game_date', date)
    .eq('season', season)
  if (!existing || existing === 0) return true

  let espnEvents = []
  try {
    const dateStr = date.replace(/-/g, '')
    const res = await fetch(`${ESPN_BASE}/basketball/nba/scoreboard?dates=${dateStr}`)
    if (!res.ok) return false // can't tell — assume fresh, wait for next tick
    const data = await res.json()
    espnEvents = data.events || []
  } catch (_) {
    return false
  }
  if (espnEvents.length === 0) return false

  // Compare kickoff sets — if our table has any kickoff ESPN doesn't list
  // (game canceled/postponed) OR ESPN has any kickoff we don't have (game
  // added), regenerate. Counting alone misses the "we have stale games
  // ESPN dropped" case, which leaves zombie players blocking the new game.
  const { data: rows } = await supabase
    .from('nba_dfs_salaries')
    .select('game_starts_at')
    .eq('game_date', date)
    .eq('season', season)
  const norm = (s) => s ? new Date(s).getTime() : null
  const ours = new Set((rows || []).map((r) => norm(r.game_starts_at)).filter(Boolean))
  const espn = new Set(espnEvents.map((e) => norm(e.date)).filter(Boolean))
  if (ours.size !== espn.size) return true
  for (const k of espn) if (!ours.has(k)) return true
  return false
}

/**
 * Fetch player box score stats from ESPN for completed NBA games on a given date.
 * Returns array of { espnPlayerId, playerName, stats }.
 * Exported so the player-prop live-score enrichment can fall back to a direct
 * ESPN fetch when the nba_dfs_player_stats table isn't populated for today.
 */
export async function fetchCompletedGameStats(date) {
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
    // Each game is wrapped in its own try/catch — a malformed box score for one
    // game should never kill the whole scrape or leak an unhandled exception
    // up into the cron runner. Log and move on.
    try {
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
        if (!res.ok) {
          logger.warn({ gameId, status: res.status, date }, 'ESPN summary returned non-OK, skipping game')
          continue
        }
        boxScore = await res.json()
      } catch (err) {
        logger.warn({ err, gameId, date }, 'ESPN summary fetch threw, skipping game')
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
    } catch (err) {
      logger.error({ err, gameId: event?.id, date }, 'NBA box-score processing threw for game, skipping')
      continue
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
      is_night_winner: allFinal && i === 0,
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

    // Align joins_locked_at to first tip-off. create-league sets a
    // placeholder DATE-only value (midnight UTC of start_date) which
    // lands BEFORE the actual tipoff in any US timezone, so we have to
    // push forward too — not just pull back. Skip only if already
    // exactly aligned.
    const tipOff = new Date(firstGame.game_starts_at)
    const currentLock = league.joins_locked_at ? new Date(league.joins_locked_at) : null
    if (!currentLock || currentLock.getTime() !== tipOff.getTime()) {
      await supabase
        .from('leagues')
        .update({ joins_locked_at: tipOff.toISOString() })
        .eq('id', league.id)

      logger.info({ leagueId: league.id, tipOff: tipOff.toISOString() }, 'Aligned joins_locked_at to first tip-off')
    }
  }
}

/**
 * Main job: generate salaries for today, score yesterday's (or today's finished) games.
 */
/**
 * Score 3-Point Contest picks: pull three_pointers_made from
 * nba_dfs_player_stats into three_point_picks.made_threes.
 */
async function scoreThreePointPicks(date) {
  const { data: picks } = await supabase
    .from('three_point_picks')
    .select('id, espn_player_id')
    .eq('game_date', date)

  if (!picks?.length) return

  const espnIds = [...new Set(picks.map((p) => p.espn_player_id))]
  const { data: stats } = await supabase
    .from('nba_dfs_player_stats')
    .select('espn_player_id, three_pointers_made')
    .eq('game_date', date)
    .in('espn_player_id', espnIds)

  if (!stats?.length) return

  const tpMap = {}
  for (const s of stats) tpMap[s.espn_player_id] = s.three_pointers_made || 0

  for (const pick of picks) {
    const tp = tpMap[pick.espn_player_id]
    if (tp === undefined) continue
    await supabase
      .from('three_point_picks')
      .update({ made_threes: tp })
      .eq('id', pick.id)
  }

  logger.info({ date, picks: picks.length }, 'Scored 3-Point Contest picks')
}

export async function scoreNBADFS() {
  const today = todayET()
  const season = 2026

  // Refresh today's salaries if missing or if NBA added a game that
  // wasn't on the schedule when we last generated.
  if (await nbaSalariesAreStale(today, season)) {
    try {
      await generateNBASalaries(today, season)
    } catch (err) {
      logger.error({ err }, 'Failed to generate NBA DFS salaries')
    }
  }

  // Same for tomorrow so users can pick a day in advance.
  const tomorrow = tomorrowSportsDay()

  if (await nbaSalariesAreStale(tomorrow, season)) {
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
    await scoreThreePointPicks(today)
    logger.info({ date: today, players: playerStats.length, allFinal }, 'NBA DFS scoring pass complete')
  }

  if (allFinal) {
    await cleanupSingleNightNoRosters(today, season, true)
  }

  // Also check yesterday in case late games weren't scored or weren't finalized
  const yesterdayStr = yesterdaySportsDay()

  // Check if yesterday has unfinalized results (no winner set yet) or no results at all
  const { count: yesterdayResults } = await supabase
    .from('nba_dfs_nightly_results')
    .select('id', { count: 'exact', head: true })
    .eq('game_date', yesterdayStr)
    .eq('season', season)

  const { count: yesterdayWinners } = await supabase
    .from('nba_dfs_nightly_results')
    .select('id', { count: 'exact', head: true })
    .eq('game_date', yesterdayStr)
    .eq('season', season)
    .eq('is_night_winner', true)

  // Re-score yesterday if no results OR results exist but no winner was set (allFinal was false)
  if (!yesterdayResults || yesterdayResults === 0 || !yesterdayWinners) {
    const yester = await fetchCompletedGameStats(yesterdayStr)
    if (yester.playerStats.length > 0) {
      await upsertPlayerStats(yester.playerStats, yesterdayStr, season)
      await scoreRosters(yesterdayStr, season, yester.allFinal)
      await scoreThreePointPicks(yesterdayStr)
      logger.info({ date: yesterdayStr, players: yester.playerStats.length, allFinal: yester.allFinal }, 'Scored yesterday NBA DFS games')
    }
    if (yester.allFinal) {
      await cleanupSingleNightNoRosters(yesterdayStr, season, true)
    }
  }

  // Check for any older unfinalized dates (rosters exist but no winner set)
  const { data: unfinalizedDates } = await supabase
    .from('nba_dfs_rosters')
    .select('game_date')
    .eq('season', season)
    .lt('game_date', yesterdayStr)

  if (unfinalizedDates?.length) {
    const uniqueDates = [...new Set(unfinalizedDates.map((r) => r.game_date))]
    for (const d of uniqueDates) {
      // Check if this date already has a winner
      const { count: winnerCount } = await supabase
        .from('nba_dfs_nightly_results')
        .select('id', { count: 'exact', head: true })
        .eq('game_date', d)
        .eq('season', season)
        .eq('is_night_winner', true)

      if (winnerCount) continue // Already finalized

      const older = await fetchCompletedGameStats(d)
      if (older.playerStats.length > 0) {
        await upsertPlayerStats(older.playerStats, d, season)
        await scoreRosters(d, season, older.allFinal)
        await scoreThreePointPicks(d)
        logger.info({ date: d, players: older.playerStats.length, allFinal: older.allFinal }, 'Scored older unfinalized NBA DFS games')
      }
      if (older.allFinal) {
        await cleanupSingleNightNoRosters(d, season, true)
      }
    }
  }
}
