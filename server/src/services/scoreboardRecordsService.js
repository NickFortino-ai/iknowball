// Per-game team records straight from ESPN's scoreboard, used to fill gaps
// the standings endpoint structurally cannot cover.
//
// Why this exists: teamRecordsService reads /standings, which for college
// football returns FBS only (~276 teams at level=3). A Montana Grizzlies or
// any other FCS visitor is simply absent, so their row on the scores strip
// rendered with no record at all while their FBS opponent had one.
//
// The scoreboard, by contrast, carries a records array on every competitor in
// every game — including the FCS side — because it describes the matchup
// rather than a league table.
//
// Kept separate from mlbLinescoresService (same cache shape, different
// payload) so neither has to grow a mode flag.
import { logger } from '../utils/logger.js'

const SPORT_TO_PATH = {
  americanfootball_nfl: 'football/nfl',
  americanfootball_ncaaf: 'football/college-football',
  basketball_nba: 'basketball/nba',
  basketball_wnba: 'basketball/wnba',
  basketball_ncaab: 'basketball/mens-college-basketball',
  baseball_mlb: 'baseball/mlb',
  icehockey_nhl: 'hockey/nhl',
  soccer_usa_mls: 'soccer/usa.1',
}

// Past dates never change; today's can. Same reasoning as the linescore
// cache next door.
const CACHE_TTL_PAST_MS = 12 * 60 * 60 * 1000
const CACHE_TTL_TODAY_MS = 60 * 1000
const cache = new Map() // `${sportKey}:${dateStr}` → { byTeam: Map, expiresAt }

function todayPt() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }).replace(/-/g, '')
}

function normalize(name) {
  // Decompose accents first. ESPN writes "San José State Spartans" while our
  // games table has "San Jose State" — stripping non-alphanumerics without
  // folding the diacritic turns those into "sanjosstate" vs "sanjosestate"
  // and the lookup misses.
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Warm one sport-day. Safe to call repeatedly; a live day refreshes every
 * 60s and a finished one is held for 12h.
 */
export async function warmScoreboardRecords(sportKey, rawDate) {
  const path = SPORT_TO_PATH[sportKey]
  if (!path || !rawDate) return
  // toSportsDay yields 2026-09-19; ESPN's `dates` param wants 20260919 and
  // answers 400 for anything else.
  const dateStr = String(rawDate).replace(/-/g, '')
  const key = `${sportKey}:${dateStr}`
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return

  try {
    // No `groups` filter: the FBS-only view (groups=80) still lists the game
    // but this way nothing is scoped out for other sports either.
    const url = `https://site.web.api.espn.com/apis/site/v2/sports/${path}/scoreboard?limit=400&dates=${dateStr}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`scoreboard ${res.status}`)
    const json = await res.json()

    const byTeam = new Map()
    for (const ev of json.events || []) {
      for (const c of ev.competitions?.[0]?.competitors || []) {
        // 'total' is the overall W-L; the rest are splits (home, away,
        // vsconf). Taking the first entry blindly would show a conference
        // record as though it were the season one.
        const summary = (c.records || []).find((r) => r.type === 'total' || r.name === 'overall')?.summary
        if (!summary) continue
        const t = c.team || {}
        for (const name of [t.displayName, t.shortDisplayName, t.name, t.location,
          t.location && t.name ? `${t.location} ${t.name}` : null]) {
          if (name) byTeam.set(normalize(name), summary)
        }
      }
    }

    const ttl = dateStr === todayPt() ? CACHE_TTL_TODAY_MS : CACHE_TTL_PAST_MS
    cache.set(key, { byTeam, expiresAt: Date.now() + ttl })
  } catch (err) {
    // A missing record costs the strip one label. Never worth failing the
    // whole scores response over.
    logger.warn({ err: err.message, sportKey, dateStr }, 'Scoreboard records fetch failed')
    cache.set(key, { byTeam: new Map(), expiresAt: Date.now() + CACHE_TTL_TODAY_MS })
  }
}

/** "3-0" for a team on that sport-day, or null. */
export function lookupScoreboardRecord(sportKey, rawDate, teamName) {
  const hit = cache.get(`${sportKey}:${String(rawDate).replace(/-/g, '')}`)
  if (!hit) return null
  return hit.byTeam.get(normalize(teamName)) || null
}
