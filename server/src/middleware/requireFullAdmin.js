import { supabase } from '../config/supabase.js'

// Gates routes that should be visible to FULL admins only — not helpers.
// Reads users.admin_role; NULL or 'full' passes, 'helper' is blocked.
// Assumes requireAdmin already ran (so is_admin = true is guaranteed).
export async function requireFullAdmin(req, res, next) {
  const userId = req.user?.id
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('admin_role')
    .eq('id', userId)
    .single()

  if (error) {
    return res.status(500).json({ error: 'Failed to check admin role' })
  }

  if (user?.admin_role === 'helper') {
    return res.status(403).json({ error: 'Full admin access required' })
  }

  next()
}
