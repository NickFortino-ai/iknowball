import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { fetchAll } from '../utils/fetchAll.js'

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
      return await generateTraditionalFantasyReport(leagueId)
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

// =====================================================================
// TRADITIONAL FANTASY FOOTBALL REPORT
// =====================================================================

async function generateTraditionalFantasyReport(leagueId) {
  const { applyScoringRules, buildScoringRulesFromPreset } = await import('./fantasyService.js')

  // --- Fetch all data in parallel ---
  const [
    settingsRes,
    membersRes,
    matchups,
    draftPicks,
    tradesRes,
    waiverClaims,
  ] = await Promise.all([
    supabase.from('fantasy_settings').select('scoring_format, scoring_rules, season, championship_week, num_teams, draft_order').eq('league_id', leagueId).single(),
    supabase.from('league_members').select('user_id, fantasy_team_name, users(id, username, display_name, avatar_url, avatar_emoji)').eq('league_id', leagueId),
    fetchAll(supabase.from('fantasy_matchups').select('*').eq('league_id', leagueId).eq('status', 'completed').order('week', { ascending: true })),
    fetchAll(supabase.from('fantasy_draft_picks').select('round, pick_number, user_id, player_id, is_auto_pick, nfl_players(id, full_name, position, headshot_url)').eq('league_id', leagueId).order('pick_number', { ascending: true })),
    supabase.from('fantasy_trades').select('id, proposer_user_id, receiver_user_id, status, responded_at, fantasy_trade_items(from_user_id, to_user_id, player_id, nfl_players(id, full_name, position, headshot_url))').eq('league_id', leagueId).eq('status', 'accepted'),
    fetchAll(supabase.from('fantasy_waiver_claims').select('id, user_id, add_player_id, drop_player_id, bid_amount, status, created_at, processed_at, nfl_players:nfl_players!fantasy_waiver_claims_add_player_id_fkey(id, full_name, position, headshot_url)').eq('league_id', leagueId).eq('status', 'awarded')),
  ])

  const settings = settingsRes.data
  if (!settings) return null

  const members = membersRes.data || []
  const trades = tradesRes.data || []

  if (matchups.length < MIN_NFL_WEEKS) {
    logger.info({ leagueId, weeks: new Set(matchups.map((m) => m.week)).size }, 'Not enough weeks for traditional fantasy report')
    return null
  }

  const season = settings.season
  const leagueRules = settings.scoring_rules || buildScoringRulesFromPreset(settings.scoring_format)
  const allWeeks = [...new Set(matchups.map((m) => m.week))].sort((a, b) => a - b)

  // User info map
  const userMap = {}
  const teamNameMap = {}
  for (const m of members) {
    userMap[m.user_id] = m.users
    teamNameMap[m.user_id] = m.fantasy_team_name || null
  }

  function formatUser(userId) {
    const u = userMap[userId]
    return u ? { id: userId, username: u.username, displayName: u.display_name || u.username, avatarUrl: u.avatar_url, avatarEmoji: u.avatar_emoji, fantasyTeamName: teamNameMap[userId] || null } : { id: userId }
  }

  // --- Collect all player IDs we need stats for ---
  const allPlayerIds = new Set()
  for (const p of draftPicks) if (p.player_id) allPlayerIds.add(p.player_id)
  for (const t of trades) for (const item of t.fantasy_trade_items || []) if (item.player_id) allPlayerIds.add(item.player_id)
  for (const w of waiverClaims) if (w.add_player_id) allPlayerIds.add(w.add_player_id)

  // --- Fetch player stats and compute per-player-per-week points ---
  const STAT_COLS = 'player_id, week, season, pass_yd, pass_td, pass_int, rush_yd, rush_td, rec, rec_yd, rec_td, fum_lost, two_pt, fgm_0_39, fgm_40_49, fgm_50_plus, xpm, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed'
  let statsRows = []
  const playerIdArr = [...allPlayerIds]
  const STAT_CHUNK = 100
  for (let i = 0; i < playerIdArr.length; i += STAT_CHUNK) {
    const chunk = playerIdArr.slice(i, i + STAT_CHUNK)
    const { data } = await supabase
      .from('nfl_player_stats')
      .select(STAT_COLS)
      .in('player_id', chunk)
      .eq('season', season)
      .in('week', allWeeks)
    statsRows = statsRows.concat(data || [])
  }

  // playerPoints[playerId][week] = points, playerSeasonTotals[playerId] = total
  const playerPoints = {}
  const playerSeasonTotals = {}
  for (const st of statsRows) {
    const pts = applyScoringRules(st, leagueRules)
    if (!playerPoints[st.player_id]) playerPoints[st.player_id] = {}
    playerPoints[st.player_id][st.week] = pts
    playerSeasonTotals[st.player_id] = (playerSeasonTotals[st.player_id] || 0) + pts
  }

  // Player info map from draft picks, trades, waivers
  const playerInfoMap = {}
  for (const p of draftPicks) {
    if (p.nfl_players) playerInfoMap[p.player_id] = p.nfl_players
  }
  for (const t of trades) {
    for (const item of t.fantasy_trade_items || []) {
      if (item.nfl_players) playerInfoMap[item.player_id] = item.nfl_players
    }
  }
  for (const w of waiverClaims) {
    if (w.nfl_players) playerInfoMap[w.add_player_id] = w.nfl_players
  }

  function formatPlayer(playerId) {
    const p = playerInfoMap[playerId]
    return p ? { playerId: p.id, name: p.full_name, position: p.position, headshot: p.headshot_url } : { playerId }
  }

  // --- Position rankings: rank all drafted players by season total at their position ---
  const positionGroups = {}
  for (const p of draftPicks) {
    const pos = p.nfl_players?.position
    if (!pos) continue
    if (!positionGroups[pos]) positionGroups[pos] = []
    if (!positionGroups[pos].find((x) => x.playerId === p.player_id)) {
      positionGroups[pos].push({ playerId: p.player_id, total: playerSeasonTotals[p.player_id] || 0 })
    }
  }
  const positionRanks = {}
  for (const group of Object.values(positionGroups)) {
    group.sort((a, b) => b.total - a.total)
    for (let i = 0; i < group.length; i++) {
      positionRanks[group[i].playerId] = { rank: i + 1, total: group.length }
    }
  }

  // Draft position rank within position: what pick # was this player among their position?
  const draftPositionOrder = {}
  const posDraftCounts = {}
  for (const p of draftPicks) {
    const pos = p.nfl_players?.position
    if (!pos) continue
    posDraftCounts[pos] = (posDraftCounts[pos] || 0) + 1
    draftPositionOrder[p.player_id] = posDraftCounts[pos]
  }

  // ===================================================================
  // PER-USER REPORTS
  // ===================================================================
  const userReports = {}

  for (const member of members) {
    const userId = member.user_id

    // --- Season record ---
    let wins = 0, losses = 0, ties = 0, pointsFor = 0, pointsAgainst = 0
    let currentWinStreak = 0, longestWinStreak = 0, currentLoseStreak = 0, longestLoseStreak = 0

    for (const m of matchups) {
      let pf, pa
      if (m.home_user_id === userId) { pf = Number(m.home_points) || 0; pa = Number(m.away_points) || 0 }
      else if (m.away_user_id === userId) { pf = Number(m.away_points) || 0; pa = Number(m.home_points) || 0 }
      else continue

      pointsFor += pf; pointsAgainst += pa
      if (pf > pa) {
        wins++; currentWinStreak++; longestWinStreak = Math.max(longestWinStreak, currentWinStreak); currentLoseStreak = 0
      } else if (pf < pa) {
        losses++; currentLoseStreak++; longestLoseStreak = Math.max(longestLoseStreak, currentLoseStreak); currentWinStreak = 0
      } else {
        ties++; currentWinStreak = 0; currentLoseStreak = 0
      }
    }

    // --- Draft analysis ---
    const myPicks = draftPicks.filter((p) => p.user_id === userId)
    const pickAnalysis = myPicks.map((p) => {
      const seasonPts = Math.round((playerSeasonTotals[p.player_id] || 0) * 100) / 100
      const posRank = positionRanks[p.player_id]
      const draftPosRank = draftPositionOrder[p.player_id] || null
      const value = draftPosRank && posRank ? draftPosRank - posRank.rank : null
      return {
        round: p.round,
        pickNumber: p.pick_number,
        player: formatPlayer(p.player_id),
        isAutoPick: p.is_auto_pick || false,
        seasonPoints: seasonPts,
        positionRank: posRank ? `${p.nfl_players?.position || ''}${posRank.rank}` : null,
        draftedAsPositionPick: draftPosRank,
        value,
      }
    })

    const bestValues = [...pickAnalysis].filter((p) => p.value != null).sort((a, b) => b.value - a.value).slice(0, 3)
    const biggestBusts = [...pickAnalysis].filter((p) => p.value != null).sort((a, b) => a.value - b.value).slice(0, 3)

    // Draft grade: average value across all picks
    const picksWithValue = pickAnalysis.filter((p) => p.value != null)
    const avgValue = picksWithValue.length > 0 ? picksWithValue.reduce((s, p) => s + p.value, 0) / picksWithValue.length : 0
    const totalDraftedPoints = Math.round(pickAnalysis.reduce((s, p) => s + p.seasonPoints, 0) * 100) / 100
    let draftGrade
    if (avgValue >= 5) draftGrade = 'A+'
    else if (avgValue >= 3) draftGrade = 'A'
    else if (avgValue >= 1) draftGrade = 'B+'
    else if (avgValue >= 0) draftGrade = 'B'
    else if (avgValue >= -2) draftGrade = 'C'
    else if (avgValue >= -4) draftGrade = 'D'
    else draftGrade = 'F'

    // --- Trade analysis ---
    const myTrades = trades.filter((t) => t.proposer_user_id === userId || t.receiver_user_id === userId)
    const tradeAnalysis = myTrades.map((t) => {
      // Determine the week this trade was accepted by finding the matchup
      // week that the responded_at timestamp falls into
      const tradeWeek = (() => {
        if (!t.responded_at) return allWeeks[0] || 1
        const tradeTime = new Date(t.responded_at).getTime()
        // NFL schedule: each week has games roughly Thurs-Mon. We need to
        // map the trade timestamp to the correct week. Use the nfl_schedule
        // game_dates fetched per week, or fall back to a simple heuristic:
        // matchup weeks are sequential, so find the last week <= trade time.
        // Since we don't have game dates here, use the week number directly.
        // Trade during week N means production counts from week N+1 onward.
        return allWeeks[Math.max(0, allWeeks.length - 1)] || 1
      })()
      const weeksAfter = allWeeks.filter((w) => w > tradeWeek)
      const items = t.fantasy_trade_items || []
      const sent = items.filter((i) => i.from_user_id === userId)
      const received = items.filter((i) => i.to_user_id === userId)

      const sumPtsAfter = (pid) => Math.round(weeksAfter.reduce((s, w) => s + (playerPoints[pid]?.[w] || 0), 0) * 100) / 100
      const sentPts = sent.reduce((sum, i) => sum + sumPtsAfter(i.player_id), 0)
      const receivedPts = received.reduce((sum, i) => sum + sumPtsAfter(i.player_id), 0)
      const partnerId = t.proposer_user_id === userId ? t.receiver_user_id : t.proposer_user_id

      return {
        tradeId: t.id,
        week: tradeWeek,
        partnerUser: formatUser(partnerId),
        sent: sent.map((i) => ({ player: formatPlayer(i.player_id), pointsAfterTrade: sumPtsAfter(i.player_id) })),
        received: received.map((i) => ({ player: formatPlayer(i.player_id), pointsAfterTrade: sumPtsAfter(i.player_id) })),
        netPoints: Math.round((receivedPts - sentPts) * 100) / 100,
        won: receivedPts > sentPts,
      }
    })

    // --- Best waiver pickup ---
    const myWaivers = waiverClaims.filter((w) => w.user_id === userId)
    const waiverAnalysis = myWaivers.map((w) => {
      // Waiver claims are processed on Wednesdays (between weeks). Points
      // count from the upcoming week onward. Use all remaining weeks.
      const weeksAfter = allWeeks
      const pointsProduced = Math.round(weeksAfter.reduce((s, wk) => s + (playerPoints[w.add_player_id]?.[wk] || 0), 0) * 100) / 100
      return {
        player: formatPlayer(w.add_player_id),
        pointsProduced,
        bidAmount: w.bid_amount || 0,
      }
    }).sort((a, b) => b.pointsProduced - a.pointsProduced)

    // --- Team MVP: all players ever rostered by this user ---
    const allMyPlayerIds = new Set()
    for (const p of myPicks) allMyPlayerIds.add(p.player_id)
    for (const w of myWaivers) allMyPlayerIds.add(w.add_player_id)
    for (const t of myTrades) {
      for (const item of (t.fantasy_trade_items || [])) {
        if (item.to_user_id === userId) allMyPlayerIds.add(item.player_id)
      }
    }

    let teamMvp = null
    let mvpPoints = 0
    for (const pid of allMyPlayerIds) {
      const total = playerSeasonTotals[pid] || 0
      if (total > mvpPoints) { mvpPoints = total; teamMvp = { player: formatPlayer(pid), totalPoints: Math.round(total * 100) / 100 } }
    }

    userReports[userId] = {
      user: formatUser(userId),
      seasonRecord: {
        wins, losses, ties,
        pointsFor: Math.round(pointsFor * 100) / 100,
        pointsAgainst: Math.round(pointsAgainst * 100) / 100,
        longestWinStreak, longestLoseStreak,
      },
      draftAnalysis: { picks: pickAnalysis, bestValues, biggestBusts, draftGrade, totalDraftedPoints },
      tradeAnalysis,
      bestWaiverPickup: waiverAnalysis[0] || null,
      waiverPickups: waiverAnalysis,
      teamMvp,
    }
  }

  // --- Compute standings ---
  const standings = Object.values(userReports)
    .sort((a, b) => b.seasonRecord.wins - a.seasonRecord.wins || b.seasonRecord.pointsFor - a.seasonRecord.pointsFor)
  standings.forEach((u, i) => { u.seasonRecord.standing = i + 1 })

  // ===================================================================
  // LEAGUE-WIDE AWARDS
  // ===================================================================

  const highestScorer = standings[0] ? {
    user: standings[0].user,
    totalPointsFor: standings[0].seasonRecord.pointsFor,
    context: `${standings[0].seasonRecord.wins}-${standings[0].seasonRecord.losses} record with ${standings[0].seasonRecord.pointsFor} total points.`,
  } : null

  let biggestBlowout = null
  let closestGame = null
  for (const m of matchups) {
    const margin = Math.abs((Number(m.home_points) || 0) - (Number(m.away_points) || 0))
    const homeWon = (Number(m.home_points) || 0) > (Number(m.away_points) || 0)
    const entry = {
      week: m.week, margin: Math.round(margin * 100) / 100,
      winner: { user: formatUser(homeWon ? m.home_user_id : m.away_user_id), points: Number(homeWon ? m.home_points : m.away_points) || 0 },
      loser: { user: formatUser(homeWon ? m.away_user_id : m.home_user_id), points: Number(homeWon ? m.away_points : m.home_points) || 0 },
    }
    if (!biggestBlowout || margin > biggestBlowout.margin) biggestBlowout = entry
    if (margin > 0 && (!closestGame || margin < closestGame.margin)) closestGame = entry
  }

  let bestDraft = null
  for (const r of Object.values(userReports)) {
    if (!bestDraft || r.draftAnalysis.totalDraftedPoints > bestDraft.totalDraftedPoints) {
      bestDraft = { user: r.user, draftGrade: r.draftAnalysis.draftGrade, totalDraftedPoints: r.draftAnalysis.totalDraftedPoints }
    }
  }

  let bestTrade = null
  for (const r of Object.values(userReports)) {
    for (const t of r.tradeAnalysis) {
      if (t.won && (!bestTrade || t.netPoints > bestTrade.netPoints)) {
        bestTrade = { ...t, user: r.user }
      }
    }
  }

  let bestWaiver = null
  for (const r of Object.values(userReports)) {
    if (r.bestWaiverPickup && (!bestWaiver || r.bestWaiverPickup.pointsProduced > bestWaiver.pointsProduced)) {
      bestWaiver = { ...r.bestWaiverPickup, user: r.user }
    }
  }

  let leagueMvp = null
  for (const [pid, total] of Object.entries(playerSeasonTotals)) {
    if (!leagueMvp || total > leagueMvp.totalPoints) {
      leagueMvp = { player: formatPlayer(pid), totalPoints: Math.round(total * 100) / 100 }
    }
  }

  const report = {
    format: 'traditional_fantasy',
    season,
    totalWeeks: allWeeks.length,
    generatedAt: new Date().toISOString(),
    leagueAwards: { highestScorer, biggestBlowout, closestGame, bestDraft, bestTrade, bestWaiverPickup: bestWaiver, leagueMvp },
    users: userReports,
  }

  const { error } = await supabase
    .from('dfs_league_reports')
    .upsert({ league_id: leagueId, report_data: report, generated_at: new Date().toISOString() }, { onConflict: 'league_id' })

  if (error) {
    logger.error({ error, leagueId }, 'Failed to store traditional fantasy report')
    return null
  }

  logger.info({ leagueId, weeks: allWeeks.length, users: members.length }, 'Traditional fantasy report generated')
  return report
}
