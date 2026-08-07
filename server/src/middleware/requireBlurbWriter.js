import { supabase } from '../config/supabase.js'

// Gates player-blurb routes. Passes if the caller is either a full
// admin (is_admin = true) or a designated writer (is_writer = true).
// Assumes requireAuth already ran (so req.user.id is present).
export async function requireBlurbWriter(req, res, next) {
  const userId = req.user?.id
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('is_admin, is_writer')
    .eq('id', userId)
    .single()

  if (error) {
    return res.status(500).json({ error: 'Failed to check writer role' })
  }

  if (!user?.is_admin && !user?.is_writer) {
    return res.status(403).json({ error: 'Writer or admin access required' })
  }

  next()
}
