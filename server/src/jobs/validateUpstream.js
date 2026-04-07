import { logger } from '../utils/logger.js'

/**
 * Boot-time + periodic check that upstream APIs are returning the shape
 * we expect. Currently validates Sleeper's NFL stats endpoint — if they
 * ever change the response wrapper or move stat keys around, this will
 * fail loudly in deploy logs instead of silently writing zero rows.
 *
 * Looks for two things in the deploy logs:
 *   "[upstream] Sleeper stats OK"   — all good
 *   "[upstream] Sleeper stats FAIL" — investigate immediately
 */
export async function validateUpstream() {
  const failures = []

  // Sleeper NFL stats — uses 2024 week 1 since that's a guaranteed-stable historical week
  try {
    const url = 'https://api.sleeper.com/stats/nfl/2024/1?season_type=regular&position[]=RB'
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Response is not a non-empty array')
    }
    const sample = data[0]
    if (!sample.player_id) throw new Error('Missing player_id on row')
    if (!sample.stats || typeof sample.stats !== 'object') {
      throw new Error('Missing or wrong-shaped `stats` object on row')
    }
    // Sanity check a few well-known stat keys
    const requiredStatKeys = ['gms_active']
    for (const key of requiredStatKeys) {
      if (!(key in sample.stats)) {
        throw new Error(`Missing expected stat key: ${key}`)
      }
    }
    logger.info({ rows: data.length }, '[upstream] Sleeper stats OK')
  } catch (err) {
    failures.push({ source: 'Sleeper /stats', error: err.message })
    logger.error({ err: err.message }, '[upstream] Sleeper stats FAIL — live scoring may be broken')
  }

  if (failures.length === 0) {
    logger.info('[upstream] All upstream API checks passed')
  } else {
    logger.error({ failures }, '⚠️  [upstream] One or more upstream API checks FAILED — live data pipelines may be broken')
  }
  return failures
}
