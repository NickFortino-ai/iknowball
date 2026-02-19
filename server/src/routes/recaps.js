import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getLatestRecap } from '../services/recapService.js'

const router = Router()

router.get('/latest', requireAuth, async (req, res) => {
  const recap = await getLatestRecap()
  res.json(recap)
})

export default router
