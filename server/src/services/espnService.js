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
  americanfootball_ufl: { path: 'football/ufl' },
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
    const finalStatuses = ['STATUS_FINAL', 'STATUS_FULL_TIME']
    const postponedStatuses = ['STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_SUSPENDED', 'STATUS_RAIN_DELAY']
    const state = liveStatuses.includes(statusType) ? 'in'
      : finalStatuses.includes(statusType) ? 'post'
      : postponedStatuses.includes(statusType) ? 'postponed'
      : 'pre'

    // For baseball, use shortDetail (e.g. "Top 5th") as period instead of raw inning number
    const shortDetail = status?.type?.shortDetail || null
    const isBaseball = sport.path.includes('baseball')
    const period = isBaseball && shortDetail ? shortDetail : (status?.period ? String(status.period) : null)
    const clock = isBaseball ? null : (status?.displayClock || null)

    return {
      homeTeam: homeComp.team?.displayName || homeComp.team?.name || '',
      awayTeam: awayComp.team?.displayName || awayComp.team?.name || '',
      homeAbbrev: (homeComp.team?.abbreviation || '').toUpperCase(),
      awayAbbrev: (awayComp.team?.abbreviation || '').toUpperCase(),
      homeScore: parseInt(homeComp.score || '0', 10),
      awayScore: parseInt(awayComp.score || '0', 10),
      period,
      clock,
      state,
      // ISO start time so we can disambiguate doubleheaders. Falls back to
      // date if the API doesn't include time (rare).
      startsAt: event.date || competition.date || null,
    }
  }).filter(Boolean)
}

/**
 * Match an ESPN event to one of our game rows. Team names must match AND
 * — for sports that play doubleheaders or back-to-back same-day games —
 * the start times must be within ±4 hours. Without the time check we'd
 * non-deterministically match an MLB doubleheader's first game to game 2's
 * row (or vice-versa) when both events were returned by the same scoreboard
 * fetch, finalizing parlay legs based on the wrong result.
 */
export function matchESPNToGame(espnEvent, game) {
  const teamsOk = teamsMatch(espnEvent.homeTeam, game.home_team) && teamsMatch(espnEvent.awayTeam, game.away_team)
  if (!teamsOk) return false
  // If either side lacks a start time, fall back to team-only match.
  if (!espnEvent.startsAt || !game.starts_at) return true
  const diffMs = Math.abs(new Date(espnEvent.startsAt).getTime() - new Date(game.starts_at).getTime())
  // ±4 hours covers normal start-time slop (rain delays, schedule shifts)
  // while excluding the second game of a doubleheader, which is typically
  // 5+ hours after the first.
  return diffMs < 4 * 60 * 60 * 1000
}

// Team abbreviations for ESPN roster API
const SPORT_TEAMS = {
  'basketball/nba': [
    'atl', 'bos', 'bkn', 'cha', 'chi', 'cle', 'dal', 'den', 'det', 'gs',
    'hou', 'ind', 'lac', 'lal', 'mem', 'mia', 'mil', 'min', 'no', 'ny',
    'okc', 'orl', 'phi', 'phx', 'por', 'sac', 'sa', 'tor', 'uta', 'wsh',
  ],
  'baseball/mlb': [
    'ari', 'atl', 'bal', 'bos', 'chc', 'chw', 'cin', 'cle', 'col', 'det',
    'hou', 'kc', 'laa', 'lad', 'mia', 'mil', 'min', 'nym', 'nyy', 'oak',
    'phi', 'pit', 'sd', 'sf', 'sea', 'stl', 'tb', 'tex', 'tor', 'wsh',
  ],
}

// In-memory cache of player name → headshot URL, keyed by sport
const playerHeadshotCaches = {}
const cacheLastRefreshedTimes = {}

function normalizePlayerName(name) {
  return name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
}

export async function refreshPlayerHeadshotCache(sportPath = 'basketball/nba') {
  const now = Date.now()
  const lastRefreshed = cacheLastRefreshedTimes[sportPath] || 0
  const existingCache = playerHeadshotCaches[sportPath] || {}

  // Only refresh every 24 hours
  if (now - lastRefreshed < 24 * 60 * 60 * 1000 && Object.keys(existingCache).length > 0) {
    return existingCache
  }

  const teams = SPORT_TEAMS[sportPath]
  if (!teams) return existingCache

  const cache = {}
  for (const team of teams) {
    try {
      const url = `${ESPN_BASE}/${sportPath}/teams/${team}/roster`
      const res = await fetch(url)
      if (!res.ok) continue
      const data = await res.json()
      for (const entry of (data.athletes || [])) {
        // ESPN returns flat athletes for NBA, nested position groups for MLB
        const athletes = entry.items ? entry.items : [entry]
        for (const athlete of athletes) {
          const name = athlete.displayName || athlete.fullName
          if (name && athlete.headshot?.href) {
            cache[normalizePlayerName(name)] = athlete.headshot.href
          }
        }
      }
    } catch (err) {
      logger.warn({ sport: sportPath, team, err: err.message }, 'Failed to fetch ESPN roster for headshots')
    }
  }

  playerHeadshotCaches[sportPath] = cache
  cacheLastRefreshedTimes[sportPath] = now
  logger.info({ sport: sportPath, players: Object.keys(cache).length }, 'Refreshed player headshot cache')
  return cache
}

export function getPlayerHeadshotUrl(playerName, sportPath = 'basketball/nba') {
  const normalized = normalizePlayerName(playerName)
  return playerHeadshotCaches[sportPath]?.[normalized] || null
}

/**
 * Fetch the ESPN event ID for a game by matching teams + start time against
 * the ESPN scoreboard for that date.
 */
export async function findESPNEventId(sportKey, homeTeam, awayTeam, startsAt) {
  const sport = SPORT_TO_ESPN[sportKey]
  if (!sport) return null

  const gameDate = new Date(startsAt)

  // Try the game's UTC date and the previous day (late-night games in US timezones
  // can land on the next UTC day but ESPN lists them under the US calendar date)
  const datesToTry = [
    gameDate,
    new Date(gameDate.getTime() - 24 * 60 * 60 * 1000),
  ]

  for (const d of datesToTry) {
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

    const params = []
    if (sport.params) params.push(sport.params)
    params.push(`dates=${dateStr}`)
    const qs = `?${params.join('&')}`
    const url = `${ESPN_BASE}/${sport.path}/scoreboard${qs}`

    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const data = await res.json()

      for (const event of data.events || []) {
        const comp = event.competitions?.[0]
        if (!comp) continue
        const home = comp.competitors?.find((c) => c.homeAway === 'home')
        const away = comp.competitors?.find((c) => c.homeAway === 'away')
        if (!home || !away) continue

        const homeName = home.team?.displayName || home.team?.name || ''
        const awayName = away.team?.displayName || away.team?.name || ''
        if (teamsMatch(homeName, homeTeam) && teamsMatch(awayName, awayTeam)) {
          // Time proximity check for doubleheaders
          if (event.date && startsAt) {
            const diff = Math.abs(new Date(event.date).getTime() - gameDate.getTime())
            if (diff > 4 * 60 * 60 * 1000) continue
          }
          return event.id
        }
      }
    } catch (err) {
      logger.warn({ err: err.message, sportKey, dateStr }, 'Failed to find ESPN event ID')
    }
  }
  logger.info({ sportKey, homeTeam, awayTeam, startsAt }, 'Could not find ESPN event ID for game')
  return null
}

/**
 * Fetch the leading scorer per team from an ESPN game summary.
 * Returns: [{ team, playerName, points, headshotUrl }, ...]
 */
export async function fetchGameTopScorers(sportKey, espnEventId) {
  const sport = SPORT_TO_ESPN[sportKey]
  if (!sport || !espnEventId) return []

  const url = `${ESPN_BASE}/${sport.path}/summary?event=${espnEventId}`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()

    const results = []
    const boxscore = data.boxscore
    if (!boxscore?.players) return []

    for (const teamBox of boxscore.players) {
      const teamName = teamBox.team?.displayName || teamBox.team?.name || ''
      // NHL splits players into separate "forwards" / "defenses" groups —
      // iterate every group with a usable scoring column. Was previously
      // .find()-ing the first matching group only (i.e., forwards), which
      // missed any team whose top scorer was a defenseman.
      let topScorer = null
      let topPoints = 0
      for (const stats of teamBox.statistics || []) {
        if (!stats?.athletes?.length) continue

        // Sport-specific scoring column. NBA uses 'PTS'. Hockey doesn't
        // include a 'P' label by default in summary box scores, but does
        // include 'G' (goals) and 'A' (assists) — combine them to compute
        // a real point total. A defender with 2A beats a forward with 0G.
        const labels = stats.labels || []
        const ptsIdx = labels.indexOf('PTS')
        const goalsIdx = labels.indexOf('G')
        const assistsIdx = labels.indexOf('A')

        if (ptsIdx < 0 && goalsIdx < 0) continue

        for (const athlete of stats.athletes) {
          const aStats = athlete.stats || []
          let pts
          if (ptsIdx >= 0) {
            pts = parseInt(aStats[ptsIdx] || '0', 10)
          } else {
            const g = parseInt(aStats[goalsIdx] || '0', 10) || 0
            const a = assistsIdx >= 0 ? (parseInt(aStats[assistsIdx] || '0', 10) || 0) : 0
            pts = g + a
          }
          if (pts > topPoints) {
            topPoints = pts
            topScorer = {
              team: teamName,
              playerName: athlete.athlete?.displayName || '',
              points: pts,
              headshotUrl: athlete.athlete?.headshot?.href || null,
            }
          }
        }
      }
      // Skip when the box score is still empty (all athletes at 0). The
      // retry cron will pick this up on the next pass.
      if (topScorer && topPoints > 0) results.push(topScorer)
    }
    return results
  } catch (err) {
    logger.warn({ err: err.message, espnEventId }, 'Failed to fetch ESPN box score')
    return []
  }
}

// Fetch full per-player box stats for a game. Returns a map of
// normalized-lowercase-player-name → { points, rebounds, assists,
// threes, blocks, steals }. Used by WNBA prop settlement since we
// don't have a wnba_player_stats table populated separately. Reuses
// the existing normalizePlayerName helper defined earlier in this
// file (see findESPNEventId region).
export async function fetchPlayerBoxStats(sportKey, espnEventId) {
  const sport = SPORT_TO_ESPN[sportKey]
  if (!sport || !espnEventId) return {}

  const url = `${ESPN_BASE}/${sport.path}/summary?event=${espnEventId}`
  try {
    const res = await fetch(url)
    if (!res.ok) return {}
    const data = await res.json()
    const boxscore = data.boxscore
    if (!boxscore?.players) return {}

    const result = {}
    for (const teamBox of boxscore.players) {
      const stats = teamBox.statistics?.[0]
      if (!stats?.athletes?.length) continue
      const labels = stats.labels || []
      const idx = {
        pts: labels.indexOf('PTS'),
        reb: labels.indexOf('REB'),
        ast: labels.indexOf('AST'),
        threePT: labels.indexOf('3PT'),
        blk: labels.indexOf('BLK'),
        stl: labels.indexOf('STL'),
      }
      for (const athlete of stats.athletes) {
        const name = athlete.athlete?.displayName
        if (!name) continue
        const arr = athlete.stats || []
        // 3PT comes in "X-Y" form — made is X.
        const threes = idx.threePT >= 0 ? parseInt((arr[idx.threePT] || '0').split('-')[0], 10) : 0
        result[normalizePlayerName(name)] = {
          points: idx.pts >= 0 ? parseInt(arr[idx.pts] || '0', 10) : 0,
          rebounds: idx.reb >= 0 ? parseInt(arr[idx.reb] || '0', 10) : 0,
          assists: idx.ast >= 0 ? parseInt(arr[idx.ast] || '0', 10) : 0,
          threes,
          blocks: idx.blk >= 0 ? parseInt(arr[idx.blk] || '0', 10) : 0,
          steals: idx.stl >= 0 ? parseInt(arr[idx.stl] || '0', 10) : 0,
        }
      }
    }
    return result
  } catch (err) {
    logger.warn({ err: err.message, espnEventId }, 'Failed to fetch ESPN player box stats')
    return {}
  }
}
