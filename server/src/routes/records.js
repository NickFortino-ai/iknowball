import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getAllRecords, getRecordHistory } from '../services/recordService.js'

const router = Router()

// GET /api/records — all records with holders + sub-records
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const data = await getAllRecords()
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/records/history — recent record breaks
router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100)
    const data = await getRecordHistory(limit)
    res.json(data)
  } catch (err) {
    next(err)
  }
})

export default router
