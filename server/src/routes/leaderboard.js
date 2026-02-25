import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getLeaderboard, getUsersByTier } from '../services/leaderboardService.js'
import { getRoyaltyData } from '../services/recordService.js'

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

router.get('/royalty', requireAuth, async (req, res, next) => {
  try {
    const data = await getRoyaltyData()
    res.json(data)
  } catch (err) {
    next(err)
  }
})

export default router
