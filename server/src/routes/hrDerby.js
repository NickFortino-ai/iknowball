import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { getMLBPlayerPool } from '../services/mlbDfsService.js'

const router = Router()
router.use(requireAuth)

// Get Monday of the week for a given date
function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1 // Monday = 0
  d.setDate(d.getDate() - diff)
  return d.toLocaleDateString('en-CA')
}

// Get available MLB hitters for HR derby (filtered, sorted by season HRs)
router.get('/players', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date required' })
  const pool = await getMLBPlayerPool(date)

  // Filter out pitchers — HR derby only cares about hitters
  const hitters = pool.filter((p) => !p.is_pitcher)

  // Fetch season HR totals from mlb_dfs_player_stats
  const espnIds = hitters.map((p) => p.espn_player_id).filter(Boolean)
  let hrMap = {}
  if (espnIds.length) {
    const { data: hrData } = await supabase.rpc('aggregate_season_hrs', { p_espn_ids: espnIds, p_season: 2026 })
    if (hrData) {
      for (const row of hrData) hrMap[row.espn_player_id] = row.total_hrs
    }
  }

  // Attach season_hrs and sort by it (desc), then salary as tiebreaker
  const enriched = hitters.map((p) => ({
    ...p,
    season_hrs: hrMap[p.espn_player_id] || 0,
  }))
  enriched.sort((a, b) => b.season_hrs - a.season_hrs || b.salary - a.salary)

  res.json(enriched)
})

// Get my picks for a date
router.get('/picks', async (req, res) => {
  const { league_id, date } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })

  const { data } = await supabase
    .from('hr_derby_picks')
    .select('*')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('game_date', date)

  res.json(data || [])
})

// Get used players this week
router.get('/used', async (req, res) => {
  const { league_id, date } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })

  const weekStart = getWeekStart(date)

  const { data } = await supabase
    .from('hr_derby_usage')
    .select('espn_player_id, player_name')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('week_start', weekStart)

  res.json(data || [])
})

// Submit picks (up to 3 per day)
router.post('/picks', async (req, res) => {
  const { league_id, date, players } = req.body
  if (!league_id || !date || !players?.length) {
    return res.status(400).json({ error: 'league_id, date, and players required' })
  }
  if (players.length > 3) {
    return res.status(400).json({ error: 'Maximum 3 picks per day' })
  }

  // Verify league membership
  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .maybeSingle()

  if (!member) return res.status(403).json({ error: 'Not a member of this league' })

  const weekStart = getWeekStart(date)

  // Check weekly usage — these players can't have been used this week
  const { data: used } = await supabase
    .from('hr_derby_usage')
    .select('espn_player_id')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('week_start', weekStart)

  const usedIds = new Set((used || []).map((u) => u.espn_player_id))
  for (const p of players) {
    if (usedIds.has(p.espn_player_id)) {
      return res.status(400).json({ error: `${p.player_name} was already used this week` })
    }
  }

  // Delete existing picks for this day (replacing)
  await supabase
    .from('hr_derby_picks')
    .delete()
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('game_date', date)

  // Also remove old usage entries for this day's picks (in case re-picking)
  // We track usage per week, so we need to clean up if they change picks for today
  const { data: oldPicks } = await supabase
    .from('hr_derby_picks')
    .select('espn_player_id')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('game_date', date)

  // Insert new picks
  const pickRows = players.map((p) => ({
    league_id,
    user_id: req.user.id,
    game_date: date,
    season: 2026,
    player_name: p.player_name,
    espn_player_id: p.espn_player_id,
    team: p.team,
    headshot_url: p.headshot_url,
  }))

  const { error: pickErr } = await supabase.from('hr_derby_picks').insert(pickRows)
  if (pickErr) throw pickErr

  // Record weekly usage
  const usageRows = players.map((p) => ({
    league_id,
    user_id: req.user.id,
    week_start: weekStart,
    espn_player_id: p.espn_player_id,
    player_name: p.player_name,
  }))

  const { error: usageErr } = await supabase
    .from('hr_derby_usage')
    .upsert(usageRows, { onConflict: 'league_id,user_id,week_start,espn_player_id' })

  if (usageErr) throw usageErr

  res.json({ submitted: players.length })
})

// Standings
router.get('/standings', async (req, res) => {
  const { league_id } = req.query
  if (!league_id) return res.status(400).json({ error: 'league_id required' })

  // Aggregate all picks with HRs
  const { data: picks } = await supabase
    .from('hr_derby_picks')
    .select('user_id, home_runs, hr_distance_total')
    .eq('league_id', league_id)

  if (!picks?.length) return res.json({ standings: [] })

  const userMap = {}
  for (const p of picks) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { totalHRs: 0, totalDistance: 0 }
    userMap[p.user_id].totalHRs += p.home_runs || 0
    userMap[p.user_id].totalDistance += p.hr_distance_total || 0
  }

  const userIds = Object.keys(userMap)
  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji')
    .in('id', userIds)

  const standings = userIds.map((uid) => ({
    user: users?.find((u) => u.id === uid) || { id: uid },
    ...userMap[uid],
  }))
    .sort((a, b) => b.totalHRs - a.totalHRs || b.totalDistance - a.totalDistance)
    .map((s, i) => ({ ...s, rank: i + 1 }))

  res.json({ standings })
})

export default router
