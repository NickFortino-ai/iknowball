import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { getLeaderboard, getUsersByTier } from '../services/leaderboardService.js'
import { getRoyaltyData } from '../services/recordService.js'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  const { scope = 'global', sport } = req.query
  const data = await getLeaderboard(scope, sport)
  res.json(data)
})

router.get('/tier/:tierName', requireAuth, async (req, res) => {
  const data = await getUsersByTier(req.params.tierName)
  res.json(data)
})

router.get('/royalty', requireAuth, async (req, res, next) => {
  try {
    const data = await getRoyaltyData()
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// Leagues leaderboard — aggregate league finish points
router.get('/leagues', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('bonus_points')
    .select('user_id, points, type, users(id, username, display_name, avatar_url, avatar_emoji, tier, total_points)')
    .in('type', ['league_win', 'bracket_finish', 'league_finish', 'survivor_win', 'league_pickem_earned'])

  if (error) throw error

  const userMap = {}
  for (const b of (data || [])) {
    if (!userMap[b.user_id]) {
      userMap[b.user_id] = { user: b.users, leaguePoints: 0, leaguesPlayed: 0, wins: 0, topHalf: 0, entries: [] }
    }
    userMap[b.user_id].leaguePoints += b.points
    userMap[b.user_id].entries.push(b)
    if (b.type === 'league_win' || b.type === 'survivor_win') userMap[b.user_id].wins++
  }

  // Count unique leagues per user and top-half finishes
  for (const u of Object.values(userMap)) {
    const leagueIds = new Set()
    for (const e of u.entries) {
      // Each bonus_points entry has a league_id implicitly from the type
      leagueIds.add(e.id) // Approximate — each entry is one league interaction
    }
    u.leaguesPlayed = Math.max(u.wins, Math.ceil(u.entries.length / 2)) // Approximate
    u.topHalf = u.entries.filter((e) => e.points > 0).length
    u.topHalfPct = u.entries.length > 0 ? Math.round((u.topHalf / u.entries.length) * 100) : 0
  }

  const leaderboard = Object.values(userMap)
    .sort((a, b) => b.leaguePoints - a.leaguePoints)
    .map((u, i) => ({
      rank: i + 1,
      ...u.user,
      league_points: u.leaguePoints,
      leagues_played: u.leaguesPlayed,
      top_half_pct: u.topHalfPct,
      wins: u.wins,
    }))

  res.json(leaderboard)
})

export default router
