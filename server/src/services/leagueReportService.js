import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

const MIN_CONTEST_DAYS = 10

/**
 * Generate a League Activity Report for a completed DFS league.
 * Returns null if the league doesn't qualify (< 10 contest days).
 */
export async function generateLeagueReport(league) {
  const format = league.format
  const leagueId = league.id

  logger.info({ leagueId, format }, 'Generating league activity report')

  try {
    if (format === 'nba_dfs') return await generateNbaReport(leagueId)
    if (format === 'mlb_dfs') return await generateMlbReport(leagueId)
    // NFL DFS is format='fantasy' with fantasy_settings.format='salary_cap'
    // Skip for now — NFL season hasn't started
    return null
  } catch (err) {
    logger.error({ err, leagueId }, 'Failed to generate league report')
    return null
  }
}

async function generateNbaReport(leagueId) {
  // Get all rosters with slots
  const { data: rosters } = await supabase
    .from('nba_dfs_rosters')
    .select('id, user_id, game_date, total_points, nba_dfs_roster_slots(player_name, espn_player_id, salary, points_earned, roster_slot)')
    .eq('league_id', leagueId)

  if (!rosters?.length) return null

  const contestDays = [...new Set(rosters.map((r) => r.game_date))]
  if (contestDays.length < MIN_CONTEST_DAYS) {
    logger.info({ leagueId, days: contestDays.length }, 'Not enough contest days for report')
    return null
  }

  // Fetch headshots (most recent per player)
  const allEspnIds = [...new Set(rosters.flatMap((r) => (r.nba_dfs_roster_slots || []).map((s) => s.espn_player_id).filter(Boolean)))]
  const headshotMap = await fetchNbaHeadshots(allEspnIds, contestDays)

  // Fetch nightly results for win tracking
  const { data: nightlyResults } = await supabase
    .from('nba_dfs_nightly_results')
    .select('user_id, game_date, total_points, night_rank, is_night_winner')
    .eq('league_id', leagueId)

  // Fetch user info
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)

  const userMap = {}
  for (const m of members || []) {
    userMap[m.user_id] = m.users
  }

  const report = buildReport(rosters, headshotMap, nightlyResults || [], userMap, contestDays)

  // Store report
  const { error } = await supabase
    .from('dfs_league_reports')
    .upsert({ league_id: leagueId, report_data: report, generated_at: new Date().toISOString() }, { onConflict: 'league_id' })

  if (error) {
    logger.error({ error, leagueId }, 'Failed to store league report')
    return null
  }

  logger.info({ leagueId, contestDays: contestDays.length }, 'League report generated')
  return report
}

async function generateMlbReport(leagueId) {
  const { data: rosters } = await supabase
    .from('mlb_dfs_rosters')
    .select('id, user_id, game_date, total_points, mlb_dfs_roster_slots(player_name, espn_player_id, salary, points_earned, roster_slot)')
    .eq('league_id', leagueId)

  if (!rosters?.length) return null

  const contestDays = [...new Set(rosters.map((r) => r.game_date))]
  if (contestDays.length < MIN_CONTEST_DAYS) {
    logger.info({ leagueId, days: contestDays.length }, 'Not enough contest days for report')
    return null
  }

  const allEspnIds = [...new Set(rosters.flatMap((r) => (r.mlb_dfs_roster_slots || []).map((s) => s.espn_player_id).filter(Boolean)))]
  const headshotMap = await fetchMlbHeadshots(allEspnIds, contestDays)

  const { data: nightlyResults } = await supabase
    .from('mlb_dfs_nightly_results')
    .select('user_id, game_date, total_points, night_rank, is_night_winner')
    .eq('league_id', leagueId)

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)

  const userMap = {}
  for (const m of members || []) {
    userMap[m.user_id] = m.users
  }

  const slotsKey = 'mlb_dfs_roster_slots'
  const report = buildReport(rosters, headshotMap, nightlyResults || [], userMap, contestDays, slotsKey)

  const { error } = await supabase
    .from('dfs_league_reports')
    .upsert({ league_id: leagueId, report_data: report, generated_at: new Date().toISOString() }, { onConflict: 'league_id' })

  if (error) {
    logger.error({ error, leagueId }, 'Failed to store MLB league report')
    return null
  }

  logger.info({ leagueId, contestDays: contestDays.length }, 'MLB league report generated')
  return report
}

function buildReport(rosters, headshotMap, nightlyResults, userMap, contestDays, slotsKey = 'nba_dfs_roster_slots') {
  // Flatten all slot appearances: { userId, playerName, espnId, salary, points, date }
  const allSlots = []
  for (const roster of rosters) {
    for (const slot of roster[slotsKey] || []) {
      allSlots.push({
        userId: roster.user_id,
        playerName: slot.player_name,
        espnId: slot.espn_player_id,
        salary: slot.salary || 0,
        points: Number(slot.points_earned) || 0,
        date: roster.game_date,
        rosterSlot: slot.roster_slot,
      })
    }
  }

  // === Per-user reports ===
  const userReports = {}
  const userIds = [...new Set(allSlots.map((s) => s.userId))]

  for (const userId of userIds) {
    const userSlots = allSlots.filter((s) => s.userId === userId)
    const user = userMap[userId]

    // Most played players
    const playerCounts = {}
    for (const s of userSlots) {
      const key = s.espnId || s.playerName
      if (!playerCounts[key]) playerCounts[key] = { playerName: s.playerName, espnId: s.espnId, count: 0, totalPoints: 0 }
      playerCounts[key].count++
      playerCounts[key].totalPoints += s.points
    }
    const mostPlayed = Object.values(playerCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((p) => ({
        playerName: p.playerName,
        headshot: headshotMap[p.espnId] || null,
        timesRostered: p.count,
        avgPoints: p.count > 0 ? Math.round(p.totalPoints / p.count * 10) / 10 : 0,
      }))

    // Best value plays (points per $1000 salary, min $3000 salary)
    const valuePlays = userSlots
      .filter((s) => s.salary >= 3000 && s.points > 0)
      .map((s) => ({
        playerName: s.playerName,
        headshot: headshotMap[s.espnId] || null,
        salary: s.salary,
        points: s.points,
        value: Math.round(s.points / s.salary * 10000) / 10,
        date: s.date,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)

    // Pick of the year (single best value play)
    const pickOfTheYear = valuePlays[0] || null

    // Worst investments (high salary, low points)
    const busts = userSlots
      .filter((s) => s.salary >= 6000 && s.points >= 0)
      .map((s) => ({
        playerName: s.playerName,
        headshot: headshotMap[s.espnId] || null,
        salary: s.salary,
        points: s.points,
        value: s.salary > 0 ? Math.round(s.points / s.salary * 10000) / 10 : 0,
        date: s.date,
      }))
      .sort((a, b) => a.value - b.value)
      .slice(0, 3)

    // Unique players rostered
    const uniquePlayers = new Set(userSlots.map((s) => s.espnId || s.playerName)).size

    // Position spending
    const positionSpend = {}
    for (const s of userSlots) {
      const pos = s.rosterSlot.replace(/\d+$/, '')
      positionSpend[pos] = (positionSpend[pos] || 0) + s.salary
    }
    const favoritePosition = Object.entries(positionSpend).sort((a, b) => b[1] - a[1])[0]

    // Season totals
    const totalSalary = userSlots.reduce((sum, s) => sum + s.salary, 0)
    const totalPoints = userSlots.reduce((sum, s) => sum + s.points, 0)
    const userNightlyResults = nightlyResults.filter((r) => r.user_id === userId)
    const wins = userNightlyResults.filter((r) => r.is_night_winner).length

    // Best single night
    const userRosters = rosters.filter((r) => r.user_id === userId)
    const bestNight = userRosters.sort((a, b) => (Number(b.total_points) || 0) - (Number(a.total_points) || 0))[0]

    // Win streak
    const winDates = new Set(userNightlyResults.filter((r) => r.is_night_winner).map((r) => r.game_date))
    const sortedDays = [...contestDays].sort()
    let maxStreak = 0, currentStreak = 0
    for (const day of sortedDays) {
      if (winDates.has(day)) { currentStreak++; maxStreak = Math.max(maxStreak, currentStreak) }
      else currentStreak = 0
    }

    userReports[userId] = {
      user: {
        id: userId,
        username: user?.username,
        displayName: user?.display_name || user?.username,
        avatarUrl: user?.avatar_url,
        avatarEmoji: user?.avatar_emoji,
      },
      mostPlayed,
      pickOfTheYear,
      bestValuePlays: valuePlays,
      worstInvestments: busts,
      uniquePlayersRostered: uniquePlayers,
      favoritePosition: favoritePosition ? { position: favoritePosition[0], totalSpent: favoritePosition[1] } : null,
      seasonStats: {
        totalSalarySpent: totalSalary,
        totalPointsScored: Math.round(totalPoints * 10) / 10,
        contestDaysPlayed: userRosters.length,
        avgPointsPerNight: userRosters.length > 0 ? Math.round(totalPoints / userRosters.length * 10) / 10 : 0,
        wins,
        longestWinStreak: maxStreak,
        bestNight: bestNight ? { date: bestNight.game_date, points: Number(bestNight.total_points) || 0 } : null,
      },
    }
  }

  return {
    contestDays: contestDays.length,
    generatedAt: new Date().toISOString(),
    users: userReports,
  }
}

async function fetchNbaHeadshots(espnIds, dates) {
  if (!espnIds.length) return {}
  const latestDate = dates.sort().pop()
  const { data } = await supabase
    .from('nba_dfs_salaries')
    .select('espn_player_id, headshot_url')
    .in('espn_player_id', espnIds)
    .eq('game_date', latestDate)

  const map = {}
  for (const row of data || []) {
    if (row.headshot_url) map[row.espn_player_id] = row.headshot_url
  }

  // Backfill from earlier dates if needed
  const missing = espnIds.filter((id) => !map[id])
  if (missing.length) {
    const { data: older } = await supabase
      .from('nba_dfs_salaries')
      .select('espn_player_id, headshot_url')
      .in('espn_player_id', missing)
      .not('headshot_url', 'is', null)
      .order('game_date', { ascending: false })
      .limit(missing.length)

    for (const row of older || []) {
      if (row.headshot_url && !map[row.espn_player_id]) map[row.espn_player_id] = row.headshot_url
    }
  }

  return map
}

async function fetchMlbHeadshots(espnIds, dates) {
  if (!espnIds.length) return {}
  const latestDate = dates.sort().pop()
  const { data } = await supabase
    .from('mlb_dfs_salaries')
    .select('espn_player_id, headshot_url')
    .in('espn_player_id', espnIds)
    .eq('game_date', latestDate)

  const map = {}
  for (const row of data || []) {
    if (row.headshot_url) map[row.espn_player_id] = row.headshot_url
  }

  const missing = espnIds.filter((id) => !map[id])
  if (missing.length) {
    const { data: older } = await supabase
      .from('mlb_dfs_salaries')
      .select('espn_player_id, headshot_url')
      .in('espn_player_id', missing)
      .not('headshot_url', 'is', null)
      .order('game_date', { ascending: false })
      .limit(missing.length)

    for (const row of older || []) {
      if (row.headshot_url && !map[row.espn_player_id]) map[row.espn_player_id] = row.headshot_url
    }
  }

  return map
}
