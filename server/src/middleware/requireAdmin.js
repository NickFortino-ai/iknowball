import { supabase } from '../config/supabase.js'

export async function requireAdmin(req, res, next) {
  const userId = req.user?.id
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .single()

  if (error || !user?.is_admin) {
    return res.status(403).json({ error: 'Admin access required' })
  }

  next()
}
