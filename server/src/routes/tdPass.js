import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  getAvailableQBs,
  getMyPicks,
  getLeaguePicks,
  submitPick,
  getStandings,
  getCurrentNflWeek,
  getSeasonOpenerKickoff,
} from '../services/tdPassService.js'

const router = Router()
router.use(requireAuth)

router.get('/current-week', async (req, res, next) => {
  try {
    const data = await getCurrentNflWeek()
    res.json(data)
  } catch (err) {
    next(err)
  }
})

router.get('/season-opener', async (req, res, next) => {
  try {
    const opener = await getSeasonOpenerKickoff()
    res.json({ opener })
  } catch (err) {
    next(err)
  }
})

router.get('/qbs', async (req, res, next) => {
  try {
    const { league_id } = req.query
    if (!league_id) return res.status(400).json({ error: 'league_id required' })
    const data = await getAvailableQBs(league_id, req.user.id)
    res.json(data)
  } catch (err) {
    next(err)
  }
})

router.get('/my-picks', async (req, res, next) => {
  try {
    const { league_id } = req.query
    if (!league_id) return res.status(400).json({ error: 'league_id required' })
    const data = await getMyPicks(league_id, req.user.id)
    res.json(data)
  } catch (err) {
    next(err)
  }
})

router.get('/league-picks', async (req, res, next) => {
  try {
    const { league_id } = req.query
    if (!league_id) return res.status(400).json({ error: 'league_id required' })
    const data = await getLeaguePicks(league_id)
    res.json(data)
  } catch (err) {
    next(err)
  }
})

router.post('/picks', async (req, res, next) => {
  try {
    const { league_id, qb_player_id } = req.body
    if (!league_id) return res.status(400).json({ error: 'league_id required' })
    const data = await submitPick(league_id, req.user.id, qb_player_id)
    res.json(data)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

router.get('/standings', async (req, res, next) => {
  try {
    const { league_id } = req.query
    if (!league_id) return res.status(400).json({ error: 'league_id required' })
    const data = await getStandings(league_id)
    res.json(data)
  } catch (err) {
    next(err)
  }
})

export default router
