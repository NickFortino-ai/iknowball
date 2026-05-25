import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import {
  getWNBAPlayerPool,
  getWNBADFSRoster,
  saveWNBADFSRoster,
  getWNBADFSStandings,
  getWNBANightlyResults,
} from '../services/wnbaDfsService.js'
import { getFantasySettings } from '../services/fantasyService.js'

const router = Router()
router.use(requireAuth)

router.get('/players', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' })
  const data = await getWNBAPlayerPool(date)
  res.json(data)
})

router.get('/roster', async (req, res) => {
  const { league_id, date, season } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })
  const data = await getWNBADFSRoster(league_id, req.user.id, date, parseInt(season || '2026'))
  res.json(data)
})

router.post('/roster', async (req, res) => {
  const { league_id, date, season, slots } = req.body
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })

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

  // Per-player locking — same pattern as NBA DFS. Players whose games have
  // started can't be removed or added.
  const now = new Date()
  const espnIds = (slots || []).map((s) => s.espn_player_id).filter(Boolean)
  const existingRoster = await getWNBADFSRoster(league_id, req.user.id, date, parseInt(season || '2026'))
  if (existingRoster?.wnba_dfs_roster_slots?.length) {
    const existingIds = existingRoster.wnba_dfs_roster_slots.map((s) => s.espn_player_id).filter(Boolean)
    const { data: existingSalaries } = await supabase
      .from('wnba_dfs_salaries')
      .select('espn_player_id, game_starts_at')
      .eq('game_date', date)
      .in('espn_player_id', existingIds)

    const gameTimeMap = {}
    for (const s of existingSalaries || []) gameTimeMap[s.espn_player_id] = s.game_starts_at

    for (const existingSlot of existingRoster.wnba_dfs_roster_slots) {
      const gameTime = gameTimeMap[existingSlot.espn_player_id]
      if (gameTime && new Date(gameTime) <= now) {
        const matchingNew = (slots || []).find((s) => s.roster_slot === existingSlot.roster_slot)
        if (!matchingNew || matchingNew.espn_player_id !== existingSlot.espn_player_id) {
          return res.status(400).json({ error: `${existingSlot.player_name}'s game has started — cannot swap` })
        }
      }
    }
  }

  if (espnIds.length) {
    const { data: newSalaries } = await supabase
      .from('wnba_dfs_salaries')
      .select('espn_player_id, player_name, game_starts_at')
      .eq('game_date', date)
      .in('espn_player_id', espnIds)

    for (const sal of newSalaries || []) {
      if (sal.game_starts_at && new Date(sal.game_starts_at) <= now) {
        const wasExisting = existingRoster?.wnba_dfs_roster_slots?.some(
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

  const data = await saveWNBADFSRoster(league_id, req.user.id, date, season || 2026, slots || [], salaryCap)
  res.json(data)
})

router.get('/standings', async (req, res) => {
  const { league_id } = req.query
  if (!league_id) return res.status(400).json({ error: 'league_id required' })
  const data = await getWNBADFSStandings(league_id)
  res.json(data)
})

router.get('/nightly-results', async (req, res) => {
  const { league_id, date } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })
  const data = await getWNBANightlyResults(league_id, date)
  res.json(data)
})

// WNBA team abbreviation → nickname (used to match games-table rows to
// salary-table abbreviations in live scoring). 13 current franchises +
// the 2026 TOR/POR expansion teams; safe to leave defunct entries out.
const WNBA_TEAMS = {
  ATL: 'Dream', CHI: 'Sky', CON: 'Sun', DAL: 'Wings', GS: 'Valkyries',
  IND: 'Fever', LV: 'Aces', LA: 'Sparks', MIN: 'Lynx', NY: 'Liberty',
  PHX: 'Mercury', SEA: 'Storm', WSH: 'Mystics', TOR: 'Tempo', POR: 'Fire',
}

router.get('/live', async (req, res) => {
  const { league_id, date, season } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })
  const s = parseInt(season || '2026')
  const now = new Date()

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', league_id)

  if (!members?.length) return res.json([])

  const { data: rosters } = await supabase
    .from('wnba_dfs_rosters')
    .select('id, user_id, total_points, wnba_dfs_roster_slots(roster_slot, player_name, espn_player_id, salary, points_earned)')
    .eq('league_id', league_id)
    .eq('game_date', date)
    .eq('season', s)

  const rosterMap = {}
  for (const r of rosters || []) rosterMap[r.user_id] = r

  const allEspnIds = []
  for (const r of rosters || []) {
    for (const slot of r.wnba_dfs_roster_slots || []) {
      if (slot.espn_player_id) allEspnIds.push(slot.espn_player_id)
    }
  }

  const gameStateMap = {}
  if (allEspnIds.length) {
    const { data: salaries } = await supabase
      .from('wnba_dfs_salaries')
      .select('espn_player_id, game_starts_at, headshot_url, team, opponent')
      .eq('game_date', date)
      .in('espn_player_id', [...new Set(allEspnIds)])

    for (const sal of salaries || []) {
      const startTime = sal.game_starts_at ? new Date(sal.game_starts_at) : null
      let status = 'upcoming'
      if (startTime && startTime <= now) status = 'live'
      gameStateMap[sal.espn_player_id] = {
        gameStartsAt: sal.game_starts_at, status,
        headshot_url: sal.headshot_url, team: sal.team, opponent: sal.opponent,
      }
    }
  }

  // Match games-table rows (full team names) back to salary abbreviations.
  const { data: sportRow } = await supabase.from('sports').select('id').eq('key', 'basketball_wnba').single()
  if (sportRow) {
    const todayStart = new Date(date + 'T00:00:00-05:00')
    const todayEnd = new Date(todayStart.getTime() + 36 * 60 * 60 * 1000)
    const { data: liveGames } = await supabase
      .from('games')
      .select('starts_at, period, clock, status, home_team, away_team, live_home_score, live_away_score, home_score, away_score')
      .eq('sport_id', sportRow.id)
      .in('status', ['live', 'final'])
      .gte('starts_at', todayStart.toISOString())
      .lte('starts_at', todayEnd.toISOString())

    const abbrevToGame = {}
    for (const game of liveGames || []) {
      for (const [abbrev, nickname] of Object.entries(WNBA_TEAMS)) {
        if (game.home_team?.includes(nickname)) abbrevToGame[abbrev] = { ...game, homeAbbrev: abbrev }
        if (game.away_team?.includes(nickname)) abbrevToGame[abbrev] = { ...game, awayAbbrev: abbrev }
      }
    }

    for (const [, gs] of Object.entries(gameStateMap)) {
      if (gs.team) {
        const match = abbrevToGame[gs.team.toUpperCase()]
        if (match) {
          gs.status = match.status
          gs.period = match.period
          gs.clock = match.clock
          gs.homeScore = match.live_home_score ?? match.home_score ?? 0
          gs.awayScore = match.live_away_score ?? match.away_score ?? 0
          const oppRaw = gs.opponent || ''
          const isHome = oppRaw.startsWith('vs')
          const oppAbbrev = oppRaw.replace(/^(vs|@)\s*/, '').trim()
          gs.homeAbbrev = isHome ? gs.team.toUpperCase() : oppAbbrev
          gs.awayAbbrev = isHome ? oppAbbrev : gs.team.toUpperCase()
        }
      }
    }
  }

  const playerStatsMap = {}
  if (allEspnIds.length) {
    const { data: stats } = await supabase
      .from('wnba_dfs_player_stats')
      .select('espn_player_id, fantasy_points, minutes_played, points, rebounds, assists, steals, blocks, turnovers, three_pointers_made')
      .eq('game_date', date)
      .eq('season', s)
      .in('espn_player_id', [...new Set(allEspnIds)])

    for (const stat of stats || []) {
      playerStatsMap[stat.espn_player_id] = {
        pts: stat.points || 0, reb: stat.rebounds || 0, ast: stat.assists || 0,
        stl: stat.steals || 0, blk: stat.blocks || 0, to: stat.turnovers || 0,
        threes: stat.three_pointers_made || 0, min: stat.minutes_played || 0,
        fpts: Number(stat.fantasy_points) || 0,
      }
      if (gameStateMap[stat.espn_player_id]) gameStateMap[stat.espn_player_id].hasStats = true
    }
  }

  // Cross-check with ESPN scoreboard for status precision.
  const dateStr = date.replace(/-/g, '')
  const gameStatuses = {}
  try {
    const espnRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${dateStr}`)
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

  if (allEspnIds.length) {
    const { data: playerTeams } = await supabase
      .from('wnba_dfs_salaries')
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

  const allTeamStates = Object.values(gameStatuses)
  const anyLive = allTeamStates.some((st) => st === 'in')
  const allFinal = allTeamStates.length > 0 && allTeamStates.every((st) => st === 'post')

  const { data: firstTipoff } = await supabase
    .from('wnba_dfs_salaries')
    .select('game_starts_at')
    .eq('game_date', date)
    .not('game_starts_at', 'is', null)
    .order('game_starts_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // WNBA games are 40 minutes — ~120 minute total elapsed (with breaks).
  const GAME_DURATION_MIN = 120

  const injuryMap = {}
  if (allEspnIds.length) {
    try {
      const pool = await getWNBAPlayerPool(date)
      for (const p of pool || []) {
        if (p.espn_player_id) injuryMap[p.espn_player_id] = p.injury_status || null
      }
    } catch { /* ignore */ }
  }

  const SLOT_ORDER = ['G1', 'G2', 'F1', 'F2', 'C', 'UTIL1', 'UTIL2', 'UTIL3', 'UTIL4']
  const slotOrderIdx = (slot) => {
    const idx = SLOT_ORDER.indexOf(slot)
    return idx === -1 ? 99 : idx
  }

  const result = members.map((m) => {
    const roster = rosterMap[m.user_id]
    const isMe = m.user_id === req.user.id
    let minutesRemaining = 0

    const slots = (roster?.wnba_dfs_roster_slots || []).slice().sort(
      (a, b) => slotOrderIdx(a.roster_slot) - slotOrderIdx(b.roster_slot)
    ).map((slot) => {
      const gs = gameStateMap[slot.espn_player_id] || { status: 'upcoming' }
      const visible = isMe || allFinal || gs.status === 'live' || gs.status === 'final'

      if (gs.status === 'upcoming') {
        minutesRemaining += GAME_DURATION_MIN
      } else if (gs.status === 'live' && gs.gameStartsAt) {
        const elapsed = (now - new Date(gs.gameStartsAt)) / 60000
        minutesRemaining += Math.max(0, GAME_DURATION_MIN - elapsed)
      }

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
        home_team: gs.homeAbbrev || null,
        away_team: gs.awayAbbrev || null,
        home_score: gs.homeScore ?? null,
        away_score: gs.awayScore ?? null,
        stats: hasGameStats ? (playerStatsMap[slot.espn_player_id] || null) : null,
        injury_status: visible ? (injuryMap[slot.espn_player_id] || null) : null,
      }
    })

    const totalPoints = slots.reduce((sum, s) => sum + (s.points_earned || 0), 0)
    const hasLive = slots.some((slot) => slot.game_status === 'live')
    const allDone = slots.length > 0 && slots.every((slot) => slot.game_status === 'final')
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

  result.sort((a, b) => b.total_points - a.total_points)

  res.json({
    members: result,
    any_live: anyLive,
    all_final: allFinal,
    first_tipoff: firstTipoff?.game_starts_at || null,
  })
})

export default router
