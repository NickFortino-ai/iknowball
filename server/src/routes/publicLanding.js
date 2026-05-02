import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { calculateRiskPoints, calculateRewardPoints } from '../utils/scoring.js'
import { logger } from '../utils/logger.js'

const router = Router()

function americanToImpliedProb(odds) {
  if (odds > 0) return 100 / (odds + 100)
  return Math.abs(odds) / (Math.abs(odds) + 100)
}

async function pickMlbGame() {
  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', 'baseball_mlb')
    .single()
  if (!sport) return null

  const { data: games } = await supabase
    .from('games')
    .select('home_team, away_team, home_odds, away_odds, starts_at')
    .eq('sport_id', sport.id)
    .eq('status', 'upcoming')
    .not('home_odds', 'is', null)
    .not('away_odds', 'is', null)
    .gt('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(1)

  if (!games?.length) return null
  const g = games[0]
  return {
    homeTeam: g.home_team,
    awayTeam: g.away_team,
    homeRisk: calculateRiskPoints(g.home_odds),
    homeReward: calculateRewardPoints(g.home_odds),
    awayRisk: calculateRiskPoints(g.away_odds),
    awayReward: calculateRewardPoints(g.away_odds),
    homeIsFavorite: g.home_odds < g.away_odds, // more negative = favorite
    sportKey: 'baseball_mlb',
  }
}

async function pickNbaFutures() {
  const { data: markets } = await supabase
    .from('futures_markets')
    .select('title, outcomes')
    .eq('sport_key', 'basketball_nba')
    .eq('status', 'active')
    .ilike('title', '%champion%')
    .limit(1)

  if (!markets?.length) return null
  const m = markets[0]
  const outcomes = (typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes) || []
  const top = outcomes
    .filter((o) => o.price != null)
    .sort((a, b) => americanToImpliedProb(b.price) - americanToImpliedProb(a.price))
    .slice(0, 4)
    .map((o) => ({
      name: o.name,
      risk: calculateRiskPoints(o.price),
      reward: calculateRewardPoints(o.price),
    }))

  return { title: m.title, outcomes: top }
}

router.get('/landing-preview', async (req, res) => {
  try {
    const [mlbGame, nbaFutures] = await Promise.all([pickMlbGame(), pickNbaFutures()])
    res.set('Cache-Control', 'public, max-age=300')
    res.json({ mlbGame, nbaFutures })
  } catch (err) {
    logger.error({ err }, 'Landing preview failed')
    res.json({ mlbGame: null, nbaFutures: null })
  }
})

export default router
