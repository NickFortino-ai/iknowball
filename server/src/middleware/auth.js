import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'
import { supabase as db } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)

// How stale users.last_active_at may get before we write it again.
//
// Deliberately throttled. Stamping a row on EVERY authenticated request
// would be a large volume of writes for a metric -- the same mistake that
// made syncLiveScores rewrite every live game every minute and drove
// Realtime to 24.5M apply_rls calls. At 15 minutes an active user costs at
// most 4 writes an hour, and `users` isn't in the Realtime publication so
// there's no fan-out on top.
const ACTIVITY_STAMP_INTERVAL_MS = 15 * 60 * 1000

// user_id -> last time we wrote. Process-local, so a restart or a second
// instance just means one extra write per user. That's fine; this is a
// metric, not a ledger.
const lastStamped = new Map()

function touchLastActive(userId) {
  if (!userId) return
  const now = Date.now()
  const prev = lastStamped.get(userId)
  if (prev && now - prev < ACTIVITY_STAMP_INTERVAL_MS) return
  lastStamped.set(userId, now)

  // Fire-and-forget: a failed metric write must never fail a user's
  // request, and must never add latency to it.
  db.from('users')
    .update({ last_active_at: new Date(now).toISOString() })
    .eq('id', userId)
    .then(({ error }) => {
      if (error) logger.warn({ err: error.message, userId }, 'Failed to stamp last_active_at')
    })
}

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
  touchLastActive(user.id)
  next()
}
