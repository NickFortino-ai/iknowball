import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import {
  getMLBPlayerPool,
  getMLBDFSRoster,
  saveMLBDFSRoster,
} from '../services/mlbDfsService.js'
import { getFantasySettings } from '../services/fantasyService.js'

const router = Router()
router.use(requireAuth)

// Get MLB player pool with salaries for a date
router.get('/players', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' })
  const data = await getMLBPlayerPool(date)
  res.json(data)
})

// Get my MLB roster for a date
router.get('/roster', async (req, res) => {
  const { league_id, date, season } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })
  const data = await getMLBDFSRoster(league_id, req.user.id, date, parseInt(season || '2026'))
  res.json(data)
})

// Save/update MLB roster
router.post('/roster', async (req, res) => {
  const { league_id, date, season, slots } = req.body
  if (!league_id || !date || !slots?.length) {
    return res.status(400).json({ error: 'league_id, date, and slots required' })
  }

  // Verify league membership
  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .maybeSingle()

  if (!member) return res.status(403).json({ error: 'Not a member of this league' })

  // Verify salary cap
  const settings = await getFantasySettings(league_id)
  const cap = settings?.salary_cap || 50000
  const totalSalary = slots.reduce((sum, s) => sum + (s.salary || 0), 0)
  if (totalSalary > cap) {
    return res.status(400).json({ error: 'Roster exceeds salary cap' })
  }

  const result = await saveMLBDFSRoster(league_id, req.user.id, date, parseInt(season || '2026'), slots)
  res.json(result)
})

// MLB DFS standings
router.get('/standings', async (req, res) => {
  const { league_id } = req.query
  if (!league_id) return res.status(400).json({ error: 'league_id required' })

  // Get champion metric from settings
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('champion_metric')
    .eq('league_id', league_id)
    .maybeSingle()

  const championMetric = settings?.champion_metric || 'total_points'

  const { data: results } = await supabase
    .from('mlb_dfs_nightly_results')
    .select('user_id, total_points, is_night_winner')
    .eq('league_id', league_id)

  if (!results?.length) return res.json({ standings: [], championMetric })

  // Aggregate
  const userMap = {}
  for (const r of results) {
    if (!userMap[r.user_id]) userMap[r.user_id] = { totalPoints: 0, nightlyWins: 0 }
    userMap[r.user_id].totalPoints += Number(r.total_points)
    if (r.is_night_winner) userMap[r.user_id].nightlyWins++
  }

  // Get user details
  const userIds = Object.keys(userMap)
  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji')
    .in('id', userIds)

  const standings = userIds.map((uid) => ({
    user: users?.find((u) => u.id === uid) || { id: uid },
    ...userMap[uid],
  }))

  // Sort by champion metric
  if (championMetric === 'most_wins') {
    standings.sort((a, b) => b.nightlyWins - a.nightlyWins || b.totalPoints - a.totalPoints)
  } else {
    standings.sort((a, b) => b.totalPoints - a.totalPoints)
  }

  res.json({ standings: standings.map((s, i) => ({ ...s, rank: i + 1 })), championMetric })
})

// Live scoring view
router.get('/live', async (req, res) => {
  const { league_id, date, season } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })
  const s = parseInt(season || '2026')
  const now = new Date()

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', league_id)

  if (!members?.length) return res.json({ members: [] })

  const { data: rosters } = await supabase
    .from('mlb_dfs_rosters')
    .select('id, user_id, total_points, mlb_dfs_roster_slots(roster_slot, player_name, espn_player_id, salary, points_earned)')
    .eq('league_id', league_id)
    .eq('game_date', date)
    .eq('season', s)

  const rosterMap = {}
  for (const r of rosters || []) rosterMap[r.user_id] = r

  // Get game times
  const allEspnIds = []
  for (const r of rosters || []) {
    for (const slot of r.mlb_dfs_roster_slots || []) {
      if (slot.espn_player_id) allEspnIds.push(slot.espn_player_id)
    }
  }

  const gameStateMap = {}
  if (allEspnIds.length) {
    const { data: salaries } = await supabase
      .from('mlb_dfs_salaries')
      .select('espn_player_id, game_starts_at, headshot_url, team, opponent')
      .eq('game_date', date)
      .in('espn_player_id', [...new Set(allEspnIds)])

    for (const sal of salaries || []) {
      const startTime = sal.game_starts_at ? new Date(sal.game_starts_at) : null
      let status = 'upcoming'
      if (startTime && startTime <= now) {
        const approxEnd = new Date(startTime.getTime() + 4 * 60 * 60 * 1000)
        status = now < approxEnd ? 'live' : 'final'
      }
      gameStateMap[sal.espn_player_id] = {
        gameStartsAt: sal.game_starts_at, status, headshot_url: sal.headshot_url,
        team: sal.team, opponent: sal.opponent,
      }
    }
  }

  // Fetch live MLB scores from ESPN for matchup info
  try {
    const dateStr = date.replace(/-/g, '')
    const espnRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}`)
    if (espnRes.ok) {
      const espnData = await espnRes.json()
      // Build team abbreviation → game score map
      const teamGameMap = {}
      for (const event of espnData.events || []) {
        const comp = event.competitions?.[0]
        if (!comp) continue
        const statusType = comp.status?.type?.name
        let gameStatus = 'upcoming'
        if (['STATUS_IN_PROGRESS', 'STATUS_END_PERIOD', 'STATUS_HALFTIME'].includes(statusType)) gameStatus = 'live'
        else if (['STATUS_FINAL', 'STATUS_FULL_TIME'].includes(statusType)) gameStatus = 'final'

        const home = comp.competitors?.find((c) => c.homeAway === 'home')
        const away = comp.competitors?.find((c) => c.homeAway === 'away')
        const homeAbbrev = home?.team?.abbreviation
        const awayAbbrev = away?.team?.abbreviation
        const homeScore = parseInt(home?.score || '0', 10)
        const awayScore = parseInt(away?.score || '0', 10)
        const period = comp.status?.period || null
        const inningHalf = comp.status?.type?.shortDetail || null

        const gameData = { homeAbbrev, awayAbbrev, homeScore, awayScore, gameStatus, period, inningHalf }
        if (homeAbbrev) teamGameMap[homeAbbrev] = gameData
        if (awayAbbrev) teamGameMap[awayAbbrev] = gameData
      }

      // Match players to their games
      for (const [espnId, gs] of Object.entries(gameStateMap)) {
        if (gs.team) {
          const game = teamGameMap[gs.team]
          if (game) {
            gs.status = game.gameStatus
            gs.homeAbbrev = game.homeAbbrev
            gs.awayAbbrev = game.awayAbbrev
            gs.homeScore = game.homeScore
            gs.awayScore = game.awayScore
            gs.inning = game.inningHalf
          }
        }
      }
    }
  } catch { /* ignore */ }

  // Player stats
  const playerStatsMap = {}
  if (allEspnIds.length) {
    const { data: stats } = await supabase
      .from('mlb_dfs_player_stats')
      .select('espn_player_id, fantasy_points, hits, at_bats, runs, home_runs, rbis, stolen_bases, walks, strikeouts')
      .eq('game_date', date)
      .eq('season', s)
      .in('espn_player_id', [...new Set(allEspnIds)])

    for (const stat of stats || []) {
      playerStatsMap[stat.espn_player_id] = {
        h: stat.hits || 0, ab: stat.at_bats || 0, r: stat.runs || 0,
        hr: stat.home_runs || 0, rbi: stat.rbis || 0, sb: stat.stolen_bases || 0,
        bb: stat.walks || 0, k: stat.strikeouts || 0,
      }
    }
  }

  // First game tip-off
  let firstTipoff = null
  for (const gs of Object.values(gameStateMap)) {
    if (gs.gameStartsAt && (!firstTipoff || gs.gameStartsAt < firstTipoff)) {
      firstTipoff = gs.gameStartsAt
    }
  }

  const anyLive = Object.values(gameStateMap).some((g) => g.status === 'live')
  const allFinal = Object.values(gameStateMap).length > 0 && Object.values(gameStateMap).every((g) => g.status === 'final')

  const result = members.map((m) => {
    const roster = rosterMap[m.user_id]
    const hasRoster = !!roster
    let totalPoints = 0
    let memberStatus = 'upcoming'

    const slots = (roster?.mlb_dfs_roster_slots || []).map((slot) => {
      const gs = gameStateMap[slot.espn_player_id] || {}
      const pts = Number(slot.points_earned) || 0
      totalPoints += pts

      const isOtherUser = m.user_id !== req.user.id
      const gameNotStarted = gs.status === 'upcoming'
      const hidden = isOtherUser && gameNotStarted

      if (gs.status === 'live') memberStatus = 'live'
      if (gs.status === 'final' && memberStatus !== 'live') memberStatus = 'final'

      return {
        roster_slot: slot.roster_slot,
        player_name: hidden ? '????' : slot.player_name,
        espn_player_id: hidden ? null : slot.espn_player_id,
        headshot_url: hidden ? null : (gs.headshot_url || null),
        points_earned: pts,
        game_status: gs.status || 'upcoming',
        home_team: gs.homeAbbrev || null,
        away_team: gs.awayAbbrev || null,
        home_score: gs.homeScore ?? null,
        away_score: gs.awayScore ?? null,
        inning: gs.inning || null,
        stats: playerStatsMap[slot.espn_player_id] || null,
      }
    })

    return {
      user_id: m.user_id,
      user: m.users,
      has_roster: hasRoster,
      total_points: totalPoints,
      status: memberStatus,
      slots,
    }
  }).sort((a, b) => b.total_points - a.total_points)

  res.json({ members: result, all_final: allFinal, any_live: anyLive, first_tipoff: firstTipoff })
})

export default router
