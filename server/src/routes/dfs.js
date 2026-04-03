import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import {
  getPlayerPool,
  getDFSRoster,
  saveDFSRoster,
  getDFSStandings,
  getWeeklyResults,
} from '../services/dfsService.js'
import { getFantasySettings } from '../services/fantasyService.js'

const router = Router()
router.use(requireAuth)

// Get player pool with salaries
router.get('/players', async (req, res) => {
  const { week, season, position } = req.query
  if (!week || !season) return res.status(400).json({ error: 'week and season required' })
  const data = await getPlayerPool(parseInt(week), parseInt(season), position || null)
  res.json(data)
})

// Get my DFS roster for a week
router.get('/roster', async (req, res) => {
  const { league_id, week, season } = req.query
  if (!league_id || !week || !season) return res.status(400).json({ error: 'league_id, week, and season required' })
  const data = await getDFSRoster(league_id, req.user.id, parseInt(week), parseInt(season))
  res.json(data)
})

// Save/update DFS roster
router.post('/roster', async (req, res) => {
  const { league_id, week, season, slots } = req.body
  if (!league_id || !week || !season) return res.status(400).json({ error: 'league_id, week, and season required' })

  const settings = await getFantasySettings(league_id)
  const salaryCap = settings.salary_cap || 60000

  const data = await saveDFSRoster(league_id, req.user.id, week, season, slots || [], salaryCap)
  res.json(data)
})

// Get standings
router.get('/standings', async (req, res) => {
  const { league_id } = req.query
  if (!league_id) return res.status(400).json({ error: 'league_id required' })
  const data = await getDFSStandings(league_id)
  res.json(data)
})

// Get weekly results
router.get('/weekly-results', async (req, res) => {
  const { league_id, week } = req.query
  if (!league_id || !week) return res.status(400).json({ error: 'league_id and week required' })
  const data = await getWeeklyResults(league_id, parseInt(week))
  res.json(data)
})

// Live view — all members' rosters with current points (salary cap DFS mode)
router.get('/live', async (req, res) => {
  const { league_id, week, season } = req.query
  if (!league_id || !week) return res.status(400).json({ error: 'league_id and week required' })
  const s = parseInt(season || '2026')
  const w = parseInt(week)

  // Get all members
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', league_id)

  if (!members?.length) return res.json({ members: [] })

  // Get all rosters for this week
  const { data: rosters } = await supabase
    .from('dfs_rosters')
    .select('id, user_id, total_points, dfs_roster_slots(roster_slot, player_id, salary, points_earned, is_locked)')
    .eq('league_id', league_id)
    .eq('nfl_week', w)
    .eq('season', s)

  const rosterMap = {}
  for (const r of rosters || []) rosterMap[r.user_id] = r

  // Collect all player IDs
  const allPlayerIds = []
  for (const r of rosters || []) {
    for (const slot of r.dfs_roster_slots || []) {
      if (slot.player_id) allPlayerIds.push(slot.player_id)
    }
  }

  // Fetch player info
  const playerMap = {}
  if (allPlayerIds.length) {
    const { data: players } = await supabase
      .from('nfl_players')
      .select('id, full_name, position, team, headshot_url, espn_id')
      .in('id', [...new Set(allPlayerIds)])

    for (const p of players || []) playerMap[p.id] = p
  }

  // Fetch weekly stats
  const statsMap = {}
  if (allPlayerIds.length) {
    const { data: stats } = await supabase
      .from('nfl_player_stats')
      .select('player_id, pts_half_ppr, pass_yards, pass_td, interceptions, rush_yards, rush_td, receptions, rec_yards, rec_td, fumbles_lost')
      .eq('week', w)
      .eq('season', s)
      .in('player_id', [...new Set(allPlayerIds)])

    for (const st of stats || []) statsMap[st.player_id] = st
  }

  // Fetch NFL game statuses for this week from ESPN
  let gameStatuses = {} // team abbreviation → 'pre' | 'in' | 'post'
  let gameScores = {} // team abbreviation → { homeAbbrev, awayAbbrev, homeScore, awayScore, period, clock }
  try {
    const espnRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${w}&seasontype=2&dates=${s}`)
    if (espnRes.ok) {
      const espnData = await espnRes.json()
      for (const event of espnData.events || []) {
        const comp = event.competitions?.[0]
        if (!comp) continue
        const statusType = comp.status?.type?.name || event.status?.type?.name
        let state = 'pre'
        if (['STATUS_IN_PROGRESS', 'STATUS_END_PERIOD', 'STATUS_HALFTIME', 'STATUS_OVERTIME'].includes(statusType)) state = 'in'
        else if (['STATUS_FINAL', 'STATUS_FULL_TIME'].includes(statusType)) state = 'post'

        const period = comp.status?.period || null
        const clock = comp.status?.displayClock || null
        const teams = comp.competitors || []
        const homeTeam = teams.find((t) => t.homeAway === 'home')
        const awayTeam = teams.find((t) => t.homeAway === 'away')
        const homeAbbrev = homeTeam?.team?.abbreviation
        const awayAbbrev = awayTeam?.team?.abbreviation
        const homeScore = parseInt(homeTeam?.score) || 0
        const awayScore = parseInt(awayTeam?.score) || 0

        const gameInfo = { homeAbbrev, awayAbbrev, homeScore, awayScore, period, clock, state }
        if (homeAbbrev) { gameStatuses[homeAbbrev] = state; gameScores[homeAbbrev] = gameInfo }
        if (awayAbbrev) { gameStatuses[awayAbbrev] = state; gameScores[awayAbbrev] = gameInfo }
      }
    }
  } catch { /* ignore */ }

  const allStates = Object.values(gameStatuses)
  const anyLive = allStates.some((s) => s === 'in')
  const allFinal = allStates.length > 0 && allStates.every((s) => s === 'post')

  // Build response
  const result = members.map((m) => {
    const roster = rosterMap[m.user_id]
    const isMe = m.user_id === req.user.id

    const slots = (roster?.dfs_roster_slots || []).map((slot) => {
      const player = playerMap[slot.player_id] || {}
      const team = player.team || ''
      const gs = gameScores[team] || {}
      const teamState = gameStatuses[team] || 'pre'
      const status = teamState === 'in' ? 'live' : teamState === 'post' ? 'final' : 'upcoming'
      const visible = isMe || allFinal || status === 'live' || status === 'final'
      const stat = statsMap[slot.player_id] || null
      const hasStats = stat && (status === 'live' || status === 'final')

      return {
        roster_slot: slot.roster_slot,
        player_name: visible ? (player.full_name || '?') : '????',
        player_id: visible ? slot.player_id : null,
        headshot_url: visible ? (player.headshot_url || null) : null,
        position: visible ? (player.position || null) : null,
        salary: visible ? slot.salary : null,
        points_earned: status === 'live' || status === 'final' ? Number(slot.points_earned) || (stat ? Number(stat.pts_half_ppr) : 0) : 0,
        game_status: status,
        game_period: gs.period || null,
        game_clock: gs.clock || null,
        home_team: gs.homeAbbrev || null,
        away_team: gs.awayAbbrev || null,
        home_score: gs.homeScore ?? null,
        away_score: gs.awayScore ?? null,
        stats: hasStats ? {
          pass_yds: stat.pass_yards || 0,
          pass_td: stat.pass_td || 0,
          int: stat.interceptions || 0,
          rush_yds: stat.rush_yards || 0,
          rush_td: stat.rush_td || 0,
          rec: stat.receptions || 0,
          rec_yds: stat.rec_yards || 0,
          rec_td: stat.rec_td || 0,
          fum: stat.fumbles_lost || 0,
        } : null,
      }
    })

    const totalPoints = slots.reduce((sum, s) => sum + (s.points_earned || 0), 0)
    const hasLive = slots.some((s) => s.game_status === 'live')
    const allDone = slots.length > 0 && slots.every((s) => s.game_status === 'final')

    return {
      user: m.users,
      user_id: m.user_id,
      total_points: totalPoints,
      status: allDone ? 'final' : hasLive ? 'live' : 'upcoming',
      has_roster: !!roster,
      slots,
    }
  })

  result.sort((a, b) => b.total_points - a.total_points)

  res.json({ members: result, any_live: anyLive, all_final: allFinal })
})

// Live matchup view — traditional fantasy H2H with live stats
router.get('/matchup-live', async (req, res) => {
  const { league_id, week, season } = req.query
  if (!league_id || !week) return res.status(400).json({ error: 'league_id and week required' })
  const w = parseInt(week)
  const s = parseInt(season || '2026')

  // Get matchups for this week
  const { data: matchups } = await supabase
    .from('fantasy_matchups')
    .select('*, home_user:users!fantasy_matchups_home_user_id_fkey(id, username, display_name, avatar_url, avatar_emoji), away_user:users!fantasy_matchups_away_user_id_fkey(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', league_id)
    .eq('week', w)

  if (!matchups?.length) return res.json({ matchups: [] })

  // Get all rosters for league members
  const userIds = [...new Set(matchups.flatMap((m) => [m.home_user_id, m.away_user_id]))]
  const { data: rosters } = await supabase
    .from('fantasy_rosters')
    .select('user_id, player_id, slot, nfl_players(id, full_name, position, team, headshot_url)')
    .eq('league_id', league_id)
    .in('user_id', userIds)

  // Collect all player IDs
  const allPlayerIds = (rosters || []).map((r) => r.player_id)

  // Fetch weekly stats
  const statsMap = {}
  if (allPlayerIds.length) {
    const { data: stats } = await supabase
      .from('nfl_player_stats')
      .select('player_id, pts_half_ppr, pts_ppr, pts_std, pass_yards, pass_td, interceptions, rush_yards, rush_td, receptions, rec_yards, rec_td, fumbles_lost')
      .eq('week', w)
      .eq('season', s)
      .in('player_id', [...new Set(allPlayerIds)])

    for (const st of stats || []) statsMap[st.player_id] = st
  }

  // Fetch game statuses
  let gameStatuses = {}
  let gameScores = {}
  try {
    const espnRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${w}&seasontype=2&dates=${s}`)
    if (espnRes.ok) {
      const espnData = await espnRes.json()
      for (const event of espnData.events || []) {
        const comp = event.competitions?.[0]
        if (!comp) continue
        const statusType = comp.status?.type?.name || event.status?.type?.name
        let state = 'pre'
        if (['STATUS_IN_PROGRESS', 'STATUS_END_PERIOD', 'STATUS_HALFTIME', 'STATUS_OVERTIME'].includes(statusType)) state = 'in'
        else if (['STATUS_FINAL', 'STATUS_FULL_TIME'].includes(statusType)) state = 'post'

        const period = comp.status?.period || null
        const clock = comp.status?.displayClock || null
        for (const c of comp.competitors || []) {
          const abbrev = c.team?.abbreviation
          if (abbrev) {
            gameStatuses[abbrev] = state
            gameScores[abbrev] = { period, clock, state }
          }
        }
      }
    }
  } catch { /* ignore */ }

  // Get scoring format
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('scoring_format')
    .eq('league_id', league_id)
    .single()
  const scoringKey = settings?.scoring_format === 'ppr' ? 'pts_ppr' : settings?.scoring_format === 'standard' ? 'pts_std' : 'pts_half_ppr'

  // Fetch season averages for projections (avg pts per game this season)
  const seasonAvgMap = {}
  if (allPlayerIds.length) {
    const { data: seasonStats } = await supabase
      .from('nfl_player_stats')
      .select(`player_id, ${scoringKey}`)
      .eq('season', s)
      .in('player_id', [...new Set(allPlayerIds)])

    // Compute average per player
    const playerTotals = {}
    for (const st of seasonStats || []) {
      if (!playerTotals[st.player_id]) playerTotals[st.player_id] = { total: 0, games: 0 }
      playerTotals[st.player_id].total += Number(st[scoringKey]) || 0
      playerTotals[st.player_id].games++
    }
    for (const [pid, t] of Object.entries(playerTotals)) {
      seasonAvgMap[pid] = t.games > 0 ? t.total / t.games : 0
    }
  }

  // Estimate game progress fraction (NFL: 4 quarters, 60 min)
  function gameProgressFraction(teamState, period) {
    if (teamState === 'post') return 1
    if (teamState === 'pre') return 0
    const q = parseInt(period) || 1
    return Math.min(1, (q - 1) / 4 + 0.125) // rough: start of Q1=0, mid-Q1=0.125, etc
  }

  // Normal CDF approximation for win probability
  function normalCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x))
    const d = 0.3989422804 * Math.exp(-x * x / 2)
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.8212560 + t * 1.3302744))))
    return x > 0 ? 1 - p : p
  }

  // Build rosters per user
  const userRosters = {}
  for (const r of rosters || []) {
    if (!userRosters[r.user_id]) userRosters[r.user_id] = []
    const player = r.nfl_players || {}
    const team = player.team || ''
    const teamState = gameStatuses[team] || 'pre'
    const status = teamState === 'in' ? 'live' : teamState === 'post' ? 'final' : 'upcoming'
    const stat = statsMap[r.player_id] || null
    const pts = stat ? Number(stat[scoringKey]) || 0 : 0
    const seasonAvg = seasonAvgMap[r.player_id] || 0

    // Projected points: actual so far + remaining fraction * season avg
    const progress = gameProgressFraction(teamState, gameScores[team]?.period)
    const projected = status === 'final' ? pts : pts + seasonAvg * (1 - progress)

    userRosters[r.user_id].push({
      slot: r.slot,
      player_name: player.full_name || '?',
      position: player.position || '?',
      team,
      headshot_url: player.headshot_url || null,
      game_status: status,
      game_period: gameScores[team]?.period || null,
      game_clock: gameScores[team]?.clock || null,
      points: pts,
      projected: Math.round(projected * 100) / 100,
      stats: stat ? {
        pass_yds: stat.pass_yards || 0,
        pass_td: stat.pass_td || 0,
        int: stat.interceptions || 0,
        rush_yds: stat.rush_yards || 0,
        rush_td: stat.rush_td || 0,
        rec: stat.receptions || 0,
        rec_yds: stat.rec_yards || 0,
        rec_td: stat.rec_td || 0,
        fum: stat.fumbles_lost || 0,
      } : null,
    })
  }

  const SLOT_ORDER = ['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'wr3', 'te', 'flex', 'k', 'def']

  const enrichedMatchups = matchups.map((m) => {
    const homeRoster = (userRosters[m.home_user_id] || []).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
    const awayRoster = (userRosters[m.away_user_id] || []).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
    const homePoints = homeRoster.reduce((sum, s) => sum + (s.points || 0), 0)
    const awayPoints = awayRoster.reduce((sum, s) => sum + (s.points || 0), 0)
    const homeProjected = homeRoster.reduce((sum, s) => sum + (s.projected || 0), 0)
    const awayProjected = awayRoster.reduce((sum, s) => sum + (s.projected || 0), 0)

    // Win probability using projected point differential
    // Sigma ~20 pts represents typical fantasy score variance for a full roster
    const diff = homeProjected - awayProjected
    const sigma = 20
    const homeWinProb = Math.round(normalCDF(diff / sigma) * 100)

    return {
      id: m.id,
      home_user: m.home_user,
      away_user: m.away_user,
      home_points: Math.round(homePoints * 100) / 100,
      away_points: Math.round(awayPoints * 100) / 100,
      home_projected: Math.round(homeProjected * 100) / 100,
      away_projected: Math.round(awayProjected * 100) / 100,
      home_win_prob: homeWinProb,
      away_win_prob: 100 - homeWinProb,
      home_roster: homeRoster,
      away_roster: awayRoster,
    }
  })

  res.json({ matchups: enrichedMatchups })
})

export default router
