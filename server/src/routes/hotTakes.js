import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createHotTake, deleteHotTake, getHotTakesByUser, createReminder } from '../services/hotTakeService.js'

const router = Router()

const hotTakeSchema = z.object({
  content: z.string().min(1).max(280),
  team_tag: z.string().max(50).optional(),
})

router.post('/', requireAuth, validate(hotTakeSchema), async (req, res) => {
  const hotTake = await createHotTake(req.user.id, req.validated.content, req.validated.team_tag)
  res.status(201).json(hotTake)
})

router.get('/user/:userId', requireAuth, async (req, res) => {
  const data = await getHotTakesByUser(req.params.userId)
  res.json(data)
})

router.post('/:id/remind', requireAuth, async (req, res) => {
  const data = await createReminder(req.user.id, req.params.id)
  res.status(201).json(data)
})

router.delete('/:id', requireAuth, async (req, res) => {
  await deleteHotTake(req.user.id, req.params.id)
  res.status(204).end()
})

export default router
