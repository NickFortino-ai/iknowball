// Per-team season W-L records for the landing scoreboard's "Lions 0-0"
// suffix. Cached in-memory per sport for 1h — no DB table for MVP.
// ESPN's /teams endpoint returns a `record.items[0].summary` per team
// (e.g. "12-5" or "10-4-1") which we split on '-' into wins/losses/ties.
//
// If ESPN returns no data for a sport (offseason / API hiccup), the
// cache is set to an empty map so the endpoint stays fast; team rows
// on the client just render without a record.

import { logger } from '../utils/logger.js'
import { stripAccents } from '../utils/name.js'

const CACHE_TTL_MS = 60 * 60 * 1000
const cache = new Map() // sportKey → { records: {teamName: {w, l, t}}, expiresAt }

// Sport keys we cover on the landing scoreboard + their ESPN path.
const ESPN_PATH = {
  americanfootball_nfl: 'football/nfl',
  basketball_nba: 'basketball/nba',
  baseball_mlb: 'baseball/mlb',
  basketball_wnba: 'basketball/wnba',
}

function normalize(name) {
  return stripAccents(name || '').toLowerCase().trim()
}

async function fetchOne(sportKey) {
  const path = ESPN_PATH[sportKey]
  if (!path) return {}
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams?limit=100`)
    if (!res.ok) throw new Error(`ESPN ${res.status}`)
    const data = await res.json()
    // Response shape: sports[0].leagues[0].teams[].team with displayName + record.items[0].summary
    const teams = data?.sports?.[0]?.leagues?.[0]?.teams || []
    const map = {}
    for (const t of teams) {
      const team = t?.team
      if (!team) continue
      const summary = team?.record?.items?.[0]?.summary
      if (!summary) continue
      const [wStr, lStr, tStr] = summary.split('-')
      const w = Number(wStr) || 0
      const l = Number(lStr) || 0
      const tie = Number(tStr) || 0
      // Store under displayName + shortDisplayName + location + name so
      // whatever the games table stores as home_team/away_team, we hit
      // at least one match. All normalized (lowercase + accent-strip).
      const rec = { w, l, t: tie }
      for (const key of [team.displayName, team.shortDisplayName, team.name, team.location, `${team.location} ${team.name}`]) {
        if (key) map[normalize(key)] = rec
      }
    }
    return map
  } catch (err) {
    logger.warn({ err: err.message, sportKey }, 'Team records fetch failed')
    return {}
  }
}

export async function getTeamRecords(sportKey) {
  const now = Date.now()
  const cached = cache.get(sportKey)
  if (cached && cached.expiresAt > now) return cached.records
  const records = await fetchOne(sportKey)
  cache.set(sportKey, { records, expiresAt: now + CACHE_TTL_MS })
  return records
}

export function lookupRecord(sportKey, teamName) {
  const cached = cache.get(sportKey)
  if (!cached) return null
  return cached.records[normalize(teamName)] || null
}
