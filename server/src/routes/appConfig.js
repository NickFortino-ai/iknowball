import { Router } from 'express'
import { supabase } from '../config/supabase.js'

const router = Router()

// Public GET — returns all config keys as a flat object. Tiny payload,
// safe to cache aggressively on the client (5-min). No auth required so
// the first paint of Hub / Leaderboard doesn't block on a session.
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('app_config')
    .select('key, value')

  if (error) {
    return res.status(500).json({ error: 'Failed to load app config' })
  }

  const config = {}
  for (const row of data || []) {
    config[row.key] = row.value
  }
  res.json(config)
})

export default router
