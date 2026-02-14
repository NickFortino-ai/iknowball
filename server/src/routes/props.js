import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  getFeaturedProp,
  submitPropPick,
  deletePropPick,
  getUserPropPicks,
  getUserPropPickHistory,
} from '../services/propService.js'

const router = Router()

router.use(requireAuth)

// Get featured prop for a specific date
router.get('/featured', async (req, res) => {
  const { date } = req.query
  if (!date) {
    return res.status(400).json({ error: 'date query parameter is required' })
  }
  const prop = await getFeaturedProp(date)
  res.json(prop)
})

// Submit a prop pick
router.post('/picks', async (req, res) => {
  const { prop_id, picked_side } = req.body
  if (!prop_id || !picked_side) {
    return res.status(400).json({ error: 'prop_id and picked_side are required' })
  }
  const pick = await submitPropPick(req.user.id, prop_id, picked_side)
  res.json(pick)
})

// Delete a pending prop pick
router.delete('/picks/:propId', async (req, res) => {
  await deletePropPick(req.user.id, req.params.propId)
  res.status(204).end()
})

// Get user's prop picks
router.get('/picks/me', async (req, res) => {
  const { status } = req.query
  const picks = await getUserPropPicks(req.user.id, status)
  res.json(picks)
})

// Get user's settled prop pick history
router.get('/picks/me/history', async (req, res) => {
  const picks = await getUserPropPickHistory(req.user.id)
  res.json(picks)
})

export default router
