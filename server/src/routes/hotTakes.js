import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createHotTake, deleteHotTake, getHotTakesByUser, createReminder } from '../services/hotTakeService.js'
import { checkUserMuted, checkContent } from '../services/contentFilterService.js'

const router = Router()

const hotTakeSchema = z.object({
  content: z.string().min(1).max(280),
  team_tag: z.string().max(50).optional(),
  image_url: z.string().url().optional(),
})

router.post('/', requireAuth, validate(hotTakeSchema), async (req, res) => {
  // Check if user is muted
  if (await checkUserMuted(req.user.id)) {
    return res.status(403).json({ error: 'Your posting privileges have been suspended' })
  }

  // Check content against banned words
  const filterResult = await checkContent(req.validated.content)
  if (filterResult.blocked) {
    return res.status(400).json({ error: 'Your post contains inappropriate language. Please revise and try again.' })
  }

  const hotTake = await createHotTake(req.user.id, req.validated.content, req.validated.team_tag, req.validated.image_url)
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
