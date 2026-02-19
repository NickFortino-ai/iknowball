import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import {
  getFuturesMarkets,
  getFuturesMarketById,
  submitFuturesPick,
  getUserFuturesPicks,
  getUserFuturesPickHistory,
} from '../services/futuresService.js'

const router = Router()

const submitFuturesPickSchema = z.object({
  market_id: z.string().uuid(),
  picked_outcome: z.string().min(1),
})

router.get('/markets', requireAuth, async (req, res) => {
  const markets = await getFuturesMarkets(req.query.sport, req.query.status || 'active')
  res.json(markets)
})

router.get('/markets/:marketId', requireAuth, async (req, res) => {
  const market = await getFuturesMarketById(req.params.marketId)
  res.json(market)
})

router.post('/picks', requireAuth, validate(submitFuturesPickSchema), async (req, res) => {
  const pick = await submitFuturesPick(req.user.id, req.validated.market_id, req.validated.picked_outcome)
  res.status(201).json(pick)
})

router.get('/picks/me', requireAuth, async (req, res) => {
  const picks = await getUserFuturesPicks(req.user.id, req.query.status)
  res.json(picks)
})

router.get('/picks/me/history', requireAuth, async (req, res) => {
  const picks = await getUserFuturesPickHistory(req.user.id)
  res.json(picks)
})

export default router
