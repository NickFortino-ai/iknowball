import { logger } from './logger.js'

const ESPN_BASE = 'https://site.api.espn.com/apis/common/v3/sports'

/**
 * Fetch a player's game log from ESPN.
 * Returns array of per-game stat objects (most recent first).
 */
export async function fetchGameLog(espnId, sportPath, season) {
  try {
    const seasonParam = sportPath !== 'basketball/nba' ? `?season=${season}` : ''
    const res = await fetch(`${ESPN_BASE}/${sportPath}/athletes/${espnId}/gamelog${seasonParam}`)
    if (!res.ok) return null
    const data = await res.json()

    const categories = data.categories || data.seasonTypes || []
    const games = []

    for (const cat of categories) {
      const events = cat.events || []
      const labels = cat.labels || []
      for (const evt of events) {
        const stats = evt.stats || []
        if (!stats.length) continue
        const statMap = {}
        labels.forEach((l, i) => { statMap[l] = stats[i] })
        games.push(statMap)
      }
    }

    return games
  } catch {
    return null
  }
}

/**
 * Calculate weighted FPPG from game log using recent performance weighting.
 *
 * @param {Function} calcFppgForGame - function that takes a statMap and returns fantasy points for that game
 * @param {Array} gameLog - array of per-game statMaps (most recent first)
 * @param {number} seasonAvgFppg - full season average FPPG (fallback)
 * @param {Object} opts - { recentN, midN, wRecent, wMid, wFull } — e.g. NBA: {recentN: 10, midN: 20}, NFL: {recentN: 4, midN: 8}
 *   Optional weights (wRecent, wMid, wFull) default to 0.5 / 0.3 / 0.2.
 *   MLB uses 0.25 / 0.30 / 0.45 to keep established stars priced higher.
 * @returns {number} weighted FPPG
 */
export function calcWeightedFppg(calcFppgForGame, gameLog, seasonAvgFppg, opts) {
  const { recentN, midN, wRecent = 0.5, wMid = 0.3, wFull = 0.2 } = opts
  const earlyFullThreshold = recentN // need at least this many games for full weighting
  const earlyBlendThreshold = Math.ceil(recentN * 0.3) // 3 for NBA/MLB, 2 for NFL

  if (!gameLog || gameLog.length === 0) {
    // No games this season — fall back to season avg (which may be previous season or positional avg)
    return seasonAvgFppg || 0
  }

  // Calculate per-game fantasy points
  const gameFpts = gameLog.map((g) => calcFppgForGame(g)).filter((v) => v != null)
  if (gameFpts.length === 0) return seasonAvgFppg || 0

  const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0

  if (gameFpts.length <= earlyBlendThreshold) {
    // Very few games — use available at 100%
    return avg(gameFpts)
  }

  if (gameFpts.length < earlyFullThreshold) {
    // Blend available games 70%, season avg 30%
    return avg(gameFpts) * 0.7 + (seasonAvgFppg || avg(gameFpts)) * 0.3
  }

  // Full weighted formula
  const recentAvg = avg(gameFpts.slice(0, recentN))
  const midAvg = avg(gameFpts.slice(0, midN))
  const fullAvg = seasonAvgFppg || avg(gameFpts)

  return recentAvg * wRecent + midAvg * wMid + fullAvg * wFull
}

/**
 * Fetch team defensive rankings for a sport from ESPN.
 * Returns a Map of team abbreviation → rank (1 = best defense, 30+ = worst).
 */
const defRatingCache = new Map() // sportPath → { data, ts }
const CACHE_TTL = 6 * 60 * 60 * 1000 // 6 hours

export async function fetchDefensiveRankings(sportPath) {
  const cached = defRatingCache.get(sportPath)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  const rankings = new Map()
  try {
    // ESPN team stats page — sort by points allowed or defensive rating
    let statType, statIndex
    if (sportPath === 'basketball/nba') {
      // NBA: opponent points per game — lower = better defense
      statType = 'defense'
    } else if (sportPath === 'baseball/mlb') {
      // MLB: runs allowed per game
      statType = 'pitching'
    } else if (sportPath === 'football/nfl') {
      statType = 'defense'
    }

    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportPath}/teams?limit=40`)
    if (!res.ok) return rankings
    const data = await res.json()

    const teams = []
    for (const team of data.sports?.[0]?.leagues?.[0]?.teams || []) {
      const t = team.team || team
      const abbrev = t.abbreviation
      if (!abbrev) continue

      // Fetch team stats to get defensive rating
      try {
        const statsRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportPath}/teams/${t.id}/statistics`)
        if (!statsRes.ok) continue
        const statsData = await statsRes.json()

        let defValue = 0
        if (sportPath === 'basketball/nba') {
          // Look for opponent points per game or defensive rating
          const defCat = statsData.results?.stats?.categories?.find((c) => c.name === 'defensive')
            || statsData.results?.stats?.categories?.find((c) => c.name === 'general')
          if (defCat) {
            const oppPts = defCat.stats?.find((s) => s.name === 'avgPointsAgainst' || s.name === 'pointsAgainst')
            defValue = oppPts?.value || 0
          }
        } else if (sportPath === 'football/nfl') {
          const defCat = statsData.results?.stats?.categories?.find((c) => c.name === 'defensive' || c.name === 'general')
          if (defCat) {
            const oppPts = defCat.stats?.find((s) => s.name === 'totalPointsPerGame' || s.name === 'avgPointsAgainst')
            defValue = oppPts?.value || 0
          }
        } else if (sportPath === 'baseball/mlb') {
          const pitCat = statsData.results?.stats?.categories?.find((c) => c.name === 'pitching')
          if (pitCat) {
            const era = pitCat.stats?.find((s) => s.name === 'ERA' || s.name === 'earnedRunAverage')
            defValue = era?.value || 0
          }
        }

        teams.push({ abbrev, defValue })
      } catch {
        continue
      }
    }

    // Sort by defensive value (lower = better defense for all sports)
    teams.sort((a, b) => a.defValue - b.defValue)
    teams.forEach((t, i) => rankings.set(t.abbrev, i + 1))

    defRatingCache.set(sportPath, { data: rankings, ts: Date.now() })
    logger.info({ sport: sportPath, teams: rankings.size }, 'Fetched defensive rankings')
  } catch (err) {
    logger.error({ err, sportPath }, 'Failed to fetch defensive rankings')
  }

  return rankings
}

/**
 * Apply opponent defensive adjustment to a salary.
 * @param {number} salary - base salary
 * @param {string} opponentAbbrev - opponent team abbreviation
 * @param {Map} defRankings - team → rank (1 = best defense)
 * @param {number} totalTeams - number of teams in the league (30 for NBA/MLB, 32 for NFL)
 */
export function applyDefensiveAdjustment(salary, opponentAbbrev, defRankings, totalTeams = 30) {
  if (!defRankings?.size || !opponentAbbrev) return salary

  const rank = defRankings.get(opponentAbbrev)
  if (!rank) return salary

  if (rank <= 5) return Math.round(salary * 0.90 / 100) * 100
  if (rank <= 10) return Math.round(salary * 0.95 / 100) * 100
  if (rank > totalTeams - 5) return Math.round(salary * 1.10 / 100) * 100
  if (rank > totalTeams - 10) return Math.round(salary * 1.05 / 100) * 100

  return salary
}
