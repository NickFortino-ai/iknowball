import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { generateMLBSalaries } from '../services/mlbDfsService.js'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'

function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

/**
 * MLB DFS fantasy points formula (batters):
 * Single: 3, Double: 5, Triple: 8, HR: 10
 * RBI: 2, Run: 2, Walk: 2, SB: 5, Strikeout: -0.5
 */
function calculateMLBBatterPoints(stats) {
  const singles = Math.max(0, (stats.hits || 0) - (stats.doubles || 0) - (stats.triples || 0) - (stats.home_runs || 0))
  return singles * 3
    + (stats.doubles || 0) * 5
    + (stats.triples || 0) * 8
    + (stats.home_runs || 0) * 10
    + (stats.rbis || 0) * 2
    + (stats.runs || 0) * 2
    + (stats.walks || 0) * 2
    + (stats.stolen_bases || 0) * 5
    - (stats.strikeouts || 0) * 0.5
}

/**
 * MLB DFS fantasy points formula (pitchers):
 * IP: 3 per inning, K: 2, W: 5, SV: 5, ER: -2, BB: -0.5, H: -0.5
 */
function calculateMLBPitcherPoints(stats) {
  return (stats.innings_pitched || 0) * 3
    + (stats.strikeouts || 0) * 2
    + (stats.wins || 0) * 5
    + (stats.saves || 0) * 5
    - (stats.earned_runs || 0) * 2
    - (stats.walks || 0) * 0.5
    - (stats.hits_allowed || 0) * 0.5
}

function calculateMLBFantasyPoints(stats) {
  if (stats.is_pitcher) return calculateMLBPitcherPoints(stats)
  return calculateMLBBatterPoints(stats)
}

/**
 * Fetch player box score stats from ESPN for MLB games on a given date.
 */
async function fetchCompletedGameStats(date) {
  const dateStr = date.replace(/-/g, '')
  let events
  try {
    const res = await fetch(`${ESPN_BASE}/baseball/mlb/scoreboard?dates=${dateStr}`)
    if (!res.ok) throw new Error(`ESPN returned ${res.status}`)
    const data = await res.json()
    events = data.events || []
  } catch (err) {
    logger.error({ err, date }, 'Failed to fetch ESPN MLB scoreboard for DFS scoring')
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
    const isLive = ['STATUS_IN_PROGRESS', 'STATUS_END_PERIOD'].includes(statusType)

    if (!isFinal && !isLive) {
      allFinal = false
      continue
    }
    if (!isFinal) allFinal = false

    // Fetch box score
    const gameId = event.id
    let boxScore
    try {
      const res = await fetch(`${ESPN_BASE}/baseball/mlb/summary?event=${gameId}`)
      if (!res.ok) continue
      boxScore = await res.json()
    } catch {
      continue
    }

    // Extract batting + pitching stats from box score
    for (const team of boxScore.boxscore?.players || []) {
      for (const statGroup of team.statistics || []) {
        const headers = statGroup.labels || []

        const isBattingGroup = statGroup.name === 'batting' || headers.includes('AB')
        const isPitchingGroup = statGroup.name === 'pitching' || headers.includes('IP')

        if (isBattingGroup) {
          for (const athlete of statGroup.athletes || []) {
            const espnId = athlete.athlete?.id
            const name = athlete.athlete?.displayName
            if (!espnId || !name) continue

            const rawStats = athlete.stats || []
            const statMap = {}
            headers.forEach((h, i) => { statMap[h] = rawStats[i] })

            const ab = parseInt(statMap['AB']) || 0
            if (ab === 0 && !statMap['AB']) continue

            playerStats.push({
              espnPlayerId: espnId,
              playerName: name,
              stats: {
                at_bats: ab,
                hits: parseInt(statMap['H']) || 0,
                runs: parseInt(statMap['R']) || 0,
                home_runs: parseInt(statMap['HR']) || 0,
                rbis: parseInt(statMap['RBI']) || 0,
                stolen_bases: parseInt(statMap['SB']) || 0,
                walks: parseInt(statMap['BB']) || 0,
                strikeouts: parseInt(statMap['K'] || statMap['SO']) || 0,
                doubles: parseInt(statMap['2B']) || 0,
                triples: parseInt(statMap['3B']) || 0,
                total_bases: parseInt(statMap['TB']) || 0,
                is_pitcher: false,
              },
            })
          }
        }

        if (isPitchingGroup) {
          for (const athlete of statGroup.athletes || []) {
            const espnId = athlete.athlete?.id
            const name = athlete.athlete?.displayName
            if (!espnId || !name) continue

            const rawStats = athlete.stats || []
            const statMap = {}
            headers.forEach((h, i) => { statMap[h] = rawStats[i] })

            const ip = parseFloat(statMap['IP']) || 0
            if (ip === 0) continue

            playerStats.push({
              espnPlayerId: espnId,
              playerName: name,
              stats: {
                innings_pitched: ip,
                hits_allowed: parseInt(statMap['H']) || 0,
                earned_runs: parseInt(statMap['ER']) || 0,
                walks: parseInt(statMap['BB']) || 0,
                strikeouts: parseInt(statMap['K'] || statMap['SO']) || 0,
                wins: parseInt(statMap['W']) || 0,
                losses: parseInt(statMap['L']) || 0,
                saves: parseInt(statMap['SV']) || 0,
                is_pitcher: true,
              },
            })
          }
        }
      }
    }
  }

  return { playerStats, allFinal, hasGames: true }
}

/**
 * Store MLB player stats and calculate fantasy points.
 */
async function upsertPlayerStats(playerStats, date, season) {
  if (!playerStats.length) return

  // Deduplicate by espn_player_id — keep the last entry (most complete stats)
  const deduped = new Map()
  for (const p of playerStats) {
    deduped.set(p.espnPlayerId, p)
  }

  const rows = [...deduped.values()].map((p) => {
    const s = p.stats
    return {
      espn_player_id: p.espnPlayerId,
      player_name: p.playerName,
      game_date: date,
      season,
      is_pitcher: s.is_pitcher || false,
      // Batting fields (0 for pitchers)
      at_bats: s.at_bats || 0,
      hits: s.hits || 0,
      runs: s.runs || 0,
      home_runs: s.home_runs || 0,
      rbis: s.rbis || 0,
      stolen_bases: s.stolen_bases || 0,
      walks: s.walks || 0,
      strikeouts: s.strikeouts || 0,
      doubles: s.doubles || 0,
      triples: s.triples || 0,
      total_bases: s.total_bases || 0,
      // Pitching fields (0 for batters)
      innings_pitched: s.innings_pitched || 0,
      hits_allowed: s.hits_allowed || 0,
      earned_runs: s.earned_runs || 0,
      wins: s.wins || 0,
      losses: s.losses || 0,
      saves: s.saves || 0,
      fantasy_points: calculateMLBFantasyPoints(s),
      updated_at: new Date().toISOString(),
    }
  })

  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('mlb_dfs_player_stats')
      .upsert(chunk, { onConflict: 'espn_player_id,game_date,season' })

    if (error) logger.error({ error, offset: i }, 'Failed to upsert MLB DFS player stats')
  }

  logger.info({ count: rows.length, date }, 'Upserted MLB DFS player stats')
}

/**
 * Score all MLB DFS rosters for the given date.
 */
async function scoreRosters(date, season, allFinal = false) {
  const { data: stats } = await supabase
    .from('mlb_dfs_player_stats')
    .select('espn_player_id, fantasy_points')
    .eq('game_date', date)
    .eq('season', season)

  if (!stats?.length) return

  const statsMap = {}
  for (const s of stats) {
    statsMap[s.espn_player_id] = Number(s.fantasy_points)
  }

  const { data: rosters } = await supabase
    .from('mlb_dfs_rosters')
    .select('id, league_id, user_id, mlb_dfs_roster_slots(id, espn_player_id)')
    .eq('game_date', date)
    .eq('season', season)

  if (!rosters?.length) return

  for (const roster of rosters) {
    let rosterTotal = 0
    for (const slot of roster.mlb_dfs_roster_slots || []) {
      const pts = statsMap[slot.espn_player_id] || 0
      rosterTotal += pts
      await supabase
        .from('mlb_dfs_roster_slots')
        .update({ points_earned: pts })
        .eq('id', slot.id)
    }

    await supabase
      .from('mlb_dfs_rosters')
      .update({ total_points: rosterTotal })
      .eq('id', roster.id)
  }

  // Aggregate nightly results per league
  const leagueRosters = {}
  for (const r of rosters) {
    if (!leagueRosters[r.league_id]) leagueRosters[r.league_id] = []
    const total = (r.mlb_dfs_roster_slots || []).reduce((sum, s) => sum + (statsMap[s.espn_player_id] || 0), 0)
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
      .from('mlb_dfs_nightly_results')
      .upsert(results, { onConflict: 'league_id,user_id,game_date,season' })

    if (error) logger.error({ error, leagueId, date }, 'Failed to upsert MLB DFS nightly results')
  }

  logger.info({ rosters: rosters.length, date }, 'Scored MLB DFS rosters')
}

/**
 * Tighten joins_locked_at for MLB DFS leagues to the first pitch of their start date.
 */
async function tightenMLBJoinLocks() {
  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, starts_at, joins_locked_at')
    .eq('format', 'mlb_dfs')
    .in('status', ['open', 'active'])

  if (!leagues?.length) return

  for (const league of leagues) {
    if (!league.starts_at) continue
    const startDate = new Date(league.starts_at).toISOString().split('T')[0]

    const { data: firstGame } = await supabase
      .from('mlb_dfs_salaries')
      .select('game_starts_at')
      .eq('game_date', startDate)
      .not('game_starts_at', 'is', null)
      .order('game_starts_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!firstGame?.game_starts_at) continue

    const firstPitch = new Date(firstGame.game_starts_at)
    const currentLock = league.joins_locked_at ? new Date(league.joins_locked_at) : null
    if (!currentLock || currentLock > firstPitch) {
      await supabase
        .from('leagues')
        .update({ joins_locked_at: firstPitch.toISOString() })
        .eq('id', league.id)

      logger.info({ leagueId: league.id, firstPitch: firstPitch.toISOString() }, 'Tightened MLB DFS joins_locked_at to first pitch')
    }
  }
}

/**
 * Main job: generate MLB salaries for today/tomorrow, score games.
 */
export async function scoreMLBDFS() {
  const today = todayET()
  const season = 2026

  // Generate salaries for today if not done
  const { count: existingSalaries } = await supabase
    .from('mlb_dfs_salaries')
    .select('id', { count: 'exact', head: true })
    .eq('game_date', today)
    .eq('season', season)

  if (!existingSalaries || existingSalaries === 0) {
    try {
      await generateMLBSalaries(today, season)
    } catch (err) {
      logger.error({ err }, 'Failed to generate MLB DFS salaries')
    }
  }

  // Generate tomorrow's salaries
  const tomorrowDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrow = tomorrowDate.toISOString().split('T')[0]

  const { count: tomorrowSalaries } = await supabase
    .from('mlb_dfs_salaries')
    .select('id', { count: 'exact', head: true })
    .eq('game_date', tomorrow)
    .eq('season', season)

  if (!tomorrowSalaries || tomorrowSalaries === 0) {
    try {
      await generateMLBSalaries(tomorrow, season)
    } catch (err) {
      logger.error({ err }, 'Failed to generate tomorrow MLB DFS salaries')
    }
  }

  // Tighten join locks to first pitch once salaries exist
  await tightenMLBJoinLocks()

  // Score today's games
  const { playerStats, allFinal, hasGames } = await fetchCompletedGameStats(today)

  if (!hasGames) {
    logger.debug({ date: today }, 'No MLB games today for DFS scoring')
    return
  }

  if (playerStats.length > 0) {
    await upsertPlayerStats(playerStats, today, season)
    await scoreRosters(today, season, allFinal)
    logger.info({ date: today, players: playerStats.length, allFinal }, 'MLB DFS scoring pass complete')
  }

  // Check yesterday for late games — re-score if no winner has been awarded yet
  const yesterday = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const { count: yesterdayWinners } = await supabase
    .from('mlb_dfs_nightly_results')
    .select('id', { count: 'exact', head: true })
    .eq('game_date', yesterdayStr)
    .eq('season', season)
    .eq('is_night_winner', true)

  if (!yesterdayWinners || yesterdayWinners === 0) {
    const yester = await fetchCompletedGameStats(yesterdayStr)
    if (yester.playerStats.length > 0) {
      await upsertPlayerStats(yester.playerStats, yesterdayStr, season)
      await scoreRosters(yesterdayStr, season, yester.allFinal)
      logger.info({ date: yesterdayStr, players: yester.playerStats.length, allFinal: yester.allFinal }, 'Scored yesterday MLB DFS games')
    }
  }
}
