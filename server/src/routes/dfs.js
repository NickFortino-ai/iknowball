import { Router } from 'express'
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

export default router
