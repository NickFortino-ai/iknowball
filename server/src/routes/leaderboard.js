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
    .select('user_id, league_id, points, type, users(id, username, display_name, avatar_url, avatar_emoji, tier, total_points)')
    .in('type', ['league_win', 'bracket_finish', 'league_finish', 'survivor_win', 'league_pickem_earned'])

  if (error) throw error

  const userMap = {}
  for (const b of (data || [])) {
    if (!userMap[b.user_id]) {
      userMap[b.user_id] = { user: b.users, leaguePoints: 0, wins: 0, leagueIds: new Set(), leagueResults: {} }
    }
    userMap[b.user_id].leaguePoints += b.points
    if (b.type === 'league_win' || b.type === 'survivor_win') userMap[b.user_id].wins++

    // Track unique leagues and best result per league (for top-half calc)
    if (b.league_id) {
      userMap[b.user_id].leagueIds.add(b.league_id)
      // Store the finish type per league — league_win/survivor_win count as top half
      // league_finish with positive points = top half
      const existing = userMap[b.user_id].leagueResults[b.league_id]
      if (!existing || b.type === 'league_win' || b.type === 'survivor_win') {
        userMap[b.user_id].leagueResults[b.league_id] = { points: b.points, type: b.type }
      }
    }
  }

  // Calculate leagues played and top-half percentage from unique leagues
  for (const u of Object.values(userMap)) {
    u.leaguesPlayed = u.leagueIds.size
    const results = Object.values(u.leagueResults)
    const topHalf = results.filter((r) =>
      r.type === 'league_win' || r.type === 'survivor_win' || r.points > 0
    ).length
    u.topHalfPct = results.length > 0 ? Math.round((topHalf / results.length) * 100) : 0
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
