import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getLeaderboard, getUsersByTier } from '../services/leaderboardService.js'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  const { scope = 'global', sport } = req.query
  const data = await getLeaderboard(scope, sport)
  res.json(data)
})

router.get('/tier/:tierName', requireAuth, async (req, res) => {
  const data = await getUsersByTier(req.params.tierName)
  res.json(data)
})

export default router
