import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { INJURY_SPORTS } from '../config/espnTeamMap.js'

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

  res.json({
    home_team: game.home_team,
    away_team: game.away_team,
    home: homeData ? { starters: homeData.starters || [], injuries: homeData.injuries || [] } : empty,
    away: awayData ? { starters: awayData.starters || [], injuries: awayData.injuries || [] } : empty,
  })
})

export default router
