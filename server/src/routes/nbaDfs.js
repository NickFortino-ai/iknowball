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

  // Check if first game of the day has started — rosters lock at first tip-off
  const { data: firstGame } = await supabase
    .from('nba_dfs_salaries')
    .select('game_starts_at')
    .eq('game_date', date)
    .not('game_starts_at', 'is', null)
    .order('game_starts_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (firstGame?.game_starts_at && new Date(firstGame.game_starts_at) <= new Date()) {
    return res.status(400).json({ error: 'Rosters are locked — the first game has already started' })
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

export default router
