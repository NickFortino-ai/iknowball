/**
 * Tiny in-process TTL cache with in-flight de-duplication.
 *
 * Written after the 2026-09-04 draft outage. searchAvailablePlayers was
 * issuing ~28 database round trips per call -- 14 of them paginating the
 * whole 13,102-row nfl_player_stats season table (6.8 MB) just to compute
 * a points column. With 14 people in a draft room polling that endpoint,
 * Supabase's connection pool emptied and EVERY endpoint started failing
 * with PGRST003 / 57014. The app froze and users were logged out.
 *
 * Almost all of that data is static: last season's stat lines, the NFL
 * player pool, the current week's projections. It only needed to be read
 * once, not once per user per poll.
 *
 * The cache stores the PROMISE, not the resolved value. That's the whole
 * trick -- 14 simultaneous callers arriving on a cold key all await the
 * same single query instead of starting 14 of their own. A stampede on
 * expiry is what took the site down; storing the promise makes it
 * impossible.
 *
 * Deliberately not Redis: this data is identical for every instance, cheap
 * to recompute, and tolerates being a few minutes stale. A per-process map
 * needs no new infrastructure before Monday's draft.
 */
import { logger } from './logger.js'

const store = new Map()

// Bounds the map so a caller that builds keys from unbounded input (a
// league id, a scoring-rules hash) can't grow it forever.
const MAX_ENTRIES = 200

function prune(now) {
  for (const [key, entry] of store) {
    if (entry.expires <= now) store.delete(key)
  }
  if (store.size <= MAX_ENTRIES) return
  // Still over budget after dropping expired entries: evict oldest-first.
  // Map iterates in insertion order, so this is a rough LRU-by-age.
  const overflow = store.size - MAX_ENTRIES
  let dropped = 0
  for (const key of store.keys()) {
    if (dropped++ >= overflow) break
    store.delete(key)
  }
}

/**
 * Resolve `key`, calling `loader()` only on a miss.
 *
 * A rejected loader is evicted immediately so the next caller retries
 * rather than being served a cached failure for the rest of the TTL.
 *
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<any>} loader
 * @returns {Promise<any>}
 */
export function cached(key, ttlMs, loader) {
  const now = Date.now()
  const hit = store.get(key)
  if (hit && hit.expires > now) return hit.promise

  prune(now)

  const promise = loader().catch((err) => {
    store.delete(key)
    throw err
  })
  store.set(key, { promise, expires: now + ttlMs })
  return promise
}

/**
 * Drop cached entries whose key starts with `prefix` (all of them when
 * called with no argument). Use after a write that invalidates cached
 * reads -- e.g. saving a position override.
 */
export function invalidate(prefix) {
  if (!prefix) {
    store.clear()
    return
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

/** Cache contents, for the admin diagnostics endpoint. */
export function cacheStats() {
  const now = Date.now()
  return {
    entries: store.size,
    keys: [...store.entries()].map(([key, e]) => ({
      key,
      expiresInMs: Math.max(0, e.expires - now),
    })),
  }
}

// Surfaced once at boot so the cache is visible in Render logs rather than
// being invisible infrastructure nobody remembers exists.
logger.info({ maxEntries: MAX_ENTRIES }, 'In-process memo cache initialised')
