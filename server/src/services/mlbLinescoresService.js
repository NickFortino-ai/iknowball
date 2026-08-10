// Per-date MLB R/H/E linescores for the Scoreboard's final rows.
// ESPN's scoreboard endpoint returns all games for a date with each
// competitor's per-inning linescore + hits + errors — a single fetch
// per date gives us R/H/E for every final game that day.
//
// Cached per date. Once a day is complete the linescores never
// change so TTL is effectively permanent — we cache 12h to bound
// memory growth on a long-running process without ever missing an
// update that would matter.

import { logger } from '../utils/logger.js'
import { stripAccents } from '../utils/name.js'

const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const cache = new Map() // dateStr → { byMatchup: Map, expiresAt }

function normalize(name) {
  return stripAccents(name || '').toLowerCase().trim()
}

// ESPN's date param wants YYYYMMDD.
function toEspnDate(dateStr) {
  return dateStr.replace(/-/g, '')
}

async function fetchOne(dateStr) {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${toEspnDate(dateStr)}`)
    if (!res.ok) throw new Error(`ESPN ${res.status}`)
    const data = await res.json()
    const events = data?.events || []
    const map = new Map()
    for (const ev of events) {
      const comp = ev.competitions?.[0]
      if (!comp) continue
      const competitors = comp.competitors || []
      const home = competitors.find((c) => c.homeAway === 'home')
      const away = competitors.find((c) => c.homeAway === 'away')
      if (!home || !away) continue
      const homeName = home.team?.displayName
      const awayName = away.team?.displayName
      if (!homeName || !awayName) continue
      // Key by the away@home pairing (both directions) so a lookup
      // works regardless of the games table's row order.
      const homeStats = statBlock(home)
      const awayStats = statBlock(away)
      const key = `${normalize(awayName)}@${normalize(homeName)}`
      map.set(key, { home: homeStats, away: awayStats })
    }
    return map
  } catch (err) {
    logger.warn({ err: err.message, dateStr }, 'MLB linescores fetch failed')
    return new Map()
  }
}

function statBlock(competitor) {
  // ESPN puts totals in competitor.hits, competitor.errors, and
  // score at competitor.score. hits/errors may be strings.
  const r = Number(competitor.score) || 0
  const h = Number(competitor.hits) || 0
  const e = Number(competitor.errors) || 0
  return { r, h, e }
}

export async function getMlbLinescoreForGame(dateStr, awayTeam, homeTeam) {
  if (!dateStr || !awayTeam || !homeTeam) return null
  const now = Date.now()
  let cached = cache.get(dateStr)
  if (!cached || cached.expiresAt <= now) {
    const byMatchup = await fetchOne(dateStr)
    cached = { byMatchup, expiresAt: now + CACHE_TTL_MS }
    cache.set(dateStr, cached)
  }
  const key = `${normalize(awayTeam)}@${normalize(homeTeam)}`
  return cached.byMatchup.get(key) || null
}

// Warm the cache for a date so a batch of games can look up without
// each triggering the ESPN fetch. Callers can await this before
// looping through games for a lookup-heavy path.
export async function warmMlbLinescores(dateStr) {
  const now = Date.now()
  const cached = cache.get(dateStr)
  if (cached && cached.expiresAt > now) return
  const byMatchup = await fetchOne(dateStr)
  cache.set(dateStr, { byMatchup, expiresAt: now + CACHE_TTL_MS })
}
