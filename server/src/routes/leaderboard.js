import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { getLeaderboard, getUsersByTier } from '../services/leaderboardService.js'
import { getRoyaltyData } from '../services/recordService.js'
import { fetchAll } from '../utils/fetchAll.js'

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
  // Fetch bonus points and actual league membership in parallel
  const [bonusData, memberData] = await Promise.all([
    fetchAll(
      supabase
        .from('bonus_points')
        .select('user_id, league_id, points, type, users(id, username, display_name, avatar_url, avatar_emoji, tier, total_points)')
        .in('type', ['league_win', 'bracket_finish', 'league_finish', 'survivor_win', 'league_pickem_earned'])
    ),
    fetchAll(
      supabase
        .from('league_members')
        .select('user_id, league_id, leagues!inner(status)')
        .eq('leagues.status', 'completed')
    ),
  ])

  // Build map of completed leagues per user from league_members
  const completedLeaguesMap = {}
  for (const m of (memberData || [])) {
    if (!completedLeaguesMap[m.user_id]) completedLeaguesMap[m.user_id] = new Set()
    completedLeaguesMap[m.user_id].add(m.league_id)
  }

  const userMap = {}
  for (const b of (bonusData || [])) {
    if (!userMap[b.user_id]) {
      userMap[b.user_id] = { user: b.users, leaguePoints: 0, wins: 0, leagueResults: {} }
    }
    userMap[b.user_id].leaguePoints += b.points
    if (b.type === 'league_win' || b.type === 'survivor_win') userMap[b.user_id].wins++

    // Track best result per league for top-half calc
    if (b.league_id) {
      const existing = userMap[b.user_id].leagueResults[b.league_id]
      if (!existing || b.type === 'league_win' || b.type === 'survivor_win') {
        userMap[b.user_id].leagueResults[b.league_id] = { points: b.points, type: b.type }
      }
    }
  }

  // Calculate leagues played from league_members (not bonus_points) and top-half percentage
  for (const u of Object.values(userMap)) {
    const completedLeagues = completedLeaguesMap[u.user.id]
    u.leaguesPlayed = completedLeagues ? completedLeagues.size : 0
    const results = Object.values(u.leagueResults)
    const topHalf = results.filter((r) =>
      r.type === 'league_win' || r.type === 'survivor_win' || r.points > 0
    ).length
    u.topHalfPct = u.leaguesPlayed > 0 ? Math.round((topHalf / u.leaguesPlayed) * 100) : 0
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
