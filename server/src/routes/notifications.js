import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
} from '../services/notificationService.js'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  const notifications = await getNotifications(req.user.id)
  res.json(notifications)
})

router.get('/unread-count', requireAuth, async (req, res) => {
  const count = await getUnreadCount(req.user.id)
  res.json({ count })
})

router.post('/mark-all-read', requireAuth, async (req, res) => {
  await markAllRead(req.user.id)
  res.json({ success: true })
})

router.post('/:id/read', requireAuth, async (req, res) => {
  await markRead(req.user.id, req.params.id)
  res.json({ success: true })
})

export default router
