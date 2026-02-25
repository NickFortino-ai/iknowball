import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getAllRecords, getRecordHistory } from '../services/recordService.js'
import { supabase } from '../config/supabase.js'

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

// GET /api/records/pick/:pickId — fetch a single pick with game data (for record detail)
router.get('/pick/:pickId', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('picks')
      .select('*, games(*, sports(key, name))')
      .eq('id', req.params.pickId)
      .single()
    if (error || !data) return res.status(404).json({ error: 'Pick not found' })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/records/parlay/:parlayId — fetch a single parlay with legs (for record detail)
router.get('/parlay/:parlayId', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('parlays')
      .select('*, parlay_legs(*, games(home_team, away_team, sports(key, name)))')
      .eq('id', req.params.parlayId)
      .single()
    if (error || !data) return res.status(404).json({ error: 'Parlay not found' })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/records/futures-pick/:pickId — fetch a single futures pick with market data
router.get('/futures-pick/:pickId', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('futures_picks')
      .select('*, futures_markets(*)')
      .eq('id', req.params.pickId)
      .single()
    if (error || !data) return res.status(404).json({ error: 'Futures pick not found' })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

export default router
