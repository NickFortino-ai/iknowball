import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' })
  }

  const token = header.slice(7)
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  req.user = user
  next()
}
