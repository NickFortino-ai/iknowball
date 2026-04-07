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
  // Note: don't filter by status='Active' — Sleeper's DEF "players" don't
  // carry that field, so the filter would silently drop every defense.
  // The team-IS-NOT-NULL + position filter is enough to exclude retired/FA.
  const { data, error } = await supabase
    .from('nfl_players')
    .select('id, full_name, position, team, headshot_url, search_rank, injury_status, bye_week, projected_pts_half_ppr, projected_pts_ppr, projected_pts_std, adp_ppr, adp_half_ppr')
    .in('position', ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
    .not('team', 'is', null)
    .order('search_rank', { ascending: true, nullsFirst: false })
    .limit(500)

  if (error) return res.status(500).json({ error: error.message })

  // Composite ADP score: prefer adp_half_ppr → adp_ppr → search_rank
  // (lower is better in all three). Truncate to top 300, then attach an
  // overall_rank (1-based) so the frontend can show the same rank
  // regardless of position filter.
  const sorted = (data || [])
    .map((p) => ({
      ...p,
      _adp: p.adp_half_ppr ?? p.adp_ppr ?? p.search_rank ?? 9999,
    }))
    .sort((a, b) => a._adp - b._adp)
    .slice(0, 300)
    .map((p, i) => ({ ...p, overall_rank: i + 1 }))

  res.json(sorted)
})

// Mock draft player detail — same shape as the league endpoint, no league context
router.get('/players/:playerId/detail', requireAuth, async (req, res) => {
  const scoring = req.query.scoring || 'ppr'
  try {
    const data = await getDraftPlayerDetail(req.params.playerId, { scoringFormat: scoring })
    res.json(data)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

export default router
