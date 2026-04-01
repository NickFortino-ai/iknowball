import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import {
  getNBAPlayerPool,
  getNBADFSRoster,
  saveNBADFSRoster,
  getNBADFSStandings,
  getNBANightlyResults,
} from '../services/nbaDfsService.js'
import { getFantasySettings } from '../services/fantasyService.js'

const router = Router()
router.use(requireAuth)

// Get player pool with salaries for tonight
router.get('/players', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' })
  const data = await getNBAPlayerPool(date)
  res.json(data)
})

// Get my roster for tonight
router.get('/roster', async (req, res) => {
  const { league_id, date, season } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })
  const data = await getNBADFSRoster(league_id, req.user.id, date, parseInt(season || '2026'))
  res.json(data)
})

// Save/update roster
router.post('/roster', async (req, res) => {
  const { league_id, date, season, slots } = req.body
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })

  // Check league start date — can't submit roster for dates before league starts
  const { data: league } = await supabase
    .from('leagues')
    .select('starts_at')
    .eq('id', league_id)
    .single()

  if (league?.starts_at) {
    const leagueStart = new Date(league.starts_at).toISOString().split('T')[0]
    if (date < leagueStart) {
      return res.status(400).json({ error: 'Cannot submit a roster before the league start date' })
    }
  }

  // Per-player locking: only allow changes to slots where the player's game hasn't started
  // Get game start times for all players being submitted
  const now = new Date()
  const espnIds = (slots || []).map((s) => s.espn_player_id).filter(Boolean)

  // Check existing roster for locked players that can't be removed
  const existingRoster = await getNBADFSRoster(league_id, req.user.id, date, parseInt(season || '2026'))
  if (existingRoster?.nba_dfs_roster_slots?.length) {
    // Get game times for existing rostered players
    const existingIds = existingRoster.nba_dfs_roster_slots.map((s) => s.espn_player_id).filter(Boolean)
    const { data: existingSalaries } = await supabase
      .from('nba_dfs_salaries')
      .select('espn_player_id, game_starts_at')
      .eq('game_date', date)
      .in('espn_player_id', existingIds)

    const gameTimeMap = {}
    for (const s of existingSalaries || []) {
      gameTimeMap[s.espn_player_id] = s.game_starts_at
    }

    // Verify locked players aren't being removed
    for (const existingSlot of existingRoster.nba_dfs_roster_slots) {
      const gameTime = gameTimeMap[existingSlot.espn_player_id]
      if (gameTime && new Date(gameTime) <= now) {
        // This player is locked — must still be in the new roster at the same slot
        const matchingNew = (slots || []).find((s) => s.roster_slot === existingSlot.roster_slot)
        if (!matchingNew || matchingNew.espn_player_id !== existingSlot.espn_player_id) {
          return res.status(400).json({ error: `${existingSlot.player_name}'s game has started — cannot swap` })
        }
      }
    }
  }

  // Verify new players being added don't have games already started
  if (espnIds.length) {
    const { data: newSalaries } = await supabase
      .from('nba_dfs_salaries')
      .select('espn_player_id, player_name, game_starts_at')
      .eq('game_date', date)
      .in('espn_player_id', espnIds)

    for (const sal of newSalaries || []) {
      if (sal.game_starts_at && new Date(sal.game_starts_at) <= now) {
        // Only block if this player wasn't already on the roster at this slot
        const wasExisting = existingRoster?.nba_dfs_roster_slots?.some(
          (s) => s.espn_player_id === sal.espn_player_id
        )
        if (!wasExisting) {
          return res.status(400).json({ error: `${sal.player_name}'s game has already started` })
        }
      }
    }
  }

  const settings = await getFantasySettings(league_id)
  const salaryCap = settings.salary_cap || 60000

  const data = await saveNBADFSRoster(league_id, req.user.id, date, season || 2026, slots || [], salaryCap)
  res.json(data)
})

// Get standings
router.get('/standings', async (req, res) => {
  const { league_id } = req.query
  if (!league_id) return res.status(400).json({ error: 'league_id required' })
  const data = await getNBADFSStandings(league_id)
  res.json(data)
})

// Get nightly results
router.get('/nightly-results', async (req, res) => {
  const { league_id, date } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })
  const data = await getNBANightlyResults(league_id, date)
  res.json(data)
})

// Live scoring — all members' rosters with game states, points, and visibility masking
router.get('/live', async (req, res) => {
  const { league_id, date, season } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })
  const s = parseInt(season || '2026')
  const now = new Date()

  // Get all members
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', league_id)

  if (!members?.length) return res.json([])

  // Get all rosters for this date
  const { data: rosters } = await supabase
    .from('nba_dfs_rosters')
    .select('id, user_id, total_points, nba_dfs_roster_slots(roster_slot, player_name, espn_player_id, salary, points_earned)')
    .eq('league_id', league_id)
    .eq('game_date', date)
    .eq('season', s)

  const rosterMap = {}
  for (const r of rosters || []) {
    rosterMap[r.user_id] = r
  }

  // Get game times and statuses for all rostered players
  const allEspnIds = []
  for (const r of rosters || []) {
    for (const slot of r.nba_dfs_roster_slots || []) {
      if (slot.espn_player_id) allEspnIds.push(slot.espn_player_id)
    }
  }

  const gameStateMap = {} // espn_player_id -> { gameStartsAt, status }
  if (allEspnIds.length) {
    const { data: salaries } = await supabase
      .from('nba_dfs_salaries')
      .select('espn_player_id, game_starts_at, headshot_url, team, opponent')
      .eq('game_date', date)
      .in('espn_player_id', [...new Set(allEspnIds)])

    for (const sal of salaries || []) {
      const startTime = sal.game_starts_at ? new Date(sal.game_starts_at) : null
      let status = 'upcoming'
      if (startTime && startTime <= now) status = 'live'
      gameStateMap[sal.espn_player_id] = { gameStartsAt: sal.game_starts_at, status, headshot_url: sal.headshot_url, team: sal.team, opponent: sal.opponent }
    }
  }

  // Fetch live game period/clock by matching game_starts_at
  const { data: sportRow } = await supabase.from('sports').select('id').eq('key', 'basketball_nba').single()
  if (sportRow) {
    const { data: liveGames } = await supabase
      .from('games')
      .select('starts_at, period, clock, status, home_team, away_team, live_home_score, live_away_score, home_score, away_score')
      .eq('sport_id', sportRow.id)
      .in('status', ['live', 'final'])

    if (liveGames?.length) {
      // Match by team abbreviation in game's full team names
      for (const [espnId, gs] of Object.entries(gameStateMap)) {
        if (gs.team) {
          const abbr = gs.team.toUpperCase()
          const match = liveGames.find((g) =>
            g.home_team.toUpperCase().includes(abbr) || g.away_team.toUpperCase().includes(abbr) ||
            g.home_team.split(' ').pop().toUpperCase().startsWith(abbr.slice(0, 3)) ||
            g.away_team.split(' ').pop().toUpperCase().startsWith(abbr.slice(0, 3))
          )
          if (match) {
            gs.status = match.status
            gs.period = match.period
            gs.clock = match.clock
            gs.homeTeam = match.home_team
            gs.awayTeam = match.away_team
            gs.homeScore = match.live_home_score ?? match.home_score ?? 0
            gs.awayScore = match.live_away_score ?? match.away_score ?? 0
          }
        }
      }
    }
  }

  // Fetch player stats for today (used for game status detection + stat breakdowns)
  const playerStatsMap = {}
  if (allEspnIds.length) {
    const { data: stats } = await supabase
      .from('nba_dfs_player_stats')
      .select('espn_player_id, fantasy_points, minutes_played, points, rebounds, assists, steals, blocks, turnovers, three_pointers_made')
      .eq('game_date', date)
      .eq('season', s)
      .in('espn_player_id', [...new Set(allEspnIds)])

    for (const stat of stats || []) {
      playerStatsMap[stat.espn_player_id] = {
        pts: stat.points || 0,
        reb: stat.rebounds || 0,
        ast: stat.assists || 0,
        stl: stat.steals || 0,
        blk: stat.blocks || 0,
        to: stat.turnovers || 0,
        threes: stat.three_pointers_made || 0,
        min: stat.minutes_played || 0,
        fpts: Number(stat.fantasy_points) || 0,
      }
      if (gameStateMap[stat.espn_player_id]) {
        gameStateMap[stat.espn_player_id].hasStats = true
      }
    }
  }

  // Fetch scoreboard to get actual live/final status
  const dateStr = date.replace(/-/g, '')
  let gameStatuses = {} // team abbreviation -> 'pre' | 'in' | 'post'
  try {
    const espnRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`)
    if (espnRes.ok) {
      const espnData = await espnRes.json()
      for (const event of espnData.events || []) {
        const comp = event.competitions?.[0]
        if (!comp) continue
        const statusType = comp.status?.type?.name || event.status?.type?.name
        let state = 'pre'
        if (['STATUS_IN_PROGRESS', 'STATUS_END_PERIOD', 'STATUS_HALFTIME', 'STATUS_OVERTIME'].includes(statusType)) state = 'in'
        else if (['STATUS_FINAL', 'STATUS_FULL_TIME'].includes(statusType)) state = 'post'

        for (const c of comp.competitors || []) {
          const abbrev = c.team?.abbreviation
          if (abbrev) gameStatuses[abbrev] = state
        }
      }
    }
  } catch { /* ignore */ }

  // Map team abbreviations to player game states
  // Get player teams from salaries
  if (allEspnIds.length) {
    const { data: playerTeams } = await supabase
      .from('nba_dfs_salaries')
      .select('espn_player_id, team')
      .eq('game_date', date)
      .in('espn_player_id', [...new Set(allEspnIds)])

    for (const pt of playerTeams || []) {
      const teamState = gameStatuses[pt.team]
      if (teamState && gameStateMap[pt.espn_player_id]) {
        gameStateMap[pt.espn_player_id].status = teamState === 'in' ? 'live' : teamState === 'post' ? 'final' : 'upcoming'
      }
    }
  }

  // Check if all games today are final
  const allTeamStates = Object.values(gameStatuses)
  const anyLive = allTeamStates.some((s) => s === 'in')
  const allFinal = allTeamStates.length > 0 && allTeamStates.every((s) => s === 'post')

  // Get first tip-off time today
  const { data: firstTipoff } = await supabase
    .from('nba_dfs_salaries')
    .select('game_starts_at')
    .eq('game_date', date)
    .not('game_starts_at', 'is', null)
    .order('game_starts_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // NBA game duration ~150 minutes
  const GAME_DURATION_MIN = 150

  // Build response
  const result = members.map((m) => {
    const roster = rosterMap[m.user_id]
    const isMe = m.user_id === req.user.id
    let minutesRemaining = 0

    const slots = (roster?.nba_dfs_roster_slots || []).map((slot) => {
      const gs = gameStateMap[slot.espn_player_id] || { status: 'upcoming' }
      const visible = isMe || allFinal || gs.status === 'live' || gs.status === 'final'

      // Estimate minutes remaining for this player
      if (gs.status === 'upcoming') {
        minutesRemaining += GAME_DURATION_MIN
      } else if (gs.status === 'live' && gs.gameStartsAt) {
        const elapsed = (now - new Date(gs.gameStartsAt)) / 60000
        minutesRemaining += Math.max(0, GAME_DURATION_MIN - elapsed)
      }
      // final = 0 remaining

      const hasGameStats = (gs.status === 'live' || gs.status === 'final') && visible
      return {
        roster_slot: slot.roster_slot,
        player_name: visible ? slot.player_name : '????',
        espn_player_id: visible ? slot.espn_player_id : null,
        headshot_url: visible ? (gs.headshot_url || null) : null,
        salary: visible ? slot.salary : null,
        points_earned: gs.status === 'live' || gs.status === 'final' ? Number(slot.points_earned) || 0 : 0,
        game_status: gs.status,
        game_period: gs.period || null,
        game_clock: gs.clock || null,
        team: visible ? (gs.team || null) : null,
        opponent: visible ? (gs.opponent || null) : null,
        home_team: gs.homeTeam || null,
        away_team: gs.awayTeam || null,
        home_score: gs.homeScore ?? null,
        away_score: gs.awayScore ?? null,
        stats: hasGameStats ? (playerStatsMap[slot.espn_player_id] || null) : null,
      }
    })

    const totalPoints = slots.reduce((sum, s) => sum + (s.points_earned || 0), 0)
    const hasLive = slots.some((s) => s.game_status === 'live')
    const allDone = slots.length > 0 && slots.every((s) => s.game_status === 'final')
    const userStatus = allDone ? 'final' : hasLive ? 'live' : 'upcoming'

    return {
      user: m.users,
      user_id: m.user_id,
      total_points: totalPoints,
      status: userStatus,
      has_roster: !!roster,
      minutes_remaining: Math.round(minutesRemaining),
      slots,
    }
  })

  // Sort by total points descending
  result.sort((a, b) => b.total_points - a.total_points)

  res.json({
    members: result,
    any_live: anyLive,
    all_final: allFinal,
    first_tipoff: firstTipoff?.game_starts_at || null,
  })
})

// Look up ESPN player ID by name (for connecting props to game logs)
router.get('/player/lookup', async (req, res) => {
  const { name, sport } = req.query
  if (!name) return res.status(400).json({ error: 'name required' })

  // Try DFS salaries table (NBA first, then MLB)
  const { data } = await supabase
    .from('nba_dfs_salaries')
    .select('espn_player_id, player_name, headshot_url, team, position')
    .ilike('player_name', `%${name}%`)
    .order('game_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (data) return res.json(data)

  const { data: mlbData } = await supabase
    .from('mlb_dfs_salaries')
    .select('espn_player_id, player_name, headshot_url, team, position')
    .ilike('player_name', `%${name}%`)
    .order('game_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (mlbData) return res.json(mlbData)

  // Fallback: look up headshot from ESPN cache for other sports
  const sportPath = ESPN_SPORT_PATHS[sport] || 'basketball/nba'
  const { refreshPlayerHeadshotCache, getPlayerHeadshotUrl } = await import('../services/espnService.js')
  await refreshPlayerHeadshotCache(sportPath)
  const headshot = getPlayerHeadshotUrl(name, sportPath)

  if (headshot) {
    return res.json({ player_name: name, headshot_url: headshot, team: null, position: null, espn_player_id: null })
  }

  return res.status(404).json({ error: 'Player not found' })
})

// ESPN sport paths for game logs
const ESPN_SPORT_PATHS = {
  basketball_nba: 'basketball/nba',
  baseball_mlb: 'baseball/mlb',
  americanfootball_nfl: 'football/nfl',
  icehockey_nhl: 'hockey/nhl',
}

// NBA stat columns for game log
const NBA_GAME_COLS = (statMap) => ({
  pts: parseInt(statMap.PTS) || 0,
  reb: parseInt(statMap.REB) || 0,
  ast: parseInt(statMap.AST) || 0,
  stl: parseInt(statMap.STL) || 0,
  blk: parseInt(statMap.BLK) || 0,
  to: parseInt(statMap.TO) || 0,
  min: parseInt(statMap.MIN) || 0,
  threes: statMap['3PT'] || '0',
  fg: statMap.FG || '0',
})

// MLB stat columns for game log
const MLB_GAME_COLS = (statMap) => ({
  ab: parseInt(statMap.AB) || 0,
  h: parseInt(statMap.H) || 0,
  r: parseInt(statMap.R) || 0,
  hr: parseInt(statMap.HR) || 0,
  rbi: parseInt(statMap.RBI) || 0,
  bb: parseInt(statMap.BB) || 0,
  so: parseInt(statMap.SO) || 0,
  sb: parseInt(statMap.SB) || 0,
  avg: statMap.AVG || '.000',
})

// NFL stat columns for game log
const NFL_GAME_COLS = (statMap) => ({
  pass_yds: parseInt(statMap['PYDS'] || statMap['Pass YDS']) || 0,
  pass_td: parseInt(statMap['PTD'] || statMap['Pass TD']) || 0,
  int: parseInt(statMap['INT']) || 0,
  rush_yds: parseInt(statMap['RYDS'] || statMap['Rush YDS']) || 0,
  rush_td: parseInt(statMap['RTD'] || statMap['Rush TD']) || 0,
  rec: parseInt(statMap['REC']) || 0,
  rec_yds: parseInt(statMap['RECYDS'] || statMap['Rec YDS']) || 0,
  rec_td: parseInt(statMap['RECTD'] || statMap['Rec TD']) || 0,
})

// Player game log — last 10 games (supports NBA, MLB, and NFL)
router.get('/player/:espnId/gamelog', async (req, res) => {
  const { espnId } = req.params
  const sport = req.query.sport || 'basketball_nba'
  const espnPath = ESPN_SPORT_PATHS[sport] || 'basketball/nba'

  try {
    const seasonYear = new Date().getFullYear()
    const seasonParam = sport !== 'basketball_nba' ? `?season=${seasonYear}` : ''
    const response = await fetch(`https://site.api.espn.com/apis/common/v3/sports/${espnPath}/athletes/${espnId}/gamelog${seasonParam}`)
    if (!response.ok) return res.status(404).json({ error: 'Player not found' })
    const data = await response.json()

    const labels = data.labels || []
    const eventsMap = data.events || {}
    // Prefer regular season, fall back to any season type with games
    const regSeason = data.seasonTypes?.find((s) => s.displayName?.includes('Regular'))
    const anySeason = regSeason || data.seasonTypes?.[0]
    const allGames = []
    for (const cat of anySeason?.categories || []) {
      for (const ev of cat.events || []) allGames.push(ev)
    }

    const isMLB = sport === 'baseball_mlb'
    const isNFL = sport === 'americanfootball_nfl'
    const colParser = isMLB ? MLB_GAME_COLS : isNFL ? NFL_GAME_COLS : NBA_GAME_COLS

    const games = allGames.slice(0, 10).map((ev) => {
      const detail = eventsMap[ev.eventId] || {}
      const statMap = {}
      labels.forEach((l, i) => { statMap[l] = ev.stats?.[i] })

      return {
        date: detail.gameDate || null,
        opponent: detail.opponent?.displayName || detail.opponent?.abbreviation || '?',
        result: detail.gameResult || null,
        ...colParser(statMap),
      }
    })

    // Season averages
    const statsRes = await fetch(`https://site.api.espn.com/apis/common/v3/sports/${espnPath}/athletes/${espnId}/stats${seasonParam}`)
    let averages = null
    if (statsRes.ok) {
      const statsData = await statsRes.json()
      const avgs = statsData.categories?.find((c) => c.name === 'averages')
      if (avgs?.labels && avgs?.statistics?.length) {
        const sLabels = avgs.labels
        const latest = avgs.statistics[avgs.statistics.length - 1]
        const vals = latest.stats || []
        const get = (label) => { const idx = sLabels.indexOf(label); return idx >= 0 ? vals[idx] : '0' }

        if (isMLB) {
          averages = {
            avg: get('AVG'), hr: get('HR'), rbi: get('RBI'),
            r: get('R'), sb: get('SB'), obp: get('OBP'),
            ops: get('OPS'), gp: get('GP'),
          }
        } else if (isNFL) {
          averages = {
            pass_yds: get('PYDS'), pass_td: get('PTD'), int: get('INT'),
            rush_yds: get('RYDS'), rush_td: get('RTD'),
            rec: get('REC'), rec_yds: get('RECYDS'), rec_td: get('RECTD'),
            gp: get('GP'),
          }
        } else {
          averages = {
            ppg: get('PTS'), rpg: get('REB'), apg: get('AST'),
            spg: get('STL'), bpg: get('BLK'), tpg: get('TO'),
            mpg: get('MIN'), gp: get('GP'),
          }
        }
      }
    }

    res.json({ games, averages, sport })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch game log' })
  }
})

export default router
