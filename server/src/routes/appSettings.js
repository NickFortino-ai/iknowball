import { Router } from 'express'
import { supabase } from '../config/supabase.js'

// Public read for app_settings (admin writes still live under /admin/app-settings).
// Needed by CreateLeaguePage so non-admin users see the same disabled_format_cards
// filter the admin sees — the admin router gates every route with requireAdmin,
// which silently 403'd this read for every regular user.
const router = Router()

router.get('/:key', async (req, res) => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value, updated_at')
    .eq('key', req.params.key)
    .maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || null)
})

export default router
