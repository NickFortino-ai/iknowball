import { Router } from 'express'
import { supabase } from '../config/supabase.js'

// Public read for season_dates. Admin writes still live under
// /admin/season-dates (requireAdmin), but every user needs to read these
// so the client-side isSeasonUnderway / arePlayoffsUnderway helpers can
// consult admin-defined dates instead of hardcoded fallbacks.
const router = Router()

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('season_dates')
    .select('sport_key, season_year, regular_season_starts_at, regular_season_ends_at, playoff_ends_at')
    .order('season_year', { ascending: false })
    .order('sport_key')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

export default router
