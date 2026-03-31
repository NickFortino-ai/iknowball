import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { INJURY_SPORTS } from '../config/espnTeamMap.js'
import { logger } from '../utils/logger.js'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'
const ESPN_PATHS = {
  basketball_nba: 'basketball/nba',
  basketball_wnba: 'basketball/wnba',
  americanfootball_nfl: 'football/nfl',
  baseball_mlb: 'baseball/mlb',
  icehockey_nhl: 'hockey/nhl',
}

const router = Router()

const supportedSports = new Set(Object.keys(INJURY_SPORTS))

// GET /api/injuries/counts?game_ids=id1,id2,...
// Bulk endpoint — returns { gameId: { home: count, away: count } } for games with injuries
router.get('/counts', requireAuth, async (req, res) => {
  const { game_ids } = req.query
  if (!game_ids) return res.json({})

  const ids = game_ids.split(',').filter(Boolean).slice(0, 50)
  if (!ids.length) return res.json({})

  // Get games with their sport keys
  const { data: games, error: gamesErr } = await supabase
    .from('games')
    .select('id, home_team, away_team, sports!inner(key)')
    .in('id', ids)

  if (gamesErr || !games?.length) return res.json({})

  // Filter to supported sports only
  const relevantGames = games.filter((g) => supportedSports.has(g.sports?.key))
  if (!relevantGames.length) return res.json({})

  // Collect unique team names for lookup
  const teamNames = new Set()
  for (const g of relevantGames) {
    teamNames.add(g.home_team)
    teamNames.add(g.away_team)
  }

  const { data: intel } = await supabase
    .from('team_intel')
    .select('team_name, sport_key, notable_injury_count')
    .in('team_name', [...teamNames])
    .gt('notable_injury_count', 0)

  if (!intel?.length) return res.json({})

  // Build lookup: teamName+sportKey → count
  const countMap = {}
  for (const row of intel) {
    countMap[`${row.team_name}|${row.sport_key}`] = row.notable_injury_count
  }

  const result = {}
  for (const g of relevantGames) {
    const sportKey = g.sports.key
    const home = countMap[`${g.home_team}|${sportKey}`] || 0
    const away = countMap[`${g.away_team}|${sportKey}`] || 0
    if (home > 0 || away > 0) {
      result[g.id] = { home, away }
    }
  }

  res.json(result)
})

// GET /api/injuries/:game_id
// Full detail for the modal
router.get('/:game_id', requireAuth, async (req, res) => {
  const { game_id } = req.params

  const { data: game, error: gameErr } = await supabase
    .from('games')
    .select('id, home_team, away_team, sports!inner(key)')
    .eq('id', game_id)
    .single()

  if (gameErr || !game) {
    return res.status(404).json({ error: 'Game not found' })
  }

  const empty = { starters: [], injuries: [] }

  if (!supportedSports.has(game.sports?.key)) {
    return res.json({ home_team: game.home_team, away_team: game.away_team, home: empty, away: empty })
  }

  const { data: intel } = await supabase
    .from('team_intel')
    .select('team_name, starters, injuries')
    .eq('sport_key', game.sports.key)
    .in('team_name', [game.home_team, game.away_team])

  const homeData = intel?.find((r) => r.team_name === game.home_team)
  const awayData = intel?.find((r) => r.team_name === game.away_team)

  // Fetch team records and L10 from ESPN scoreboard
  let homeRecord = null, awayRecord = null, homeLast10 = null, awayLast10 = null
  const espnPath = ESPN_PATHS[game.sports.key]
  if (espnPath && game.id) {
    try {
      const { data: gameRow } = await supabase.from('games').select('starts_at').eq('id', game_id).single()
      if (gameRow?.starts_at) {
        // Use ET date to avoid UTC date shift for evening games
        const d = new Date(gameRow.starts_at)
        const etDate = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }))
        const dateStr = `${etDate.getFullYear()}${String(etDate.getMonth() + 1).padStart(2, '0')}${String(etDate.getDate()).padStart(2, '0')}`
        const espnRes = await fetch(`${ESPN_BASE}/${espnPath}/scoreboard?dates=${dateStr}`)
        if (espnRes.ok) {
          const espnData = await espnRes.json()
          const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
          const matchTeam = (a, b) => {
            const an = normalize(a), bn = normalize(b)
            if (an === bn || an.includes(bn) || bn.includes(an)) return true
            const al = an.split(/\s+/).pop(), bl = bn.split(/\s+/).pop()
            return al.length > 2 && al === bl
          }
          const ev = (espnData.events || []).find((e) => {
            const c = e.competitions?.[0]
            if (!c) return false
            const h = c.competitors?.find((x) => x.homeAway === 'home')
            const a = c.competitors?.find((x) => x.homeAway === 'away')
            return h && a && matchTeam(h.team?.displayName || '', game.home_team) && matchTeam(a.team?.displayName || '', game.away_team)
          })
          if (ev) {
            const comp = ev.competitions[0]
            const h = comp.competitors.find((c) => c.homeAway === 'home')
            const a = comp.competitors.find((c) => c.homeAway === 'away')
            homeRecord = h?.records?.find((r) => r.name === 'overall' || r.type === 'total')?.summary || h?.records?.[0]?.summary || null
            awayRecord = a?.records?.find((r) => r.name === 'overall' || r.type === 'total')?.summary || a?.records?.[0]?.summary || null
            homeLast10 = h?.records?.find((r) => r.name === 'Last Ten Games' || r.name === 'last10')?.summary || null
            awayLast10 = a?.records?.find((r) => r.name === 'Last Ten Games' || r.name === 'last10')?.summary || null
          }
        }
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to fetch team records from ESPN')
    }
  }

  res.json({
    home_team: game.home_team,
    away_team: game.away_team,
    home: homeData ? { starters: homeData.starters || [], injuries: homeData.injuries || [] } : empty,
    away: awayData ? { starters: awayData.starters || [], injuries: awayData.injuries || [] } : empty,
    homeRecord,
    awayRecord,
    homeLast10,
    awayLast10,
  })
})

export default router
