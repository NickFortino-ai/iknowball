import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createParlay, deleteParlay, getUserParlays, getUserParlayHistory, getParlayById } from '../services/parlayService.js'

const router = Router()

const createParlaySchema = z.object({
  legs: z.array(
    z.object({
      game_id: z.string().uuid(),
      picked_team: z.enum(['home', 'away']),
    })
  ).min(2).max(5),
})

router.post('/', requireAuth, validate(createParlaySchema), async (req, res) => {
  const parlay = await createParlay(req.user.id, req.validated.legs)
  res.status(201).json(parlay)
})

router.get('/me', requireAuth, async (req, res) => {
  const parlays = await getUserParlays(req.user.id, req.query.status)
  res.json(parlays)
})

router.get('/me/history', requireAuth, async (req, res) => {
  const parlays = await getUserParlayHistory(req.user.id)
  res.json(parlays)
})

router.get('/:parlayId', requireAuth, async (req, res) => {
  const parlay = await getParlayById(req.params.parlayId)
  res.json(parlay)
})

router.delete('/:parlayId', requireAuth, async (req, res) => {
  await deleteParlay(req.user.id, req.params.parlayId)
  res.status(204).end()
})

export default router
