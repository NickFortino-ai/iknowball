import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import {
  sendMessage,
  getConversations,
  getThread,
  markThreadRead,
  getUnreadMessageCount,
} from '../services/messageService.js'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  const conversations = await getConversations(req.user.id)
  res.json(conversations)
})

router.get('/unread-count', requireAuth, async (req, res) => {
  const count = await getUnreadMessageCount(req.user.id)
  res.json({ count })
})

router.get('/:partnerId', requireAuth, async (req, res) => {
  const before = req.query.before || null
  const thread = await getThread(req.user.id, req.params.partnerId, before)
  res.json(thread)
})

const sendSchema = z.object({
  content: z.string().min(1).max(2000),
})

router.post('/:partnerId', requireAuth, validate(sendSchema), async (req, res) => {
  const message = await sendMessage(req.user.id, req.params.partnerId, req.validated.content)
  res.status(201).json(message)
})

router.post('/:partnerId/read', requireAuth, async (req, res) => {
  const result = await markThreadRead(req.user.id, req.params.partnerId)
  res.json(result)
})

export default router
