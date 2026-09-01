import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getReadState, markRead } from '../services/readStateService.js'

const router = Router()

// GET /api/read-state — everything this user has marked read, grouped by
// kind. Fetched once per session and cached client-side; every dot reads
// from that cache rather than hitting this per row.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    res.json(await getReadState(req.user.id))
  } catch (err) {
    next(err)
  }
})

// POST /api/read-state — mark one item read. Fire-and-forget from the
// client, which updates its own cache optimistically.
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { kind, ref_id: refId, value } = req.body || {}
    res.json(await markRead(req.user.id, kind, refId, value))
  } catch (err) {
    next(err)
  }
})

export default router
