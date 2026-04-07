import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'

const router = Router()

/**
 * GET /api/mock-draft/players
 *
 * Returns the top ~250 active NFL players ordered by half-PPR projection
 * with everything the client needs to run a fully-offline mock draft
 * (bots + UI) without further API calls.
 */
router.get('/players', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('nfl_players')
    .select('id, full_name, position, team, headshot_url, search_rank, injury_status, bye_week, projected_pts_half_ppr, projected_pts_ppr, projected_pts_std')
    .eq('status', 'Active')
    .in('position', ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
    .not('team', 'is', null)
    // Sleeper's search_rank IS the ADP-equivalent — order primarily by it.
    // Projection columns can be sparse pre-season; ADP rank is always populated.
    .order('search_rank', { ascending: true, nullsFirst: false })
    .limit(300)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

export default router
