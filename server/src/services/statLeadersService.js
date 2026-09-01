// Per-sport season stat leaders for the Scoreboard's drill-in + the
// landing card's top-3 preview. Cached in-memory per sport for 1h.
//
// ESPN's leaders endpoint (sports.core.api...) returns categorized
// leader lists with athlete/team entities as $ref URLs. We dereference
// each in parallel (top 10 per category), so a cache-miss on a sport
// fans out ~50 concurrent requests, then serves instantly for the
// next hour.
//
// Sports with empty current-season data (NFL preseason, NBA offseason)
// fall back to the PRIOR season so users always see something rather
// than an empty column. Categories are hand-picked per sport to what
// users care about — not every ESPN category is meaningful.

import { logger } from '../utils/logger.js'

const CACHE_TTL_MS = 60 * 60 * 1000
const cache = new Map() // sportKey → { categories, expiresAt }

// ── FBS filter for college football ──────────────────────────────────
//
// ESPN's college-football leaders endpoint spans every division, and early
// in the season it is dominated by FCS and lower — the Week 1 top 15 for
// passing yards had ZERO FBS players. Worse, small-school box scores carry
// bad data: a Gardner-Webb defender led Sacks with 6 on a line that also
// read 0 tackles-for-loss, which is impossible.
//
// `?groups=80` is ignored on both the leaders and teams endpoints (the
// latter returns all 760 teams), so the division has to come from the
// group hierarchy: groups/80 = FBS -> 11 conferences -> their teams. 138
// ids, ~23 requests, cached for a day.
//
// Filtering is free: each leader entry carries its team as a $ref URL with
// the id in the path, so we can drop non-FBS BEFORE dereferencing anyone.
// Only the surviving top 10 get resolved, exactly as before.
const FBS_CACHE_TTL_MS = 24 * 60 * 60 * 1000
let fbsCache = null // { ids: Set<string>, expiresAt }

async function getFbsTeamIds(season) {
  if (fbsCache && fbsCache.expiresAt > Date.now()) return fbsCache.ids
  try {
    const root = await fetchJson(
      `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/${season}/types/2/groups/80`,
    )
    if (!root?.children?.$ref) return null
    const kids = await fetchJson(root.children.$ref + '&limit=100')
    const ids = new Set()
    await Promise.all((kids.items || []).map(async (item) => {
      try {
        const conf = await fetchJson(item.$ref)
        if (!conf?.teams?.$ref) return
        const teams = await fetchJson(conf.teams.$ref + '&limit=100')
        for (const ref of teams.items || []) {
          const m = String(ref.$ref).match(/teams\/(\d+)/)
          if (m) ids.add(m[1])
        }
      } catch { /* one conference failing shouldn't void the set */ }
    }))
    // Sanity floor — FBS is ~134 teams. A partial fetch would silently
    // filter out real leaders, so treat a short set as unusable and let
    // the caller fall through to unfiltered.
    if (ids.size < 100) {
      logger.warn({ count: ids.size }, 'FBS team set looks short — skipping filter')
      return null
    }
    fbsCache = { ids, expiresAt: Date.now() + FBS_CACHE_TTL_MS }
    return ids
  } catch (err) {
    logger.warn({ err: err.message }, 'FBS team set fetch failed — leaders will be unfiltered')
    return null
  }
}

function teamIdFromRef(ref) {
  const m = String(ref || '').match(/teams\/(\d+)/)
  return m ? m[1] : null
}

// Which sports we support + their ESPN league path + which categories
// to surface (name = ESPN's stat name, label = display).
const SPORT_CONFIG = {
  americanfootball_nfl: {
    espnPath: 'football/leagues/nfl',
    categories: [
      { name: 'passingYards', label: 'Pass Yds' },
      { name: 'passingTouchdowns', label: 'Pass TD' },
      { name: 'rushingYards', label: 'Rush Yds' },
      { name: 'receivingYards', label: 'Rec Yds' },
      { name: 'totalTouchdowns', label: 'TDs' },
      { name: 'sacks', label: 'Sacks' },
      { name: 'interceptions', label: 'INTs' },
      { name: 'totalTackles', label: 'Tackles' },
    ],
  },
  basketball_nba: {
    espnPath: 'basketball/leagues/nba',
    categories: [
      { name: 'pointsPerGame', label: 'PPG' },
      { name: 'reboundsPerGame', label: 'RPG' },
      { name: 'assistsPerGame', label: 'APG' },
      { name: 'threePointFieldGoalsMade', label: '3PM' },
      // Same story as WNBA: ESPN only ranks per-game for NBA steals /
      // blocks, so we fetch the per-game list, dereference each
      // athlete's season statistics for the raw total, and re-rank.
      { name: 'steals', label: 'STL', totalFromPerGame: { source: 'stealsPerGame', statName: 'steals' } },
      { name: 'blocks', label: 'BLK', totalFromPerGame: { source: 'blocksPerGame', statName: 'blocks' } },
    ],
  },
  baseball_mlb: {
    espnPath: 'baseball/leagues/mlb',
    categories: [
      { name: 'homeRuns', label: 'HR' },
      { name: 'RBIs', label: 'RBI' },
      { name: 'avg', label: 'AVG' },
      { name: 'strikeouts', label: 'Ks (P)' },
      { name: 'ERA', label: 'ERA' },
    ],
  },
  basketball_wnba: {
    espnPath: 'basketball/leagues/wnba',
    categories: [
      { name: 'pointsPerGame', label: 'PPG' },
      { name: 'reboundsPerGame', label: 'RPG' },
      { name: 'assistsPerGame', label: 'APG' },
      { name: 'threePointFieldGoalsMade', label: '3PM' },
      // ESPN only ranks steals/blocks per-game for WNBA. For each of
      // these we fetch the per-game leader list, dereference each
      // athlete's season statistics for the raw total, and re-rank by
      // total. topFetch bumped to catch anyone with a shot at top-10
      // totals whose per-game rank is deeper (e.g. big minutes with
      // slightly lower per-game). See dereferenceLeader.
      { name: 'steals', label: 'STL', totalFromPerGame: { source: 'stealsPerGame', statName: 'steals' } },
      { name: 'blocks', label: 'BLK', totalFromPerGame: { source: 'blocksPerGame', statName: 'blocks' } },
    ],
  },
  soccer_usa_mls: {
    espnPath: 'soccer/leagues/usa.1',
    // ESPN's soccer leaders endpoint lives at /types/1 (regular season
    // equivalent). Every other league uses /types/2, so this per-sport
    // override in the fetcher below.
    typeCode: 1,
    categories: [
      { name: 'goals', label: 'Goals' },
      { name: 'assists', label: 'Assists' },
    ],
  },
  americanfootball_ncaaf: {
    espnPath: 'football/leagues/college-football',
    categories: [
      { name: 'passingYards', label: 'Pass Yds' },
      { name: 'passingTouchdowns', label: 'Pass TD' },
      { name: 'rushingYards', label: 'Rush Yds' },
      { name: 'receivingYards', label: 'Rec Yds' },
      { name: 'totalTouchdowns', label: 'TDs' },
      { name: 'sacks', label: 'Sacks' },
      { name: 'interceptions', label: 'INTs' },
      { name: 'totalTackles', label: 'Tackles' },
    ],
  },
  basketball_ncaab: {
    espnPath: 'basketball/leagues/mens-college-basketball',
    categories: [
      { name: 'pointsPerGame', label: 'PPG' },
      { name: 'reboundsPerGame', label: 'RPG' },
      { name: 'assistsPerGame', label: 'APG' },
      { name: 'threePointFieldGoalsMade', label: '3PM' },
      { name: 'steals', label: 'STL', totalFromPerGame: { source: 'stealsPerGame', statName: 'steals' } },
      { name: 'blocks', label: 'BLK', totalFromPerGame: { source: 'blocksPerGame', statName: 'blocks' } },
    ],
  },
}

const CURRENT_YEAR = new Date().getUTCFullYear()

async function fetchJson(url) {
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'lang=en&region=us')
  if (!res.ok) throw new Error(`ESPN ${res.status} ${url}`)
  return res.json()
}

// Try current season; if the leaders array is empty (offseason /
// preseason), fall back to the prior season.
async function fetchCategoriesForSport(espnPath, categoryNames, typeCode = 2, season = CURRENT_YEAR, allowFallback = true) {
  // College football pulls a much deeper list because most of it gets
  // filtered out by division below — at limit=15 the FBS survivors were
  // 0-3 per category. Still ONE request either way (~150ms), and the
  // dereference count is unchanged since filtering happens first.
  const limit = espnPath.includes('college-football') ? 200 : 15
  const url = `https://sports.core.api.espn.com/v2/sports/${espnPath}/seasons/${season}/types/${typeCode}/leaders?limit=${limit}`
  let data
  try {
    data = await fetchJson(url)
  } catch (err) {
    logger.warn({ err: err.message, espnPath, season, typeCode }, 'Leaders fetch failed')
    if (allowFallback && season === CURRENT_YEAR) {
      return fetchCategoriesForSport(espnPath, categoryNames, typeCode, season - 1, false)
    }
    return { categories: [], season }
  }

  const allCats = data?.categories || []
  // For a "totals" category (totalFromPerGame.source), fetch from ESPN's
  // per-game leader list at that source key but tag the picked category
  // with the requester's own name + statName so downstream code can
  // dereference each athlete's totals + re-rank.
  const picked = categoryNames.map((cn) => {
    const espnKey = cn.totalFromPerGame?.source || cn.name
    const cat = allCats.find((c) => c.name === espnKey)
    if (!cat) return null
    return { ...cat, requestedName: cn.name, totalStatName: cn.totalFromPerGame?.statName || null }
  }).filter(Boolean)
  // Empty-category signal (offseason). Retry with prior season.
  const anyHasLeaders = picked.some((c) => (c.leaders || []).length > 0)
  if (!anyHasLeaders && allowFallback && season === CURRENT_YEAR) {
    return fetchCategoriesForSport(espnPath, categoryNames, typeCode, season - 1, false)
  }
  return { categories: picked, season }
}

// Format the numeric `value` per category type. ESPN's displayValue
// for a leader entry is the FULL stat line ('137-426, 35 HR, 24 2B,
// 86 RBI, ...') — using that would clutter the leader row. We want
// just the number for the category the user is looking at, formatted
// to convention (AVG/OBP/SLG/PCT etc. as .321; ERA as 2.78; counts
// as integer).
function formatCategoryValue(categoryName, value) {
  if (value == null) return '—'
  const n = Number(value)
  if (isNaN(n)) return String(value)
  const lower = String(categoryName).toLowerCase()
  // Rate stats — three decimals, drop the leading 0
  const isRate = ['avg', 'obp', 'slg', 'ops', 'onbasepct', 'slugavg', 'winpct', 'fieldgoalpct'].some((k) => lower.includes(k))
  if (isRate) {
    const s = n.toFixed(3)
    return s.startsWith('0') ? s.slice(1) : s
  }
  // Per-game / ratio stats — one decimal
  const isPerGame = lower.includes('pergame') || lower.includes('era') || lower.includes('whip') || lower.includes('avg')
  if (isPerGame) return n.toFixed(2)
  // Counts — integer, thousands-separated for readability
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toFixed(1)
}

async function dereferenceLeader(entry, categoryName, totalStatName) {
  // Athlete + team + (optionally) full season statistics come as $ref
  // URLs. Fetch in parallel and unwrap. totalStatName is set for
  // categories where we want a raw total instead of the per-game
  // value ESPN's leader ranking returns (e.g. WNBA steals/blocks).
  const [athleteRes, teamRes, statsRes] = await Promise.allSettled([
    entry.athlete?.$ref ? fetchJson(entry.athlete.$ref) : Promise.resolve(null),
    entry.team?.$ref ? fetchJson(entry.team.$ref) : Promise.resolve(null),
    totalStatName && entry.statistics?.$ref ? fetchJson(entry.statistics.$ref) : Promise.resolve(null),
  ])
  const athlete = athleteRes.status === 'fulfilled' ? athleteRes.value : null
  const team = teamRes.status === 'fulfilled' ? teamRes.value : null

  let value = entry.value
  if (totalStatName) {
    const stats = statsRes.status === 'fulfilled' ? statsRes.value : null
    let found = null
    for (const cat of stats?.splits?.categories || []) {
      const s = (cat.stats || []).find((x) => x.name === totalStatName)
      if (s) { found = s.value; break }
    }
    value = found ?? null
  }

  return {
    value,
    display_value: formatCategoryValue(categoryName, value),
    athlete_id: athlete?.id || null,
    athlete_name: athlete?.displayName || athlete?.fullName || athlete?.shortName || null,
    headshot: athlete?.headshot?.href || null,
    position: athlete?.position?.abbreviation || null,
    team_id: team?.id || null,
    team_abbr: team?.abbreviation || null,
    team_name: team?.displayName || null,
    // School without the mascot — "Drake" rather than "Drake Bulldogs" or
    // the opaque "DRKE". Readable in a narrow column, which the full
    // displayName is not ("Gardner-Webb Runnin' Bulldogs").
    team_short: team?.shortDisplayName || team?.location || team?.name || null,
    team_logo: team?.logos?.[0]?.href || null,
  }
}

async function fetchOne(sportKey) {
  const config = SPORT_CONFIG[sportKey]
  if (!config) return { categories: [], season: null }

  const { categories: rawCats, season } = await fetchCategoriesForSport(config.espnPath, config.categories, config.typeCode || 2)
  if (!rawCats.length) return { categories: [], season }

  // Narrow college football to FBS. Done on the raw entries, before any
  // dereferencing, so it costs nothing beyond the cached id set.
  //
  // Per-category fallback: if a category has no FBS leaders at all (a stat
  // nobody has recorded yet in Week 1), keep it unfiltered rather than
  // blanking the tab. Better an FCS name than an empty list.
  let fbsIds = null
  if (config.espnPath.includes('college-football')) {
    fbsIds = await getFbsTeamIds(season)
  }
  const cats = fbsIds
    ? rawCats.map((cat) => {
        const filtered = (cat.leaders || []).filter((l) => {
          const id = teamIdFromRef(l.team?.$ref)
          return id && fbsIds.has(id)
        })
        return filtered.length ? { ...cat, leaders: filtered } : cat
      })
    : rawCats

  // For each category, dereference in parallel. For total categories
  // (ESPN only ranks per-game), fetch a wider window and re-sort by
  // the actual total we just dereferenced so top-10 reflects raw
  // totals, not per-game rank.
  const results = await Promise.all(cats.map(async (cat) => {
    const requestedName = cat.requestedName || cat.name
    const cfgEntry = config.categories.find((c) => c.name === requestedName)
    const label = cfgEntry?.label || cat.displayName
    const isTotalOfPerGame = !!cat.totalStatName
    const topN = (cat.leaders || []).slice(0, isTotalOfPerGame ? 25 : 10)
    const leaders = await Promise.all(
      topN.map((l) => dereferenceLeader(l, requestedName, cat.totalStatName).catch(() => null)),
    )
    let ranked = leaders.filter(Boolean)
    if (isTotalOfPerGame) {
      ranked.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
      ranked = ranked.slice(0, 10)
    }
    return {
      name: requestedName,
      label,
      leaders: ranked.map((l, i) => ({ ...l, rank: i + 1 })),
    }
  }))
  return { categories: results.filter((c) => c.leaders.length > 0), season }
}

export async function getStatLeaders(sportKey) {
  const now = Date.now()
  const cached = cache.get(sportKey)
  if (cached && cached.expiresAt > now) return cached.data
  const data = await fetchOne(sportKey)
  cache.set(sportKey, { data, expiresAt: now + CACHE_TTL_MS })
  return data
}
