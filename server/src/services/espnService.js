import { logger } from '../utils/logger.js'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'

// Map our sport keys to ESPN's {sport}/{league} path + optional query params
const SPORT_TO_ESPN = {
  americanfootball_nfl: { path: 'football/nfl' },
  americanfootball_ncaaf: { path: 'football/college-football', params: 'groups=80&limit=500' },
  basketball_nba: { path: 'basketball/nba' },
  basketball_ncaab: { path: 'basketball/mens-college-basketball', params: 'groups=50&limit=500' },
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

export async function fetchESPNScoreboard(sportKey) {
  const sport = SPORT_TO_ESPN[sportKey]
  if (!sport) return []

  const url = `${ESPN_BASE}/${sport.path}/scoreboard${sport.params ? `?${sport.params}` : ''}`

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
    const statusType = status?.type?.name // STATUS_IN_PROGRESS, STATUS_FINAL, STATUS_SCHEDULED
    const state = statusType === 'STATUS_IN_PROGRESS' ? 'in'
      : statusType === 'STATUS_FINAL' ? 'post'
      : statusType === 'STATUS_END_PERIOD' ? 'in'
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
