import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import {
  getFeaturedProps,
  submitPropPick,
  deletePropPick,
  getUserPropPicks,
  getUserPropPickHistory,
  getUserLivePropStats,
  getPropPickById,
  loadPropsForSportMarket,
} from '../services/propService.js'

const router = Router()

router.use(requireAuth)

// Get featured props for a specific date
router.get('/featured', async (req, res) => {
  const { date, fallback } = req.query
  if (!date) {
    return res.status(400).json({ error: 'date query parameter is required' })
  }
  const props = await getFeaturedProps(date, { fallback: fallback === 'true' })
  res.json(props)
})

// User-facing prop loader for the Props tab. Loads today's slate of props
// for a single (sport, market) — fans out to fetchPlayerProps per game,
// upserts new rows as status='published', returns enriched rows.
// Gated by props_sport_visibility so a sport that admin has toggled off
// can't be loaded via a hand-crafted request.
router.get('/load', async (req, res) => {
  const { sport, market } = req.query
  if (!sport || !market) {
    return res.status(400).json({ error: 'sport and market are required' })
  }

  const { data: cfg } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'props_sport_visibility')
    .single()

  const visibility = cfg?.value || {}
  if (!visibility[sport]) {
    return res.status(403).json({ error: `Props for ${sport} are not enabled` })
  }

  try {
    const props = await loadPropsForSportMarket(sport, market)
    res.json(props)
  } catch (err) {
    const status = err.status || 500
    res.status(status).json({ error: err.message })
  }
})

// Submit a prop pick.
//
// chosen_line is optional: when present the pick is a SLIDER pick, always
// "over" that threshold, and the payout is recomputed server-side from the
// measured hit-rate table rather than taken from the request.
router.post('/picks', async (req, res) => {
  const { prop_id, picked_side, chosen_line } = req.body
  if (!prop_id || !picked_side) {
    return res.status(400).json({ error: 'prop_id and picked_side are required' })
  }
  const pick = await submitPropPick(req.user.id, prop_id, picked_side, chosen_line ?? null)
  res.json(pick)
})

// The ladder of lines a prop can be picked at, with what each pays.
//
// Served rather than computed in the browser so the price the slider shows is
// the same one the submit path will charge — a client-side table would drift
// the moment the measured rates are updated.
router.get('/:id/slider', async (req, res, next) => {
  try {
    const { data: prop, error } = await supabase
      .from('player_props')
      .select('id, market_key, line')
      .eq('id', req.params.id)
      .maybeSingle()
    if (error) throw error
    if (!prop) return res.status(404).json({ error: 'Prop not found' })

    const { buildSlider } = await import('../services/propSliderService.js')
    const slider = buildSlider(prop.market_key, Number(prop.line))
    // null for the flat markets — anytime TD and friends, whose line never
    // moves. The client renders today's over/under card for those.
    res.json({ slider })
  } catch (err) {
    next(err)
  }
})

// Delete a pending prop pick
router.delete('/picks/:propId', async (req, res) => {
  await deletePropPick(req.user.id, req.params.propId)
  res.status(204).end()
})

// Get user's prop picks
router.get('/picks/me', async (req, res) => {
  const { status } = req.query
  const picks = await getUserPropPicks(req.user.id, status)
  res.json(picks)
})

// Get user's settled prop pick history
router.get('/picks/me/history', async (req, res) => {
  const picks = await getUserPropPickHistory(req.user.id)
  res.json(picks)
})

// Get user's live prop stats — a compact {pickId: value} map for locked
// picks only. Polled on its own cadence by the client so the main pick list
// endpoint stays fast.
router.get('/picks/me/live-stats', async (req, res) => {
  const stats = await getUserLivePropStats(req.user.id)
  res.json(stats)
})

// Get a single prop pick by ID (must be after /picks/me routes)
router.get('/picks/:propPickId', async (req, res) => {
  const pick = await getPropPickById(req.params.propPickId)
  res.json(pick)
})

export default router
