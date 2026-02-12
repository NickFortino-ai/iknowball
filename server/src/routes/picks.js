import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { submitPick, deletePick, getUserPicks, getUserPickHistory } from '../services/pickService.js'

const router = Router()

const submitPickSchema = z.object({
  game_id: z.string().uuid(),
  picked_team: z.enum(['home', 'away']),
})

router.post('/', requireAuth, validate(submitPickSchema), async (req, res) => {
  const pick = await submitPick(req.user.id, req.validated.game_id, req.validated.picked_team)
  res.status(201).json(pick)
})

router.delete('/:gameId', requireAuth, async (req, res) => {
  await deletePick(req.user.id, req.params.gameId)
  res.status(204).end()
})

router.get('/me', requireAuth, async (req, res) => {
  const picks = await getUserPicks(req.user.id, req.query.status)
  res.json(picks)
})

router.get('/me/history', requireAuth, async (req, res) => {
  const picks = await getUserPickHistory(req.user.id)
  res.json(picks)
})

export default router
