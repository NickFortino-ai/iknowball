import { logger } from './logger.js'

const ESPN_BASE = 'https://site.api.espn.com/apis/common/v3/sports'

/**
 * Fetch a player's game log from ESPN.
 * Returns array of per-game stat objects (most recent first).
 *
 * ESPN structures every sport's gamelog as:
 *   data.labels  — flat array of stat column labels (top-level, NOT per-category)
 *   data.names   — semantic stat names, same length/order as labels
 *   data.seasonTypes[].categories[].events[].stats — flat per-game value arrays
 *
 * The top-level data.categories array carries only group metadata (e.g. NFL:
 * "passing" count=11, "rushing" count=5) and never has events directly. The
 * previous implementation read cat.labels + cat.events at this level and so
 * silently produced empty statMaps for every sport.
 *
 * Each returned statMap is keyed by BOTH label and semantic name. NBA/MLB
 * labels are unique so existing scoring functions reading by label keep
 * working. NFL labels collide (YDS appears in both passing and rushing
 * groups), so the NFL scoring function must read by semantic name
 * (passingYards, rushingYards, receivingYards, etc.).
 */
export async function fetchGameLog(espnId, sportPath, season) {
  try {
    const seasonParam = sportPath !== 'basketball/nba' ? `?season=${season}` : ''
    const res = await fetch(`${ESPN_BASE}/${sportPath}/athletes/${espnId}/gamelog${seasonParam}`)
    if (!res.ok) return null
    const data = await res.json()

    const labels = data.labels || []
    const names = data.names || []
    // ESPN exposes per-event metadata (including gameDate) keyed by eventId
    // on data.events, while the actual stat rows live under
    // seasonTypes[].categories[].events[]. Join the two so calcWeightedFppg
    // can reason about recency below.
    const eventsMap = data.events || {}
    const games = []

    for (const seasonType of (data.seasonTypes || [])) {
      for (const cat of (seasonType.categories || [])) {
        for (const evt of (cat.events || [])) {
          const stats = evt.stats || []
          if (!stats.length) continue
          const statMap = {}
          labels.forEach((l, i) => { statMap[l] = stats[i] })
          names.forEach((n, i) => { statMap[n] = stats[i] })
          const meta = eventsMap[evt.eventId]
          if (meta?.gameDate) statMap._gameDate = meta.gameDate
          games.push(statMap)
        }
      }
    }

    // Sort most-recent-first so calcWeightedFppg's slice(0, recentN) is
    // actually recent (ESPN's natural order is regular season → playoffs
    // within each season type, which isn't strictly chronological). Games
    // without a date fall to the end.
    games.sort((a, b) => {
      const da = a._gameDate || ''
      const db = b._gameDate || ''
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return db.localeCompare(da)
    })

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
  const { recentN, midN, wRecent = 0.5, wMid = 0.3, wFull = 0.2, cadence = 'daily', starterSignal = 0 } = opts
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

  let weighted
  if (gameFpts.length <= earlyBlendThreshold) {
    // Very few games — use available at 100%
    weighted = avg(gameFpts)
  } else if (gameFpts.length < earlyFullThreshold) {
    // Blend available games 70%, season avg 30%
    weighted = avg(gameFpts) * 0.7 + (seasonAvgFppg || avg(gameFpts)) * 0.3
  } else {
    // Full weighted formula
    const recentAvg = avg(gameFpts.slice(0, recentN))
    const midAvg = avg(gameFpts.slice(0, midN))
    const fullAvg = seasonAvgFppg || avg(gameFpts)
    weighted = recentAvg * wRecent + midAvg * wMid + fullAvg * wFull
  }

  return applyStalenessDiscount(weighted, gameLog, cadence, starterSignal)
}

// Recency-staleness discount. The played-games average overstates a
// player's expected output when they haven't been on the floor recently
// (typical case: healthy scratch / coach's-decision DNP — ESPN's gamelog
// drops MIN=0 rows, so the model never sees that the team has been
// playing without them). Discount tiers by days-since-most-recent-game,
// with a sport-aware cadence so NFL bye weeks don't get false-positived
// as benchwarmer signal. Cap at 90 days so the cross-season gap doesn't
// crush prior-season fallbacks at fall openers.
//
// Tier format: [{ daysAtLeast, factor }, ...] ordered by daysAtLeast desc.
// First match wins. Implicit "below the smallest threshold → no discount."
const STALENESS_TIERS = {
  // NBA / WNBA / MLB — daily cadence, 1–2 day inter-game gap
  daily: [
    { daysAtLeast: 21, factor: 0 },
    { daysAtLeast: 14, factor: 0.25 },
    { daysAtLeast: 7,  factor: 0.50 },
  ],
  // NFL — weekly cadence, bye weeks add an expected ~7-day gap. A player
  // returning from bye looks like a 14-day gap and shouldn't be punished.
  weekly: [
    { daysAtLeast: 31, factor: 0 },       // 4+ missed weeks (long absence)
    { daysAtLeast: 24, factor: 0.25 },    // 3+ missed weeks
    { daysAtLeast: 17, factor: 0.50 },    // 2+ missed weeks (more than just a bye)
    // ≤17 days covers normal weekly cadence (≤9d) and post-bye (≤17d) — no discount.
  ],
}

// starterSignal ∈ [0, 1]: 0 = no protection (full discount), 1 = full
// protection (no discount), interpolated in between. Lets the caller pass
// a sport-specific "is this a heavy-minutes/usage starter?" hint so an
// elite player returning from injury isn't priced like a benchwarmer.
// Carlson (~11 MPG when active) signals 0 → still discounted. A 32-MPG
// starter back from a 2-week injury signals 1 → no discount, his prior
// production stands.
function applyStalenessDiscount(weighted, gameLog, cadence = 'daily', starterSignal = 0) {
  const mostRecent = gameLog?.[0]?._gameDate || gameLog?.[0]?.gameDate
  if (!mostRecent) return weighted
  const daysSince = Math.max(0, (Date.now() - new Date(mostRecent).getTime()) / 86400000)
  if (daysSince > 90) return weighted // off-season / cross-season — don't discount
  const s = Math.min(1, Math.max(0, starterSignal))
  for (const tier of STALENESS_TIERS[cadence] || STALENESS_TIERS.daily) {
    if (daysSince >= tier.daysAtLeast) {
      // Interpolate: appliedFactor lerps from tier.factor (s=0) to 1 (s=1).
      const appliedFactor = tier.factor + (1 - tier.factor) * s
      return weighted * appliedFactor
    }
  }
  return weighted // within normal cadence — current form
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
