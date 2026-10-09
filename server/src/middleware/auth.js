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

// Short-lived cache of verified tokens.
//
// supabase.auth.getUser() is a NETWORK round trip to the auth service —
// measured at a ~104ms median — and it ran on every single authenticated
// request. Screens that fan out pay it once per call: the user profile modal
// alone fires eight (profile, picks, parlays, prop picks, bonuses, futures,
// head-to-head, connection status), so roughly 0.8s of the spinner was auth
// overhead before a single query had started, on a one-CPU instance.
//
// 60 seconds is deliberately short. A cached entry is a window in which a
// revoked session still works, so this trades a minute of staleness for
// collapsing a burst into one verification.
const AUTH_CACHE_TTL_MS = 60 * 1000
const AUTH_CACHE_MAX = 2000
const authCache = new Map()

/**
 * The token's own expiry, read WITHOUT verifying it.
 *
 * This never grants trust — Supabase has already verified the token before
 * anything is cached. It only ever SHORTENS the cache window, so a token that
 * expires in 20s is never served from cache for the full 60. Parsing an
 * unverified payload is safe precisely because the answer can only make us
 * more conservative.
 */
function jwtExpiryMs(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' })
  }

  const token = header.slice(7)

  const cached = authCache.get(token)
  if (cached && cached.expiresAt > Date.now()) {
    req.user = cached.user
    touchLastActive(cached.user.id)
    return next()
  }

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    // Failures are never cached — a token that becomes valid (clock skew, a
    // refresh landing mid-flight) must not be locked out for a minute.
    authCache.delete(token)
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // Simple size cap. These are short-lived and keyed by token, so the map
  // would otherwise grow with every refresh for the life of the process.
  if (authCache.size >= AUTH_CACHE_MAX) authCache.clear()
  const tokenExpiry = jwtExpiryMs(token)
  const ttlExpiry = Date.now() + AUTH_CACHE_TTL_MS
  authCache.set(token, {
    user,
    expiresAt: tokenExpiry ? Math.min(ttlExpiry, tokenExpiry) : ttlExpiry,
  })

  req.user = user
  touchLastActive(user.id)
  next()
}
