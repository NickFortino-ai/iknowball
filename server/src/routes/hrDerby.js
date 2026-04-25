import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { getMLBPlayerPool } from '../services/mlbDfsService.js'
import { logger } from '../utils/logger.js'

const router = Router()
router.use(requireAuth)

// Cache ESPN HR leaders (refreshed every 30 min)
let hrLeadersCache = null
let hrLeadersCacheTime = 0
const HR_CACHE_TTL = 30 * 60 * 1000

async function getSeasonHRLeaders() {
  if (hrLeadersCache && Date.now() - hrLeadersCacheTime < HR_CACHE_TTL) return hrLeadersCache
  try {
    const res = await fetch('https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/2026/types/2/leaders?limit=200')
    if (!res.ok) throw new Error(`ESPN returned ${res.status}`)
    const data = await res.json()
    const hrMap = {}
    for (const cat of data.categories || []) {
      if (cat.abbreviation === 'HR') {
        for (const leader of cat.leaders || []) {
          const ref = leader.athlete?.$ref || ''
          const match = ref.match(/\/athletes\/(\d+)/)
          if (match) hrMap[match[1]] = Math.round(leader.value)
        }
        break
      }
    }
    hrLeadersCache = hrMap
    hrLeadersCacheTime = Date.now()
    logger.info({ count: Object.keys(hrMap).length }, 'Refreshed ESPN HR leaders cache')
    return hrMap
  } catch (err) {
    logger.error({ err }, 'Failed to fetch ESPN HR leaders')
    return hrLeadersCache || {}
  }
}

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

  // Fetch season HR leaders from ESPN
  const hrMap = await getSeasonHRLeaders()

  // Attach season_hrs and sort by HRs desc, then salary as tiebreaker
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

  // Get all league members
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', league_id)

  if (!members?.length) return res.json({ standings: [] })

  const allMemberIds = members.map((m) => m.user_id)

  // Aggregate all picks with HRs + keep detail for dropdown
  const { data: picks } = await supabase
    .from('hr_derby_picks')
    .select('user_id, player_name, team, headshot_url, home_runs, game_date')
    .eq('league_id', league_id)
    .order('game_date', { ascending: false })

  const userMap = {}
  for (const uid of allMemberIds) {
    userMap[uid] = { totalHRs: 0, picks: [] }
  }
  for (const p of (picks || [])) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { totalHRs: 0, picks: [] }
    userMap[p.user_id].totalHRs += p.home_runs || 0
    userMap[p.user_id].picks.push({
      player_name: p.player_name,
      team: p.team,
      headshot_url: p.headshot_url,
      home_runs: p.home_runs || 0,
      game_date: p.game_date,
    })
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
    .sort((a, b) => b.totalHRs - a.totalHRs)
    .map((s, i) => ({ ...s, rank: i + 1 }))

  res.json({ standings })
})

export default router
