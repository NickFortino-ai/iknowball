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

  // Load this league's scoring rules
  const { data: leagueSettings } = await supabase
    .from('fantasy_settings')
    .select('scoring_format, scoring_rules')
    .eq('league_id', league_id)
    .single()
  const { applyScoringRules, buildScoringRulesFromPreset } = await import('../services/fantasyService.js')
  const leagueRules = leagueSettings?.scoring_rules || buildScoringRulesFromPreset(leagueSettings?.scoring_format)

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
      .select('id, full_name, position, team, headshot_url, espn_id, injury_status')
      .in('id', [...new Set(allPlayerIds)])

    for (const p of players || []) playerMap[p.id] = p
  }

  // Fetch weekly stats
  const statsMap = {}
  if (allPlayerIds.length) {
    const { data: stats } = await supabase
      .from('nfl_player_stats')
      .select('player_id, pass_yd, pass_td, pass_int, rush_yd, rush_td, rec, rec_yd, rec_td, fum_lost, two_pt, fgm_0_39, fgm_40_49, fgm_50_plus, xpm, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed')
      .eq('week', w)
      .eq('season', s)
      .in('player_id', [...new Set(allPlayerIds)])

    for (const st of stats || []) statsMap[st.player_id] = st
  }

  // Season averages for per-player projection — apply this league's custom rules
  const seasonAvgMap = {}
  if (allPlayerIds.length) {
    const { data: seasonStats } = await supabase
      .from('nfl_player_stats')
      .select('player_id, pass_yd, pass_td, pass_int, rush_yd, rush_td, rec, rec_yd, rec_td, fum_lost, two_pt, fgm_0_39, fgm_40_49, fgm_50_plus, xpm, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed')
      .eq('season', s)
      .in('player_id', [...new Set(allPlayerIds)])
    const totals = {}
    for (const st of seasonStats || []) {
      if (!totals[st.player_id]) totals[st.player_id] = { total: 0, games: 0 }
      totals[st.player_id].total += applyScoringRules(st, leagueRules)
      totals[st.player_id].games++
    }
    for (const [pid, t] of Object.entries(totals)) {
      seasonAvgMap[pid] = t.games > 0 ? t.total / t.games : 0
    }
  }

  // Weekly projections from Sleeper — prefer over season averages for matchup context
  const projCol = { ppr: 'pts_ppr', half_ppr: 'pts_half_ppr', standard: 'pts_std' }[settings?.scoring_format] || 'pts_half_ppr'
  const weeklyProjMap = {}
  if (allPlayerIds.length) {
    const { data: projRows } = await supabase
      .from('nfl_player_projections')
      .select(`player_id, ${projCol}`)
      .eq('season', s)
      .eq('week', w)
      .in('player_id', [...new Set(allPlayerIds)])
    for (const p of projRows || []) {
      if (p[projCol] != null) weeklyProjMap[p.player_id] = Number(p[projCol])
    }
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
        injury_status: visible ? (player.injury_status || null) : null,
        salary: visible ? slot.salary : null,
        points_earned: status === 'live' || status === 'final' ? applyScoringRules(stat, leagueRules) : 0,
        projected: (() => {
          const weeklyProj = weeklyProjMap[slot.player_id]
          const proj = weeklyProj != null ? weeklyProj : (seasonAvgMap[slot.player_id] || 0)
          const currentPts = status === 'live' || status === 'final' ? applyScoringRules(stat, leagueRules) : 0
          if (status === 'final') return Math.round(currentPts * 10) / 10
          const period = gs.period ? Math.min(parseInt(gs.period, 10), 4) : 0
          const progress = status === 'live' ? Math.min(0.25 * period + 0.05, 1) : 0
          return Math.round((currentPts + proj * (1 - progress)) * 10) / 10
        })(),
        game_status: status,
        game_period: gs.period || null,
        game_clock: gs.clock || null,
        home_team: gs.homeAbbrev || null,
        away_team: gs.awayAbbrev || null,
        home_score: gs.homeScore ?? null,
        away_score: gs.awayScore ?? null,
        stats: hasStats ? {
          pass_yds: Number(stat.pass_yd) || 0,
          pass_td: stat.pass_td || 0,
          int: stat.pass_int || 0,
          rush_yds: Number(stat.rush_yd) || 0,
          rush_td: stat.rush_td || 0,
          rec: stat.rec || 0,
          rec_yds: Number(stat.rec_yd) || 0,
          rec_td: stat.rec_td || 0,
          fum: stat.fum_lost || 0,
          fgm: stat.fgm || 0,
          fgm_50_plus: stat.fgm_50_plus || 0,
          xpm: stat.xpm || 0,
          def_td: stat.def_td || 0,
          def_int: stat.def_int || 0,
          def_sack: Number(stat.def_sack) || 0,
          def_fum_rec: stat.def_fum_rec || 0,
          def_safety: stat.def_safety || 0,
          def_pts_allowed: stat.def_pts_allowed,
        } : null,
      }
    })

    const totalPoints = slots.reduce((sum, s) => sum + (s.points_earned || 0), 0)
    const totalProjected = slots.reduce((sum, s) => sum + (s.projected || 0), 0)
    const hasLive = slots.some((s) => s.game_status === 'live')
    const allDone = slots.length > 0 && slots.every((s) => s.game_status === 'final')

    return {
      user: m.users,
      user_id: m.user_id,
      total_points: totalPoints,
      projected_points: Math.round(totalProjected * 10) / 10,
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

  // Fetch team names
  const { data: memberRows } = await supabase
    .from('league_members')
    .select('user_id, fantasy_team_name')
    .eq('league_id', league_id)
    .in('user_id', userIds)
  const teamNameMap = {}
  for (const m of memberRows || []) teamNameMap[m.user_id] = m.fantasy_team_name || null
  // Inject team names into matchup user objects
  for (const m of matchups) {
    if (m.home_user) m.home_user.fantasy_team_name = teamNameMap[m.home_user_id] || null
    if (m.away_user) m.away_user.fantasy_team_name = teamNameMap[m.away_user_id] || null
  }

  const { data: rosters } = await supabase
    .from('fantasy_rosters')
    .select('user_id, player_id, slot, nfl_players(id, full_name, position, team, headshot_url, injury_status, bye_week)')
    .eq('league_id', league_id)
    .in('user_id', userIds)

  // Collect all player IDs
  const allPlayerIds = (rosters || []).map((r) => r.player_id)

  // Fetch weekly stats
  const statsMap = {}
  if (allPlayerIds.length) {
    const { data: stats } = await supabase
      .from('nfl_player_stats')
      .select('player_id, pass_yd, pass_td, pass_int, rush_yd, rush_td, rec, rec_yd, rec_td, fum_lost, two_pt, fgm_0_39, fgm_40_49, fgm_50_plus, xpm, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed')
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

  // Get scoring rules (custom JSONB takes priority over preset)
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('scoring_format, scoring_rules')
    .eq('league_id', league_id)
    .single()
  const { applyScoringRules: applyRulesH2H, buildScoringRulesFromPreset: buildRulesH2H } = await import('../services/fantasyService.js')
  const leagueRules = settings?.scoring_rules || buildRulesH2H(settings?.scoring_format)

  // Fetch season averages for projections — pull every raw stat column so we
  // can apply the league's custom rules to each historical week, then average
  const seasonAvgMap = {}
  if (allPlayerIds.length) {
    const { data: seasonStats } = await supabase
      .from('nfl_player_stats')
      .select('player_id, pass_yd, pass_td, pass_int, rush_yd, rush_td, rec, rec_yd, rec_td, fum_lost, two_pt, fgm_0_39, fgm_40_49, fgm_50_plus, xpm, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed')
      .eq('season', s)
      .in('player_id', [...new Set(allPlayerIds)])

    const playerTotals = {}
    for (const st of seasonStats || []) {
      if (!playerTotals[st.player_id]) playerTotals[st.player_id] = { total: 0, games: 0 }
      playerTotals[st.player_id].total += applyRulesH2H(st, leagueRules)
      playerTotals[st.player_id].games++
    }
    for (const [pid, t] of Object.entries(playerTotals)) {
      seasonAvgMap[pid] = t.games > 0 ? t.total / t.games : 0
    }
  }

  // Weekly projections from Sleeper — prefer over season averages
  const projColH2H = { ppr: 'pts_ppr', half_ppr: 'pts_half_ppr', standard: 'pts_std' }[settings?.scoring_format] || 'pts_half_ppr'
  const weeklyProjMap = {}
  if (allPlayerIds.length) {
    const { data: projRows } = await supabase
      .from('nfl_player_projections')
      .select(`player_id, ${projColH2H}`)
      .eq('season', s)
      .eq('week', w)
      .in('player_id', [...new Set(allPlayerIds)])
    for (const p of projRows || []) {
      if (p[projColH2H] != null) weeklyProjMap[p.player_id] = Number(p[projColH2H])
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
    const pts = applyRulesH2H(stat, leagueRules)
    // Zero projection for bye-week players
    const onBye = player.bye_week === w
    const weeklyProj = onBye ? 0 : (weeklyProjMap[r.player_id] != null ? weeklyProjMap[r.player_id] : (seasonAvgMap[r.player_id] || 0))

    // Projected points: actual so far + remaining fraction * projection
    const progress = gameProgressFraction(teamState, gameScores[team]?.period)
    const projected = onBye ? 0 : (status === 'final' ? pts : pts + weeklyProj * (1 - progress))

    userRosters[r.user_id].push({
      slot: r.slot,
      player_id: r.player_id,
      player_name: player.full_name || '?',
      position: player.position || '?',
      team,
      headshot_url: player.headshot_url || null,
      injury_status: player.injury_status || null,
      game_status: status,
      game_period: gameScores[team]?.period || null,
      game_clock: gameScores[team]?.clock || null,
      points: pts,
      projected: Math.round(projected * 100) / 100,
      stats: stat ? {
        pass_yds: Number(stat.pass_yd) || 0,
        pass_td: stat.pass_td || 0,
        int: stat.pass_int || 0,
        rush_yds: Number(stat.rush_yd) || 0,
        rush_td: stat.rush_td || 0,
        rec: stat.rec || 0,
        rec_yds: Number(stat.rec_yd) || 0,
        rec_td: stat.rec_td || 0,
        fum: stat.fum_lost || 0,
        fgm: stat.fgm || 0,
        fgm_50_plus: stat.fgm_50_plus || 0,
        xpm: stat.xpm || 0,
        def_td: stat.def_td || 0,
        def_int: stat.def_int || 0,
        def_sack: Number(stat.def_sack) || 0,
        def_fum_rec: stat.def_fum_rec || 0,
        def_safety: stat.def_safety || 0,
        def_pts_allowed: stat.def_pts_allowed,
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

// Matchup data for any week — past (historical stats), current (live), future (projections)
router.get('/matchup-week', async (req, res) => {
  const { league_id, week, season, current_week } = req.query
  if (!league_id || !week) return res.status(400).json({ error: 'league_id and week required' })
  const w = parseInt(week)
  const s = parseInt(season || '2026')
  const cw = parseInt(current_week || week)

  const isPast = w < cw
  const isFuture = w > cw
  const isCurrent = w === cw

  // Get matchups for this week
  const { data: matchups } = await supabase
    .from('fantasy_matchups')
    .select('*, home_user:users!fantasy_matchups_home_user_id_fkey(id, username, display_name, avatar_url, avatar_emoji), away_user:users!fantasy_matchups_away_user_id_fkey(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', league_id)
    .eq('week', w)

  if (!matchups?.length) return res.json({ matchups: [], weekStatus: isFuture ? 'future' : isPast ? 'past' : 'current' })

  // Fetch team names for all users in matchups
  const allUserIds = [...new Set(matchups.flatMap((m) => [m.home_user_id, m.away_user_id]))]
  const { data: memberRows } = await supabase
    .from('league_members')
    .select('user_id, fantasy_team_name')
    .eq('league_id', league_id)
    .in('user_id', allUserIds)
  const teamNameMap = {}
  for (const m of memberRows || []) teamNameMap[m.user_id] = m.fantasy_team_name || null
  for (const m of matchups) {
    if (m.home_user) m.home_user.fantasy_team_name = teamNameMap[m.home_user_id] || null
    if (m.away_user) m.away_user.fantasy_team_name = teamNameMap[m.away_user_id] || null
  }

  // For future weeks: just return the schedule with season-long projections
  if (isFuture) {
    const userIds = [...new Set(matchups.flatMap((m) => [m.home_user_id, m.away_user_id]))]
    const { data: rosters } = await supabase
      .from('fantasy_rosters')
      .select('user_id, player_id, slot, nfl_players(id, full_name, position, team, headshot_url, bye_week, projected_pts_half_ppr, projected_pts_ppr, projected_pts_std)')
      .eq('league_id', league_id)
      .in('user_id', userIds)

    const { data: settings } = await supabase
      .from('fantasy_settings')
      .select('scoring_format')
      .eq('league_id', league_id)
      .single()
    const projCol = { ppr: 'projected_pts_ppr', half_ppr: 'projected_pts_half_ppr', standard: 'projected_pts_std' }[settings?.scoring_format] || 'projected_pts_half_ppr'

    const STARTER_SLOTS = new Set(['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'wr3', 'te', 'flex', 'k', 'def'])
    const SLOT_ORDER = ['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'wr3', 'te', 'flex', 'k', 'def']

    const enriched = matchups.map((m) => {
      const buildRoster = (userId) => (rosters || [])
        .filter((r) => r.user_id === userId && STARTER_SLOTS.has((r.slot || '').toLowerCase()))
        .map((r) => {
          const p = r.nfl_players || {}
          const onBye = p.bye_week === w
          const seasonProj = onBye ? 0 : (Number(p[projCol]) || 0)
          // Season-long projection is total season — estimate weekly by dividing by 17
          const weeklyEst = onBye ? 0 : Math.round((seasonProj / 17) * 100) / 100
          return {
            slot: r.slot, player_id: r.player_id,
            player_name: p.full_name || '?', position: p.position || '?',
            team: p.team || '', headshot_url: p.headshot_url || null,
            projected: weeklyEst, points: 0, game_status: 'upcoming',
            on_bye: onBye,
          }
        })
        .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))

      const homeRoster = buildRoster(m.home_user_id)
      const awayRoster = buildRoster(m.away_user_id)
      return {
        id: m.id, status: m.status,
        home_user: m.home_user, away_user: m.away_user,
        home_points: 0, away_points: 0,
        home_projected: Math.round(homeRoster.reduce((s, r) => s + r.projected, 0) * 100) / 100,
        away_projected: Math.round(awayRoster.reduce((s, r) => s + r.projected, 0) * 100) / 100,
        home_roster: homeRoster, away_roster: awayRoster,
      }
    })

    return res.json({ matchups: enriched, weekStatus: 'future' })
  }

  // For past weeks: use stored matchup scores + historical player stats
  if (isPast) {
    const userIds = [...new Set(matchups.flatMap((m) => [m.home_user_id, m.away_user_id]))]
    const { data: rosters } = await supabase
      .from('fantasy_rosters')
      .select('user_id, player_id, slot, nfl_players(id, full_name, position, team, headshot_url)')
      .eq('league_id', league_id)
      .in('user_id', userIds)

    const allPlayerIds = (rosters || []).map((r) => r.player_id)
    const statsMap = {}
    if (allPlayerIds.length) {
      const { data: stats } = await supabase
        .from('nfl_player_stats')
        .select('player_id, pass_yd, pass_td, pass_int, rush_yd, rush_td, rec, rec_yd, rec_td, fum_lost, two_pt, fgm_0_39, fgm_40_49, fgm_50_plus, xpm, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed')
        .eq('week', w).eq('season', s)
        .in('player_id', [...new Set(allPlayerIds)])
      for (const st of stats || []) statsMap[st.player_id] = st
    }

    const { data: settings } = await supabase
      .from('fantasy_settings')
      .select('scoring_format, scoring_rules')
      .eq('league_id', league_id)
      .single()
    const { applyScoringRules: applyRules, buildScoringRulesFromPreset: buildRules } = await import('../services/fantasyService.js')
    const leagueRules = settings?.scoring_rules || buildRules(settings?.scoring_format)

    const STARTER_SLOTS = new Set(['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'wr3', 'te', 'flex', 'k', 'def'])
    const SLOT_ORDER = ['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'wr3', 'te', 'flex', 'k', 'def']

    const enriched = matchups.map((m) => {
      const buildRoster = (userId) => (rosters || [])
        .filter((r) => r.user_id === userId && STARTER_SLOTS.has((r.slot || '').toLowerCase()))
        .map((r) => {
          const p = r.nfl_players || {}
          const stat = statsMap[r.player_id]
          const pts = applyRules(stat, leagueRules)
          return {
            slot: r.slot, player_id: r.player_id,
            player_name: p.full_name || '?', position: p.position || '?',
            team: p.team || '', headshot_url: p.headshot_url || null,
            points: Math.round(pts * 100) / 100, projected: Math.round(pts * 100) / 100,
            game_status: 'final',
          }
        })
        .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))

      const homeRoster = buildRoster(m.home_user_id)
      const awayRoster = buildRoster(m.away_user_id)
      const hp = Number(m.home_points) || homeRoster.reduce((s, r) => s + r.points, 0)
      const ap = Number(m.away_points) || awayRoster.reduce((s, r) => s + r.points, 0)
      return {
        id: m.id, status: m.status || 'completed',
        home_user: m.home_user, away_user: m.away_user,
        home_points: Math.round(hp * 100) / 100,
        away_points: Math.round(ap * 100) / 100,
        home_projected: Math.round(hp * 100) / 100,
        away_projected: Math.round(ap * 100) / 100,
        home_roster: homeRoster, away_roster: awayRoster,
      }
    })

    return res.json({ matchups: enriched, weekStatus: 'past' })
  }

  // Current week: client should use /matchup-live for live data.
  // If this endpoint is called for the current week, just return the matchup
  // schedule with status info — client will overlay live data separately.
  const enriched = matchups.map((m) => ({
    id: m.id, status: m.status || 'active',
    home_user: m.home_user, away_user: m.away_user,
    home_points: Number(m.home_points) || 0,
    away_points: Number(m.away_points) || 0,
  }))
  res.json({ matchups: enriched, weekStatus: 'current' })
})

export default router
