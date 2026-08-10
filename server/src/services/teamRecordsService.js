// Per-team season W-L records for the landing scoreboard's "Lions 0-0"
// suffix. Cached in-memory per sport for 1h — no DB table for MVP.
//
// Source: ESPN's /standings endpoint (NOT /teams — that one returns
// team metadata without records). Shape: {children:[{standings:{
// entries:[{team, stats:[{name:'wins',value},{name:'losses',value},
// {name:'ties',value}]}]}}]}. Children are conferences/leagues.
//
// Empty cache is set on failure (offseason, API hiccup) so we stay
// fast; team rows on the client just render without a record.

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

function statNum(entry, name) {
  const s = (entry?.stats || []).find((x) => x?.name === name)
  return Number(s?.value ?? s?.displayValue) || 0
}

async function fetchOne(sportKey) {
  const path = ESPN_PATH[sportKey]
  if (!path) return {}
  try {
    // /apis/v2/... (not /apis/site/v2/) for the standings endpoint —
    // path is different from /teams. Response nests standings under
    // children (conferences / leagues).
    const res = await fetch(`https://site.api.espn.com/apis/v2/sports/${path}/standings`)
    if (!res.ok) throw new Error(`ESPN ${res.status}`)
    const data = await res.json()
    const map = {}
    const walk = (node) => {
      const entries = node?.standings?.entries
      if (Array.isArray(entries)) {
        for (const e of entries) {
          const team = e?.team
          if (!team) continue
          const rec = { w: statNum(e, 'wins'), l: statNum(e, 'losses'), t: statNum(e, 'ties') }
          // Multiple key variants — however the games table spells
          // "San Francisco Giants" we still land a match.
          for (const key of [team.displayName, team.shortDisplayName, team.name, team.location, `${team.location} ${team.name}`]) {
            if (key) map[normalize(key)] = rec
          }
        }
      }
      for (const child of node?.children || []) walk(child)
    }
    walk(data)
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
