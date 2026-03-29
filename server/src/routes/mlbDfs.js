import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import {
  getMLBPlayerPool,
  getMLBDFSRoster,
  saveMLBDFSRoster,
} from '../services/mlbDfsService.js'
import { getFantasySettings } from '../services/fantasyService.js'

const router = Router()
router.use(requireAuth)

// Get MLB player pool with salaries for a date
router.get('/players', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' })
  const data = await getMLBPlayerPool(date)
  res.json(data)
})

// Get my MLB roster for a date
router.get('/roster', async (req, res) => {
  const { league_id, date, season } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })
  const data = await getMLBDFSRoster(league_id, req.user.id, date, parseInt(season || '2026'))
  res.json(data)
})

// Save/update MLB roster
router.post('/roster', async (req, res) => {
  const { league_id, date, season, slots } = req.body
  if (!league_id || !date || !slots?.length) {
    return res.status(400).json({ error: 'league_id, date, and slots required' })
  }

  // Verify league membership
  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .maybeSingle()

  if (!member) return res.status(403).json({ error: 'Not a member of this league' })

  // Verify salary cap
  const settings = await getFantasySettings(league_id)
  const cap = settings?.salary_cap || 50000
  const totalSalary = slots.reduce((sum, s) => sum + (s.salary || 0), 0)
  if (totalSalary > cap) {
    return res.status(400).json({ error: 'Roster exceeds salary cap' })
  }

  const result = await saveMLBDFSRoster(league_id, req.user.id, date, parseInt(season || '2026'), slots)
  res.json(result)
})

// MLB DFS standings
router.get('/standings', async (req, res) => {
  const { league_id } = req.query
  if (!league_id) return res.status(400).json({ error: 'league_id required' })

  const { data: results } = await supabase
    .from('mlb_dfs_nightly_results')
    .select('user_id, total_points, is_night_winner')
    .eq('league_id', league_id)

  if (!results?.length) return res.json({ standings: [] })

  // Aggregate
  const userMap = {}
  for (const r of results) {
    if (!userMap[r.user_id]) userMap[r.user_id] = { totalPoints: 0, nightlyWins: 0 }
    userMap[r.user_id].totalPoints += Number(r.total_points)
    if (r.is_night_winner) userMap[r.user_id].nightlyWins++
  }

  // Get user details
  const userIds = Object.keys(userMap)
  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji')
    .in('id', userIds)

  const standings = userIds.map((uid) => ({
    user: users?.find((u) => u.id === uid) || { id: uid },
    ...userMap[uid],
  }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((s, i) => ({ ...s, rank: i + 1 }))

  res.json({ standings })
})

export default router
