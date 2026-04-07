import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

const MIN_CONTEST_DAYS = 10
const MIN_NFL_WEEKS = 6

/**
 * Generate a League Activity Report for a completed DFS league.
 * Returns null if the league doesn't qualify.
 */
export async function generateLeagueReport(league) {
  const format = league.format
  const leagueId = league.id

  logger.info({ leagueId, format }, 'Generating league activity report')

  try {
    if (format === 'nba_dfs') return await generateNbaReport(leagueId)
    if (format === 'mlb_dfs') return await generateMlbReport(leagueId)
    if (format === 'fantasy') {
      // NFL salary cap (DFS-style weekly contest)
      const { data: fs } = await supabase
        .from('fantasy_settings')
        .select('format')
        .eq('league_id', leagueId)
        .single()
      if (fs?.format === 'salary_cap') return await generateNflSalaryCapReport(leagueId)
      return null
    }
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
    const pickOfTheYearRaw = valuePlays[0] || null
    const pickOfTheYear = pickOfTheYearRaw ? {
      ...pickOfTheYearRaw,
      context: `${pickOfTheYearRaw.points} pts on a $${pickOfTheYearRaw.salary.toLocaleString()} salary — best value play of the season.`,
    } : null

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

  // === League-wide awards ===
  // Top scorer overall: user with highest total points across the entire league
  const userTotals = userIds.map((uid) => ({
    userId: uid,
    user: userReports[uid].user,
    totalPoints: userReports[uid].seasonStats.totalPointsScored,
  })).sort((a, b) => b.totalPoints - a.totalPoints)
  const topScorerEntry = userTotals[0] || null
  const topScorer = topScorerEntry ? {
    user: topScorerEntry.user,
    totalPoints: topScorerEntry.totalPoints,
    context: `Posted ${topScorerEntry.totalPoints} points across the season.`,
  } : null

  // Most Rostered Player: the player who appeared on the most rosters across all users (cumulative)
  const playerRosterCounts = {}
  for (const s of allSlots) {
    const key = s.espnId || s.playerName
    if (!playerRosterCounts[key]) {
      playerRosterCounts[key] = {
        playerName: s.playerName,
        espnId: s.espnId,
        timesRostered: 0,
        totalPoints: 0,
      }
    }
    playerRosterCounts[key].timesRostered++
    playerRosterCounts[key].totalPoints += s.points
  }
  const mostRosteredEntry = Object.values(playerRosterCounts)
    .sort((a, b) => b.timesRostered - a.timesRostered)[0]
  const mostRosteredPlayer = mostRosteredEntry ? {
    playerName: mostRosteredEntry.playerName,
    headshot: headshotMap[mostRosteredEntry.espnId] || null,
    timesRostered: mostRosteredEntry.timesRostered,
    totalPoints: Math.round(mostRosteredEntry.totalPoints * 10) / 10,
    context: `Showed up on ${mostRosteredEntry.timesRostered} rosters across the season.`,
  } : null

  // Most Contrarian Pick: highest-scoring single play where exactly ONE user had that
  // player on a given contest day. The lone wolf moment.
  // Group slots by (date, playerKey) → list of userIds
  const dayPlayerMap = {}
  for (const s of allSlots) {
    const playerKey = s.espnId || s.playerName
    const key = `${s.date}|${playerKey}`
    if (!dayPlayerMap[key]) {
      dayPlayerMap[key] = { playerName: s.playerName, espnId: s.espnId, date: s.date, points: s.points, userIds: new Set() }
    }
    dayPlayerMap[key].userIds.add(s.userId)
  }
  const contrarianCandidates = Object.values(dayPlayerMap)
    .filter((entry) => entry.userIds.size === 1 && entry.points > 0)
    .sort((a, b) => b.points - a.points)
  const contrarianTop = contrarianCandidates[0]
  const mostContrarianPick = contrarianTop ? (() => {
    const onlyUserId = [...contrarianTop.userIds][0]
    const onlyUser = userMap[onlyUserId]
    return {
      playerName: contrarianTop.playerName,
      headshot: headshotMap[contrarianTop.espnId] || null,
      date: contrarianTop.date,
      points: Math.round(contrarianTop.points * 10) / 10,
      user: onlyUser ? {
        id: onlyUserId,
        username: onlyUser.username,
        displayName: onlyUser.display_name || onlyUser.username,
        avatarUrl: onlyUser.avatar_url,
        avatarEmoji: onlyUser.avatar_emoji,
      } : null,
      context: `Only ${onlyUser?.display_name || onlyUser?.username || 'this manager'} had them — paid off with ${Math.round(contrarianTop.points * 10) / 10} points.`,
    }
  })() : null

  return {
    contestDays: contestDays.length,
    generatedAt: new Date().toISOString(),
    leagueAwards: {
      topScorer,
      mostRosteredPlayer,
      mostContrarianPick,
    },
    users: userReports,
  }
}

async function generateNflSalaryCapReport(leagueId) {
  // Fetch all rosters with slots and player info (joined for headshots)
  const { data: rosters } = await supabase
    .from('dfs_rosters')
    .select(`
      id, user_id, nfl_week, season, total_points,
      dfs_roster_slots(player_id, salary, points_earned, roster_slot,
        nfl_players(id, full_name, headshot_url, espn_id))
    `)
    .eq('league_id', leagueId)

  if (!rosters?.length) return null

  const contestWeeks = [...new Set(rosters.map((r) => r.nfl_week))]
  if (contestWeeks.length < MIN_NFL_WEEKS) {
    logger.info({ leagueId, weeks: contestWeeks.length }, 'Not enough weeks for NFL salary cap report')
    return null
  }

  // Build per-roster point totals from nfl_player_stats using the league's
  // custom scoring rules (or preset defaults if no rules set).
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('scoring_format, scoring_rules')
    .eq('league_id', leagueId)
    .single()
  const { applyScoringRules, buildScoringRulesFromPreset } = await import('./fantasyService.js')
  const leagueRules = settings?.scoring_rules || buildScoringRulesFromPreset(settings?.scoring_format)

  const allPlayerIds = [...new Set(rosters.flatMap((r) => (r.dfs_roster_slots || []).map((s) => s.player_id)).filter(Boolean))]
  const allWeeks = contestWeeks
  const seasonsArr = [...new Set(rosters.map((r) => r.season))]

  let statsRows = []
  if (allPlayerIds.length) {
    const { data } = await supabase
      .from('nfl_player_stats')
      .select('player_id, week, season, pass_yd, pass_td, pass_int, rush_yd, rush_td, rec, rec_yd, rec_td, fum_lost, two_pt, fgm_0_39, fgm_40_49, fgm_50_plus, xpm, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed')
      .in('player_id', allPlayerIds)
      .in('week', allWeeks)
      .in('season', seasonsArr)
    statsRows = data || []
  }
  const statsMap = {}
  for (const st of statsRows) {
    statsMap[`${st.player_id}|${st.week}|${st.season}`] = applyScoringRules(st, leagueRules)
  }

  // Headshot map (player_id → url)
  const headshotMap = {}
  for (const r of rosters) {
    for (const slot of r.dfs_roster_slots || []) {
      if (slot.nfl_players?.headshot_url && !headshotMap[slot.player_id]) {
        headshotMap[slot.player_id] = slot.nfl_players.headshot_url
      }
    }
  }

  // Weekly results for win tracking
  const { data: weeklyResults } = await supabase
    .from('dfs_weekly_results')
    .select('user_id, nfl_week, total_points, week_rank, is_week_winner')
    .eq('league_id', leagueId)

  // Members
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)
  const userMap = {}
  for (const m of members || []) userMap[m.user_id] = m.users

  // Normalize rosters to the buildReport shape (date = week, espnId = player_id, playerName from nfl_players)
  const normalizedRosters = rosters.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    game_date: r.nfl_week, // reuse field as 'period key'
    total_points: r.total_points,
    nba_dfs_roster_slots: (r.dfs_roster_slots || []).map((slot) => ({
      player_name: slot.nfl_players?.full_name || 'Unknown',
      espn_player_id: slot.player_id, // use player_id as canonical key
      salary: slot.salary,
      points_earned: statsMap[`${slot.player_id}|${r.nfl_week}|${r.season}`] || Number(slot.points_earned) || 0,
      roster_slot: slot.roster_slot,
    })),
  }))

  // Normalize weekly results to the same shape buildReport expects (game_date instead of nfl_week)
  const normalizedNightlyResults = (weeklyResults || []).map((wr) => ({
    user_id: wr.user_id,
    game_date: wr.nfl_week,
    total_points: wr.total_points,
    night_rank: wr.week_rank,
    is_night_winner: wr.is_week_winner,
  }))

  const report = buildReport(normalizedRosters, headshotMap, normalizedNightlyResults, userMap, contestWeeks)
  // Replace contestDays with contestWeeks for clarity in the payload
  report.contestWeeks = report.contestDays
  delete report.contestDays
  report.format = 'nfl_salary_cap'

  const { error } = await supabase
    .from('dfs_league_reports')
    .upsert({ league_id: leagueId, report_data: report, generated_at: new Date().toISOString() }, { onConflict: 'league_id' })

  if (error) {
    logger.error({ error, leagueId }, 'Failed to store NFL salary cap report')
    return null
  }

  logger.info({ leagueId, weeks: contestWeeks.length }, 'NFL salary cap report generated')
  return report
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
