// AP Top 25 rankings for NCAAF. Cached for an hour — the poll only
// updates once a week (Sunday nights during the season) so a longer
// TTL would be fine, but 1h keeps things fresh without ever showing
// last-week's rank after a Monday morning poll drop.
//
// Returned shape: Map<espnTeamId, rankNumber>.

import { logger } from '../utils/logger.js'

const CACHE_TTL_MS = 60 * 60 * 1000
let cache = null // { fetchedAt, byId: Map<string, number> }

export async function getNcaafApRankings() {
  const now = Date.now()
  if (cache && (now - cache.fetchedAt) < CACHE_TTL_MS) return cache.byId

  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings')
    if (!res.ok) throw new Error(`ESPN ${res.status}`)
    const data = await res.json()
    // Prefer the AP poll. Fall back to whatever's first if ESPN renames it.
    const rankings = data?.rankings || []
    const ap = rankings.find((r) => /^ap/i.test(r.shortName || r.name || '')) || rankings[0]
    const byId = new Map()
    for (const r of ap?.ranks || []) {
      const id = r.team?.id ? String(r.team.id) : null
      const rank = Number(r.current)
      if (id && rank > 0) byId.set(id, rank)
    }
    cache = { fetchedAt: now, byId }
    return byId
  } catch (err) {
    logger.warn({ err: err.message }, 'NCAAF rankings fetch failed')
    return cache?.byId || new Map()
  }
}
