import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { getDraftPlayerDetail } from '../services/fantasyService.js'

const router = Router()

/**
 * GET /api/mock-draft/players
 *
 * Returns the top ~250 active NFL players ordered by half-PPR projection
 * with everything the client needs to run a fully-offline mock draft
 * (bots + UI) without further API calls.
 */
router.get('/players', requireAuth, async (req, res) => {
  // Pull a wide pool, then sort client-side by best-available signal:
  // adp_half_ppr (most accurate) → adp_ppr → search_rank fallback.
  const SELECT = 'id, full_name, position, team, headshot_url, search_rank, injury_status, bye_week, projected_pts_half_ppr, projected_pts_ppr, projected_pts_std, adp_ppr, adp_half_ppr'

  // Two parallel queries so defenses are guaranteed to make it into the pool.
  // Filter out retired players explicitly alongside team IS NOT NULL.
  const [offensiveResult, defResult] = await Promise.all([
    supabase
      .from('nfl_players')
      .select(SELECT)
      .in('position', ['QB', 'RB', 'WR', 'TE', 'K'])
      .not('team', 'is', null)
      .order('search_rank', { ascending: true, nullsFirst: false })
      .limit(500),
    supabase
      .from('nfl_players')
      .select(SELECT)
      .eq('position', 'DEF')
      .not('team', 'is', null),
  ])

  if (offensiveResult.error) return res.status(500).json({ error: offensiveResult.error.message })
  if (defResult.error) return res.status(500).json({ error: defResult.error.message })

  // Composite ADP score: prefer adp_half_ppr → adp_ppr → search_rank
  // (lower is better in all three). Sort offensive players by ADP and take
  // top 268, then ALWAYS append all 32 DEFs regardless of their ADP.
  // Without this guarantee, DEFs (which all default to _adp=9999) sink to
  // the bottom of the sort and the slice cuts them out.
  const offensiveSorted = (offensiveResult.data || [])
    .map((p) => ({
      ...p,
      _adp: p.adp_half_ppr ?? p.adp_ppr ?? p.search_rank ?? 9999,
    }))
    .sort((a, b) => a._adp - b._adp)
    .slice(0, 268)

  const defs = (defResult.data || [])
    .map((p) => ({
      ...p,
      _adp: p.adp_half_ppr ?? p.adp_ppr ?? p.search_rank ?? 9999,
    }))
    .sort((a, b) => a._adp - b._adp)

  // Concat: offense first (ADP-ordered), then all defenses
  const sorted = [...offensiveSorted, ...defs]
    .map((p, i) => ({ ...p, overall_rank: i + 1 }))

  res.json(sorted)
})

// List the user's saved mocks
router.get('/saved', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('mock_draft_saves')
    .select('id, client_id, payload, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// Save a mock (bookmark). Body: { client_id, payload }
router.post('/saved', requireAuth, async (req, res) => {
  const { client_id, payload } = req.body || {}
  if (!payload) return res.status(400).json({ error: 'payload required' })
  // Dedupe: if same client_id already exists for this user, skip
  if (client_id) {
    const { data: existing } = await supabase
      .from('mock_draft_saves')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('client_id', client_id)
      .maybeSingle()
    if (existing) return res.json(existing)
  }
  const { data, error } = await supabase
    .from('mock_draft_saves')
    .insert({ user_id: req.user.id, client_id: client_id || null, payload })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Delete a saved mock by row id
router.delete('/saved/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('mock_draft_saves')
    .delete()
    .eq('user_id', req.user.id)
    .eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ deleted: true })
})

// Mock draft player detail — same shape as the league endpoint, no league context
router.get('/players/:playerId/detail', requireAuth, async (req, res) => {
  const scoring = req.query.scoring || 'ppr'
  try {
    const data = await getDraftPlayerDetail(req.params.playerId, { scoringFormat: scoring })
    try {
      const { getPublishedBlurb } = await import('../services/playerBlurbService.js')
      const blurb = await getPublishedBlurb(req.params.playerId)
      if (blurb) data.blurb = blurb
    } catch {}
    res.json(data)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

export default router
