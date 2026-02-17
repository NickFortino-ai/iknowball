import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import {
  savePushSubscription,
  deletePushSubscription,
  getUserPushSubscriptions,
} from '../services/pushService.js'

const router = Router()

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
})

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
})

router.post('/subscribe', requireAuth, validate(subscribeSchema), async (req, res) => {
  const subscription = await savePushSubscription(req.user.id, req.validated)
  res.status(201).json(subscription)
})

router.post('/unsubscribe', requireAuth, validate(unsubscribeSchema), async (req, res) => {
  await deletePushSubscription(req.user.id, req.validated.endpoint)
  res.status(204).end()
})

router.get('/status', requireAuth, async (req, res) => {
  const status = await getUserPushSubscriptions(req.user.id)
  res.json(status)
})

export default router
