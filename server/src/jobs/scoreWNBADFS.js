import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from '../services/notificationService.js'
import { calculateWNBAFantasyPoints, generateWNBASalaries } from '../services/wnbaDfsService.js'
import { todaySportsDay, tomorrowSportsDay, yesterdaySportsDay } from '../utils/sportsDay.js'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'

async function wnbaSalariesAreStale(date, season) {
  const { count: existing } = await supabase
    .from('wnba_dfs_salaries')
    .select('id', { count: 'exact', head: true })
    .eq('game_date', date)
    .eq('season', season)
  if (!existing || existing === 0) return true

  let espnEvents = []
  try {
    const dateStr = date.replace(/-/g, '')
    const res = await fetch(`${ESPN_BASE}/basketball/wnba/scoreboard?dates=${dateStr}`)
    if (!res.ok) return false
    const data = await res.json()
    espnEvents = data.events || []
  } catch (_) {
    return false
  }
  if (espnEvents.length === 0) return false

  const { data: rows } = await supabase
    .from('wnba_dfs_salaries')
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

export async function fetchCompletedWNBAGameStats(date) {
  const dateStr = date.replace(/-/g, '')
  let events
  try {
    const res = await fetch(`${ESPN_BASE}/basketball/wnba/scoreboard?dates=${dateStr}`)
    if (!res.ok) throw new Error(`ESPN returned ${res.status}`)
    const data = await res.json()
    events = data.events || []
  } catch (err) {
    logger.error({ err, date }, 'Failed to fetch ESPN WNBA scoreboard for DFS scoring')
    return { playerStats: [], allFinal: false, hasGames: false }
  }

  if (!events.length) return { playerStats: [], allFinal: true, hasGames: false }

  let allFinal = true
  const playerStats = []

  for (const event of events) {
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

      const gameId = event.id
      let boxScore
      try {
        const res = await fetch(`${ESPN_BASE}/basketball/wnba/summary?event=${gameId}`)
        if (!res.ok) {
          logger.warn({ gameId, status: res.status, date }, 'ESPN summary returned non-OK, skipping game')
          continue
        }
        boxScore = await res.json()
      } catch (err) {
        logger.warn({ err, gameId, date }, 'ESPN summary fetch threw, skipping game')
        continue
      }

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

            const mins = statMap['MIN'] || '0'
            const minsPlayed = parseInt(mins) || 0
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
      logger.error({ err, gameId: event?.id, date }, 'WNBA box-score processing threw for game, skipping')
      continue
    }
  }

  return { playerStats, allFinal, hasGames: true }
}

async function upsertPlayerStats(playerStats, date, season) {
  if (!playerStats.length) return

  const rows = playerStats.map((p) => ({
    espn_player_id: p.espnPlayerId,
    player_name: p.playerName,
    game_date: date,
    season,
    ...p.stats,
    fantasy_points: calculateWNBAFantasyPoints(p.stats),
    updated_at: new Date().toISOString(),
  }))

  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('wnba_dfs_player_stats')
      .upsert(chunk, { onConflict: 'espn_player_id,game_date,season' })

    if (error) logger.error({ error, offset: i }, 'Failed to upsert WNBA DFS player stats')
  }

  logger.info({ count: rows.length, date }, 'Upserted WNBA DFS player stats')
}

async function scoreRosters(date, season, allFinal = false) {
  const { data: stats } = await supabase
    .from('wnba_dfs_player_stats')
    .select('espn_player_id, fantasy_points')
    .eq('game_date', date)
    .eq('season', season)

  if (!stats?.length) return

  const statsMap = {}
  for (const s of stats) statsMap[s.espn_player_id] = Number(s.fantasy_points)

  const { data: rosters } = await supabase
    .from('wnba_dfs_rosters')
    .select('id, league_id, user_id, wnba_dfs_roster_slots(id, espn_player_id)')
    .eq('game_date', date)
    .eq('season', season)

  if (!rosters?.length) return

  for (const roster of rosters) {
    let rosterTotal = 0
    for (const slot of roster.wnba_dfs_roster_slots || []) {
      const pts = statsMap[slot.espn_player_id] || 0
      rosterTotal += pts
      await supabase
        .from('wnba_dfs_roster_slots')
        .update({ points_earned: pts })
        .eq('id', slot.id)
    }
    await supabase
      .from('wnba_dfs_rosters')
      .update({ total_points: rosterTotal })
      .eq('id', roster.id)
  }

  const leagueRosters = {}
  for (const r of rosters) {
    if (!leagueRosters[r.league_id]) leagueRosters[r.league_id] = []
    const total = (r.wnba_dfs_roster_slots || []).reduce((sum, s) => sum + (statsMap[s.espn_player_id] || 0), 0)
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
      .from('wnba_dfs_nightly_results')
      .upsert(results, { onConflict: 'league_id,user_id,game_date,season' })

    if (error) logger.error({ error, leagueId, date }, 'Failed to upsert WNBA DFS nightly results')
  }

  logger.info({ rosters: rosters.length, date, allFinal }, 'Scored WNBA DFS rosters')
}

async function cleanupSingleNightNoRosters(date, season, allFinal) {
  if (!allFinal) return

  // Single-night WNBA DFS leagues are created with seasonType='custom_range'
  // pointing the end date at the start date. Match leagues whose duration
  // is custom_range AND whose start date is this scoring date.
  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name, starts_at, duration')
    .eq('format', 'wnba_dfs')
    .in('status', ['open', 'active'])

  if (!leagues?.length) return

  for (const league of leagues) {
    if (league.duration !== 'custom_range') continue

    const leagueStart = league.starts_at ? new Date(league.starts_at).toISOString().split('T')[0] : null
    if (leagueStart !== date) continue

    const { data: members } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', league.id)

    if (!members?.length) continue

    const { data: rosters } = await supabase
      .from('wnba_dfs_rosters')
      .select('user_id')
      .eq('league_id', league.id)
      .eq('game_date', date)
      .eq('season', season)

    const rosterUserIds = new Set((rosters || []).map((r) => r.user_id))
    const noRosterMembers = members.filter((m) => !rosterUserIds.has(m.user_id))

    for (const member of noRosterMembers) {
      await supabase
        .from('league_members')
        .delete()
        .eq('league_id', league.id)
        .eq('user_id', member.user_id)

      await createNotification(member.user_id, 'league_update',
        `You didn't submit a roster in time for ${league.name}. Catch the next one!`,
        { leagueId: league.id })

      logger.info({ userId: member.user_id, leagueId: league.id, date }, 'Removed member from single-night WNBA DFS league (no roster)')
    }
  }
}

async function tightenJoinLocks() {
  // Only tighten OPEN leagues. Once active, joins_locked_at is set in
  // stone — re-aligning to "next first tipoff" on day 2 would push the
  // lock to tomorrow, and the open/active flip cron in completeLeagues
  // would demote the league back to 'open'. Same bug fix as
  // tightenWnbaThreePointJoinLocks in wnbaThreePointService.
  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, starts_at, joins_locked_at')
    .eq('format', 'wnba_dfs')
    .eq('status', 'open')

  if (!leagues?.length) return

  for (const league of leagues) {
    if (!league.starts_at) continue
    const startDate = new Date(league.starts_at).toISOString().split('T')[0]

    const { data: firstGame } = await supabase
      .from('wnba_dfs_salaries')
      .select('game_starts_at')
      .eq('game_date', startDate)
      .not('game_starts_at', 'is', null)
      .order('game_starts_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!firstGame?.game_starts_at) continue

    const tipOff = new Date(firstGame.game_starts_at)
    const currentLock = league.joins_locked_at ? new Date(league.joins_locked_at) : null
    // Always align joins_locked_at to first tipoff once we know it.
    // create-league sets a placeholder DATE (midnight UTC) which lands
    // before the actual tipoff, so we have to push FORWARD too — not
    // just pull back. Skip only if already exactly aligned.
    if (!currentLock || currentLock.getTime() !== tipOff.getTime()) {
      await supabase
        .from('leagues')
        .update({ joins_locked_at: tipOff.toISOString() })
        .eq('id', league.id)

      logger.info({ leagueId: league.id, tipOff: tipOff.toISOString() }, 'Aligned WNBA DFS joins_locked_at to first tipoff')
    }
  }
}

export async function scoreWNBADFS() {
  const today = todaySportsDay()
  const season = 2026

  if (await wnbaSalariesAreStale(today, season)) {
    try {
      await generateWNBASalaries(today, season)
    } catch (err) {
      logger.error({ err }, 'Failed to generate WNBA DFS salaries')
    }
  }

  const tomorrow = tomorrowSportsDay()
  if (await wnbaSalariesAreStale(tomorrow, season)) {
    try {
      await generateWNBASalaries(tomorrow, season)
    } catch (err) {
      logger.error({ err }, 'Failed to generate tomorrow WNBA DFS salaries')
    }
  }

  await tightenJoinLocks()

  const { playerStats, allFinal, hasGames } = await fetchCompletedWNBAGameStats(today)

  if (!hasGames) {
    logger.debug({ date: today }, 'No WNBA games today for DFS scoring')
    return
  }

  if (playerStats.length > 0) {
    await upsertPlayerStats(playerStats, today, season)
    await scoreRosters(today, season, allFinal)
    logger.info({ date: today, players: playerStats.length, allFinal }, 'WNBA DFS scoring pass complete')
  }

  if (allFinal) {
    await cleanupSingleNightNoRosters(today, season, true)
  }

  const yesterdayStr = yesterdaySportsDay()

  const { count: yesterdayResults } = await supabase
    .from('wnba_dfs_nightly_results')
    .select('id', { count: 'exact', head: true })
    .eq('game_date', yesterdayStr)
    .eq('season', season)

  const { count: yesterdayWinners } = await supabase
    .from('wnba_dfs_nightly_results')
    .select('id', { count: 'exact', head: true })
    .eq('game_date', yesterdayStr)
    .eq('season', season)
    .eq('is_night_winner', true)

  if (!yesterdayResults || yesterdayResults === 0 || !yesterdayWinners) {
    const yester = await fetchCompletedWNBAGameStats(yesterdayStr)
    if (yester.playerStats.length > 0) {
      await upsertPlayerStats(yester.playerStats, yesterdayStr, season)
      await scoreRosters(yesterdayStr, season, yester.allFinal)
      logger.info({ date: yesterdayStr, players: yester.playerStats.length, allFinal: yester.allFinal }, 'Scored yesterday WNBA DFS games')
    }
    if (yester.allFinal) {
      await cleanupSingleNightNoRosters(yesterdayStr, season, true)
    }
  }
}
