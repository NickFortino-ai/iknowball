import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { getDraftPlayerDetail } from '../services/fantasyService.js'
import { fetchAll } from '../utils/fetchAll.js'

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

  // Parallel queries so DEFs and Ks are each guaranteed in the pool — both
  // typically have null ADPs (default to 9999), so they'd sink past the
  // offensive slice cutoff if grouped with skill positions.
  // Offensive uses fetchAll (no cap) so deep-league mock drafts (20-team
  // superflex with 20-round rosters can want 400+ offensive picks) never
  // clip a real on-team player. Payload is ~1000 offensive + ~50 K + 32 DEF.
  const [offensiveRows, kickerResult, defResult] = await Promise.all([
    fetchAll(
      supabase
        .from('nfl_players')
        .select(SELECT)
        .in('position', ['QB', 'RB', 'WR', 'TE'])
        .not('team', 'is', null)
        .order('search_rank', { ascending: true, nullsFirst: false })
    ),
    supabase
      .from('nfl_players')
      .select(SELECT)
      .eq('position', 'K')
      .not('team', 'is', null),
    supabase
      .from('nfl_players')
      .select(SELECT)
      .eq('position', 'DEF')
      .not('team', 'is', null),
  ])

  if (kickerResult.error) return res.status(500).json({ error: kickerResult.error.message })
  if (defResult.error) return res.status(500).json({ error: defResult.error.message })

  // Composite ADP score: prefer adp_half_ppr → adp_ppr → search_rank
  // (lower is better in all three). Sort offensive skill players by ADP.
  // No .slice() — return the full offensive pool so deep leagues have
  // headroom and the client can render/filter as needed.
  const offensiveSorted = offensiveRows
    .map((p) => ({
      ...p,
      _adp: p.adp_half_ppr ?? p.adp_ppr ?? p.search_rank ?? 9999,
    }))
    .sort((a, b) => a._adp - b._adp)

  const kickers = (kickerResult.data || [])
    .map((p) => ({
      ...p,
      _adp: p.adp_half_ppr ?? p.adp_ppr ?? p.search_rank ?? 9999,
    }))
    .sort((a, b) => a._adp - b._adp)

  const defs = (defResult.data || [])
    .map((p) => ({
      ...p,
      _adp: p.adp_half_ppr ?? p.adp_ppr ?? p.search_rank ?? 9999,
    }))
    .sort((a, b) => a._adp - b._adp)

  // Concat: skill offense first (ADP-ordered), then all kickers, then all defenses
  const sorted = [...offensiveSorted, ...kickers, ...defs]
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
      const { getPublishedBlurbsForPlayer } = await import('../services/playerBlurbService.js')
      const blurbs = await getPublishedBlurbsForPlayer(req.params.playerId)
      data.blurbs = blurbs
      if (blurbs[0]) data.blurb = blurbs[0]
    } catch {}
    res.json(data)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

export default router
