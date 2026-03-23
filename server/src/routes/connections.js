import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { supabase } from '../config/supabase.js'
import {
  getMyConnections,
  getPendingRequests,
  getConnectionActivity,
  getConnectionStatus,
  sendConnectionRequest,
  acceptConnectionRequest,
  declineConnectionRequest,
  removeConnection,
  sharePickToSquad,
} from '../services/connectionService.js'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  const connections = await getMyConnections(req.user.id)
  res.json(connections)
})

router.get('/pending', requireAuth, async (req, res) => {
  const requests = await getPendingRequests(req.user.id)
  res.json(requests)
})

router.get('/activity', requireAuth, async (req, res) => {
  const before = req.query.before || null
  const VALID_SCOPES = new Set(['squad', 'all', 'highlights', 'hot_takes', 'user_highlights', 'user_hot_takes'])
  const scope = VALID_SCOPES.has(req.query.scope) ? req.query.scope : 'squad'
  const targetUserId = req.query.userId || null

  // Fetch user's timezone for date-boundary calculations
  const { data: user } = await supabase
    .from('users')
    .select('timezone')
    .eq('id', req.user.id)
    .single()

  const activity = await getConnectionActivity(req.user.id, before, scope, targetUserId, user?.timezone)
  res.json(activity)
})

router.get('/status/:userId', requireAuth, async (req, res) => {
  const status = await getConnectionStatus(req.user.id, req.params.userId)
  res.json(status)
})

const sendRequestSchema = z.object({
  username: z.string().min(1),
})

router.post('/request', requireAuth, validate(sendRequestSchema), async (req, res) => {
  const connection = await sendConnectionRequest(req.user.id, req.validated.username)
  res.status(201).json(connection)
})

const shareSchema = z.object({
  pick_id: z.string().uuid(),
})

router.post('/share', requireAuth, validate(shareSchema), async (req, res) => {
  const result = await sharePickToSquad(req.user.id, req.validated.pick_id)
  res.status(201).json(result)
})

router.delete('/:id', requireAuth, async (req, res) => {
  await removeConnection(req.params.id, req.user.id)
  res.status(204).end()
})

router.post('/:id/accept', requireAuth, async (req, res) => {
  const connection = await acceptConnectionRequest(req.params.id, req.user.id)
  res.json(connection)
})

router.post('/:id/decline', requireAuth, async (req, res) => {
  await declineConnectionRequest(req.params.id, req.user.id)
  res.status(204).end()
})

export default router
