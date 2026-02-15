import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import {
  getMyConnections,
  getPendingRequests,
  getConnectionActivity,
  sendConnectionRequest,
  acceptConnectionRequest,
  declineConnectionRequest,
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
  const activity = await getConnectionActivity(req.user.id)
  res.json(activity)
})

const sendRequestSchema = z.object({
  username: z.string().min(1),
})

router.post('/request', requireAuth, validate(sendRequestSchema), async (req, res) => {
  const connection = await sendConnectionRequest(req.user.id, req.validated.username)
  res.status(201).json(connection)
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
