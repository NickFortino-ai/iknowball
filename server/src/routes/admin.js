import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { syncOdds } from '../jobs/syncOdds.js'
import { scoreGames } from '../jobs/scoreGames.js'
import {
  syncPropsForGame,
  getAllPropsForGame,
  featureProp,
  unfeatureProp,
  settleProps,
  getFeaturedProps,
} from '../services/propService.js'

const router = Router()

// All admin routes require auth + admin
router.use(requireAuth, requireAdmin)

// System actions
router.post('/sync-odds', async (req, res) => {
  await syncOdds()
  res.json({ message: 'Odds sync complete' })
})

router.post('/score-games', async (req, res) => {
  await scoreGames()
  res.json({ message: 'Game scoring complete' })
})

// Props management
router.post('/props/sync', async (req, res) => {
  const { gameId, markets } = req.body
  if (!gameId) {
    return res.status(400).json({ error: 'gameId is required' })
  }
  const result = await syncPropsForGame(gameId, markets)
  res.json(result)
})

router.get('/props/game/:gameId', async (req, res) => {
  const props = await getAllPropsForGame(req.params.gameId)
  res.json(props)
})

router.get('/props/featured', async (req, res) => {
  const props = await getFeaturedProps()
  res.json(props)
})

router.post('/props/feature', async (req, res) => {
  const { propId, featuredDate } = req.body
  if (!propId || !featuredDate) {
    return res.status(400).json({ error: 'propId and featuredDate are required' })
  }
  const result = await featureProp(propId, featuredDate)
  res.json(result)
})

router.post('/props/:propId/unfeature', async (req, res) => {
  const result = await unfeatureProp(req.params.propId)
  res.json(result)
})

router.post('/props/settle', async (req, res) => {
  const { settlements } = req.body
  if (!settlements?.length) {
    return res.status(400).json({ error: 'settlements array is required' })
  }
  const results = await settleProps(settlements)
  res.json(results)
})

export default router
