import { logger } from '../utils/logger.js'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'

// Map our sport keys to ESPN's {sport}/{league} path + optional query params
const SPORT_TO_ESPN = {
  americanfootball_nfl: { path: 'football/nfl' },
  americanfootball_ncaaf: { path: 'football/college-football', params: 'groups=80&limit=500' },
  basketball_nba: { path: 'basketball/nba' },
  basketball_ncaab: { path: 'basketball/mens-college-basketball', params: 'groups=50&limit=500' },
  basketball_wncaab: { path: 'basketball/womens-college-basketball', params: 'groups=50&limit=500' },
  basketball_wnba: { path: 'basketball/wnba' },
  baseball_mlb: { path: 'baseball/mlb' },
  icehockey_nhl: { path: 'hockey/nhl' },
  soccer_usa_mls: { path: 'soccer/usa.1' },
}

function normalizeTeamName(name) {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
}

function teamsMatch(espnName, dbName) {
  const a = normalizeTeamName(espnName)
  const b = normalizeTeamName(dbName)
  // Exact match
  if (a === b) return true
  // One contains the other (e.g. "Los Angeles Lakers" vs "Lakers")
  if (a.includes(b) || b.includes(a)) return true
  // Last word match (team nickname) — e.g. "LA Lakers" vs "Los Angeles Lakers"
  const aLast = a.split(/\s+/).pop()
  const bLast = b.split(/\s+/).pop()
  if (aLast.length > 2 && aLast === bLast) return true
  // Suffix match — e.g. "Lopes" vs "Antelopes", "Jacks" vs "Lumberjacks"
  if (aLast.length > 2 && bLast.length > 2 && (aLast.endsWith(bLast) || bLast.endsWith(aLast))) return true
  return false
}

export async function fetchESPNScoreboard(sportKey, date = null) {
  const sport = SPORT_TO_ESPN[sportKey]
  if (!sport) return []

  const params = []
  if (sport.params) params.push(sport.params)
  if (date) params.push(`dates=${date}`)
  const qs = params.length ? `?${params.join('&')}` : ''
  const url = `${ESPN_BASE}/${sport.path}/scoreboard${qs}`

  let data
  try {
    const res = await fetch(url)
    if (!res.ok) {
      logger.warn({ sportKey, status: res.status }, 'ESPN scoreboard request failed')
      return []
    }
    data = await res.json()
  } catch (err) {
    logger.error({ err, sportKey }, 'ESPN scoreboard fetch error')
    return []
  }

  const events = data.events || []
  return events.map((event) => {
    const competition = event.competitions?.[0]
    if (!competition) return null

    const homeComp = competition.competitors?.find((c) => c.homeAway === 'home')
    const awayComp = competition.competitors?.find((c) => c.homeAway === 'away')
    if (!homeComp || !awayComp) return null

    const status = competition.status || event.status
    const statusType = status?.type?.name
    const liveStatuses = ['STATUS_IN_PROGRESS', 'STATUS_END_PERIOD', 'STATUS_FIRST_HALF', 'STATUS_SECOND_HALF', 'STATUS_HALFTIME', 'STATUS_OVERTIME']
    const finalStatuses = ['STATUS_FINAL', 'STATUS_FULL_TIME', 'STATUS_POSTPONED', 'STATUS_CANCELED']
    const state = liveStatuses.includes(statusType) ? 'in'
      : finalStatuses.includes(statusType) ? 'post'
      : 'pre'

    return {
      homeTeam: homeComp.team?.displayName || homeComp.team?.name || '',
      awayTeam: awayComp.team?.displayName || awayComp.team?.name || '',
      homeScore: parseInt(homeComp.score || '0', 10),
      awayScore: parseInt(awayComp.score || '0', 10),
      period: status?.period ? String(status.period) : null,
      clock: status?.displayClock || null,
      state,
    }
  }).filter(Boolean)
}

export function matchESPNToGame(espnEvent, game) {
  return (
    (teamsMatch(espnEvent.homeTeam, game.home_team) && teamsMatch(espnEvent.awayTeam, game.away_team))
  )
}

// NBA team abbreviations for ESPN roster API
const NBA_TEAMS = [
  'atl', 'bos', 'bkn', 'cha', 'chi', 'cle', 'dal', 'den', 'det', 'gs',
  'hou', 'ind', 'lac', 'lal', 'mem', 'mia', 'mil', 'min', 'no', 'ny',
  'okc', 'orl', 'phi', 'phx', 'por', 'sac', 'sa', 'tor', 'uta', 'wsh',
]

// In-memory cache of player name → headshot URL (refreshed on demand)
let playerHeadshotCache = {}
let cacheLastRefreshed = 0

function normalizePlayerName(name) {
  return name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
}

export async function refreshPlayerHeadshotCache() {
  const now = Date.now()
  // Only refresh every 24 hours
  if (now - cacheLastRefreshed < 24 * 60 * 60 * 1000 && Object.keys(playerHeadshotCache).length > 0) {
    return playerHeadshotCache
  }

  const cache = {}
  for (const team of NBA_TEAMS) {
    try {
      const url = `${ESPN_BASE}/basketball/nba/teams/${team}/roster`
      const res = await fetch(url)
      if (!res.ok) continue
      const data = await res.json()
      for (const athlete of (data.athletes || [])) {
        const name = athlete.displayName || athlete.fullName
        if (name && athlete.headshot?.href) {
          cache[normalizePlayerName(name)] = athlete.headshot.href
        }
      }
    } catch (err) {
      logger.warn({ team, err: err.message }, 'Failed to fetch ESPN roster for headshots')
    }
  }

  playerHeadshotCache = cache
  cacheLastRefreshed = now
  logger.info({ players: Object.keys(cache).length }, 'Refreshed NBA player headshot cache')
  return cache
}

export function getPlayerHeadshotUrl(playerName) {
  const normalized = normalizePlayerName(playerName)
  return playerHeadshotCache[normalized] || null
}
