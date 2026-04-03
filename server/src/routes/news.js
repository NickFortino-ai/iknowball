import { Router } from 'express'
import { logger } from '../utils/logger.js'

const router = Router()

const ESPN_SPORT_PATHS = {
  nfl: 'football/nfl',
  nba: 'basketball/nba',
  mlb: 'baseball/mlb',
  nhl: 'hockey/nhl',
}

// In-memory cache: { [sport]: { data, fetchedAt } }
const cache = {}
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

router.get('/', async (req, res) => {
  const sport = req.query.sport || 'nfl'
  const espnPath = ESPN_SPORT_PATHS[sport]
  if (!espnPath) return res.status(400).json({ error: 'Invalid sport. Use: nfl, nba, mlb, nhl' })

  // Check cache
  const cached = cache[sport]
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return res.json(cached.data)
  }

  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${espnPath}/news?limit=25`)
    if (!response.ok) throw new Error(`ESPN returned ${response.status}`)
    const raw = await response.json()

    const articles = (raw.articles || []).map((a) => ({
      id: a.id,
      headline: a.headline,
      description: a.description || null,
      published: a.published,
      image: a.images?.[0]?.url || null,
      link: a.links?.web?.href || a.links?.api?.news?.href || null,
      type: a.type || 'Article',
    }))

    const result = { articles, sport }
    cache[sport] = { data: result, fetchedAt: Date.now() }
    res.json(result)
  } catch (err) {
    logger.error({ err, sport }, 'Failed to fetch ESPN news')
    // Return stale cache if available
    if (cached) return res.json(cached.data)
    res.status(502).json({ error: 'Failed to fetch news' })
  }
})

export default router
