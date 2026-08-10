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
    ],
  },
  basketball_nba: {
    espnPath: 'basketball/leagues/nba',
    categories: [
      { name: 'pointsPerGame', label: 'PPG' },
      { name: 'reboundsPerGame', label: 'RPG' },
      { name: 'assistsPerGame', label: 'APG' },
      { name: 'threePointFieldGoalsMade', label: '3PM' },
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
async function fetchCategoriesForSport(espnPath, categoryNames, season = CURRENT_YEAR, allowFallback = true) {
  const url = `https://sports.core.api.espn.com/v2/sports/${espnPath}/seasons/${season}/types/2/leaders?limit=15`
  let data
  try {
    data = await fetchJson(url)
  } catch (err) {
    logger.warn({ err: err.message, espnPath, season }, 'Leaders fetch failed')
    if (allowFallback && season === CURRENT_YEAR) {
      return fetchCategoriesForSport(espnPath, categoryNames, season - 1, false)
    }
    return { categories: [], season }
  }

  const allCats = data?.categories || []
  const picked = categoryNames.map((cn) => allCats.find((c) => c.name === cn.name)).filter(Boolean)
  // Empty-category signal (offseason). Retry with prior season.
  const anyHasLeaders = picked.some((c) => (c.leaders || []).length > 0)
  if (!anyHasLeaders && allowFallback && season === CURRENT_YEAR) {
    return fetchCategoriesForSport(espnPath, categoryNames, season - 1, false)
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

async function dereferenceLeader(entry, categoryName) {
  // Athlete + team come as $ref URLs. Fetch in parallel and unwrap.
  const [athleteRes, teamRes] = await Promise.allSettled([
    entry.athlete?.$ref ? fetchJson(entry.athlete.$ref) : Promise.resolve(null),
    entry.team?.$ref ? fetchJson(entry.team.$ref) : Promise.resolve(null),
  ])
  const athlete = athleteRes.status === 'fulfilled' ? athleteRes.value : null
  const team = teamRes.status === 'fulfilled' ? teamRes.value : null
  return {
    value: entry.value,
    display_value: formatCategoryValue(categoryName, entry.value),
    athlete_id: athlete?.id || null,
    athlete_name: athlete?.displayName || athlete?.fullName || athlete?.shortName || null,
    headshot: athlete?.headshot?.href || null,
    position: athlete?.position?.abbreviation || null,
    team_id: team?.id || null,
    team_abbr: team?.abbreviation || null,
    team_name: team?.displayName || null,
    team_logo: team?.logos?.[0]?.href || null,
  }
}

async function fetchOne(sportKey) {
  const config = SPORT_CONFIG[sportKey]
  if (!config) return { categories: [], season: null }

  const { categories: rawCats, season } = await fetchCategoriesForSport(config.espnPath, config.categories)
  if (!rawCats.length) return { categories: [], season }

  // For each category, dereference top 10 in parallel. Different
  // categories dereferenced in parallel too.
  const results = await Promise.all(rawCats.map(async (cat) => {
    const label = config.categories.find((c) => c.name === cat.name)?.label || cat.displayName
    const topN = (cat.leaders || []).slice(0, 10)
    const leaders = await Promise.all(topN.map((l) => dereferenceLeader(l, cat.name).catch(() => null)))
    return {
      name: cat.name,
      label,
      leaders: leaders.filter(Boolean).map((l, i) => ({ ...l, rank: i + 1 })),
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
