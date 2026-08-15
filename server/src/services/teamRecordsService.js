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
// cache entries hold both the per-team lookup map (records) AND the
// ordered standings table pre-built from the same ESPN response, so
// callers get both without paying the fetch twice.
const cache = new Map() // sportKey → { records, standings, expiresAt }

// Sport keys we cover on the landing scoreboard + their ESPN path.
const ESPN_PATH = {
  americanfootball_nfl: 'football/nfl',
  basketball_nba: 'basketball/nba',
  baseball_mlb: 'baseball/mlb',
  basketball_wnba: 'basketball/wnba',
  americanfootball_ncaaf: 'football/college-football',
  basketball_ncaab: 'basketball/mens-college-basketball',
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
    // children (conferences / leagues). ?level=3 unlocks the division
    // layer inside each conference (e.g. "AFC East") — without it,
    // NFL/NBA/MLB return entries flat at the conference level and the
    // client's division tabs can't group anything.
    // seasontype=2 = regular season only. Without it ESPN mixes
    // preseason exhibition wins into the record (e.g. Panthers show
    // 1-0 in August from a preseason W) which is not the record we
    // want to display anywhere.
    const res = await fetch(`https://site.api.espn.com/apis/v2/sports/${path}/standings?level=3&seasontype=2`)
    if (!res.ok) throw new Error(`ESPN ${res.status}`)
    const data = await res.json()
    const map = {}
    const standingsRows = []
    const walk = (node, groupName = null) => {
      const entries = node?.standings?.entries
      if (Array.isArray(entries)) {
        for (const e of entries) {
          const team = e?.team
          if (!team) continue
          const w = statNum(e, 'wins')
          const l = statNum(e, 'losses')
          const t = statNum(e, 'ties')
          const winPct = statNum(e, 'winPercent')
          const info = {
            w, l, t,
            short: team.shortDisplayName || team.name || team.displayName,
          }
          // Multi-variant key lookup so however the games table spells
          // "San Francisco Giants" we still land a match.
          for (const key of [team.displayName, team.shortDisplayName, team.name, team.location, `${team.location} ${team.name}`]) {
            if (key) map[normalize(key)] = info
          }
          // Full row for the standings table sidebar. Group name comes
          // from the walking node's parent when it exists (e.g. 'AL East',
          // 'NFC South') — falls back to null for a flat 'All' list.
          standingsRows.push({
            team_id: team.id || null,
            team_name: team.displayName,
            short_name: team.shortDisplayName || team.name || team.displayName,
            logo: team.logos?.[0]?.href || null,
            wins: w, losses: l, ties: t,
            win_pct: winPct,
            group: groupName,
          })
        }
      }
      // For MLB / NFL / NBA, standings nest under conferences → divisions.
      // Track the deepest named group we can, since 'AL East' is what
      // users actually want as the DIV grouping.
      for (const child of node?.children || []) walk(child, child?.name || groupName)
    }
    walk(data)
    // Sort by wins desc, losses asc, win_pct desc (fallback for ties).
    standingsRows.sort((a, b) => {
      if (b.win_pct !== a.win_pct) return b.win_pct - a.win_pct
      if (b.wins !== a.wins) return b.wins - a.wins
      return a.losses - b.losses
    })
    return { map, standings: standingsRows }
  } catch (err) {
    logger.warn({ err: err.message, sportKey }, 'Team records fetch failed')
    return { map: {}, standings: [] }
  }
}

export async function getTeamRecords(sportKey) {
  const now = Date.now()
  const cached = cache.get(sportKey)
  if (cached && cached.expiresAt > now) return cached.records
  const { map, standings } = await fetchOne(sportKey)
  cache.set(sportKey, { records: map, standings, expiresAt: now + CACHE_TTL_MS })
  return map
}

export async function getStandingsTable(sportKey) {
  const now = Date.now()
  const cached = cache.get(sportKey)
  if (cached && cached.expiresAt > now) return cached.standings
  const { map, standings } = await fetchOne(sportKey)
  cache.set(sportKey, { records: map, standings, expiresAt: now + CACHE_TTL_MS })
  return standings
}

export function lookupRecord(sportKey, teamName) {
  const cached = cache.get(sportKey)
  if (!cached) return null
  return cached.records[normalize(teamName)] || null
}

export function lookupShortName(sportKey, teamName) {
  const info = lookupRecord(sportKey, teamName)
  return info?.short || null
}
