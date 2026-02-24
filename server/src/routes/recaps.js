import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getLatestRecap, getRecapArchive } from '../services/recapService.js'

const router = Router()

router.get('/latest', requireAuth, async (req, res) => {
  const recap = await getLatestRecap()
  res.json(recap)
})

router.get('/archive', requireAuth, async (req, res) => {
  const recaps = await getRecapArchive()
  res.json(recaps)
})

export default router
