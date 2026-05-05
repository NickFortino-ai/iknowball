import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { getMLBPlayerPool } from '../services/mlbDfsService.js'
import { fetchESPNScoreboard } from '../services/espnService.js'
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

function getWeekEnd(weekStart) {
  const d = new Date(weekStart + 'T12:00:00')
  d.setDate(d.getDate() + 6)
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

// Build a map: team abbreviation → { state, period, startsAt } for the given
// pick date. Compares each ESPN event's ET-date (MLB schedules in ET) to the
// pick date so a server in UTC doesn't blank out the map for late-evening
// US users (whose local "today" is yesterday in UTC).
async function buildMlbGameStateByTeam(date) {
  try {
    const events = await fetchESPNScoreboard('baseball_mlb')
    const map = {}
    for (const e of events) {
      if (!e.startsAt) continue
      const eventDate = new Date(e.startsAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      if (eventDate !== date) continue
      const entry = {
        state: e.state, // 'pre' | 'in' | 'post' | 'postponed'
        period: e.period, // e.g. "Top 5th"
        startsAt: e.startsAt,
        homeAbbrev: e.homeAbbrev,
        awayAbbrev: e.awayAbbrev,
      }
      if (e.homeAbbrev) map[e.homeAbbrev] = entry
      if (e.awayAbbrev) map[e.awayAbbrev] = entry
    }
    return map
  } catch (err) {
    logger.error({ err }, 'Failed to fetch MLB scoreboard for HR derby picks')
    return {}
  }
}

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

  const picks = data || []
  const stateByTeam = await buildMlbGameStateByTeam(date)
  const espnIds = [...new Set(picks.map((p) => p.espn_player_id).filter(Boolean))]
  const injuryByEspnId = {}
  if (espnIds.length) {
    const { data: salaryRows } = await supabase
      .from('mlb_dfs_salaries')
      .select('espn_player_id, injury_status')
      .eq('game_date', date)
      .in('espn_player_id', espnIds)
    for (const r of salaryRows || []) injuryByEspnId[r.espn_player_id] = r.injury_status
  }
  const enriched = picks.map((p) => {
    const g = stateByTeam[(p.team || '').toUpperCase()]
    return {
      ...p,
      game_state: g?.state || null,
      game_period: g?.period || null,
      game_starts_at: g?.startsAt || null,
      injury_status: injuryByEspnId[p.espn_player_id] || null,
    }
  })

  res.json(enriched)
})

// Players exhausted for the rest of the week under the league's
// pick_reuse setting. The View grays these out in the available list.
router.get('/used', async (req, res) => {
  const { league_id, date } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })

  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('pick_reuse')
    .eq('league_id', league_id)
    .maybeSingle()
  const reuseMode = settings?.pick_reuse || 'weekly'
  if (reuseMode === 'unlimited') return res.json([])

  const weekStart = getWeekStart(date)
  const weekEnd = getWeekEnd(weekStart)
  const { data } = await supabase
    .from('hr_derby_picks')
    .select('espn_player_id, player_name')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .gte('game_date', weekStart)
    .lte('game_date', weekEnd)
    .neq('game_date', date)

  const seen = new Set()
  const uniq = []
  for (const p of (data || [])) {
    if (seen.has(p.espn_player_id)) continue
    seen.add(p.espn_player_id)
    uniq.push(p)
  }
  res.json(uniq)
})

// Submit picks (up to 3 per day). Reuse rule comes from
// fantasy_settings.pick_reuse: 'weekly' (default, blocks players already
// used this Mon-Sun) or 'unlimited' (no reuse restriction).
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

  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('pick_reuse')
    .eq('league_id', league_id)
    .maybeSingle()

  const reuseMode = settings?.pick_reuse || 'weekly'

  if (reuseMode === 'weekly') {
    // Check picks the user already made on OTHER days this week. Today
    // is excluded because we're about to replace it — a player kept
    // across an edit must not be flagged as 'already used'.
    const weekStart = getWeekStart(date)
    const weekEnd = getWeekEnd(weekStart)
    const { data: priorPicks } = await supabase
      .from('hr_derby_picks')
      .select('espn_player_id, player_name')
      .eq('league_id', league_id)
      .eq('user_id', req.user.id)
      .gte('game_date', weekStart)
      .lte('game_date', weekEnd)
      .neq('game_date', date)

    const usedIds = new Set((priorPicks || []).map((p) => p.espn_player_id))
    for (const p of players) {
      if (usedIds.has(p.espn_player_id)) {
        return res.status(400).json({ error: `${p.player_name} was already used this week` })
      }
    }
  }

  // Diff existing picks against new picks instead of delete-all-reinsert —
  // wiping a row for a kept player and re-inserting briefly resets accumulated
  // stats to 0 until the next scoring sync.
  const { data: existingPicks } = await supabase
    .from('hr_derby_picks')
    .select('id, espn_player_id')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('game_date', date)

  const newIds = new Set(players.map((p) => p.espn_player_id))
  const existingIds = new Set((existingPicks || []).map((p) => p.espn_player_id))
  const toDeleteIds = (existingPicks || [])
    .filter((p) => !newIds.has(p.espn_player_id))
    .map((p) => p.id)
  const toInsert = players
    .filter((p) => !existingIds.has(p.espn_player_id))
    .map((p) => ({
      league_id,
      user_id: req.user.id,
      game_date: date,
      season: 2026,
      player_name: p.player_name,
      espn_player_id: p.espn_player_id,
      team: p.team,
      headshot_url: p.headshot_url,
    }))

  if (toDeleteIds.length) {
    await supabase.from('hr_derby_picks').delete().in('id', toDeleteIds)
  }
  if (toInsert.length) {
    const { error: pickErr } = await supabase.from('hr_derby_picks').insert(toInsert)
    if (pickErr) throw pickErr
  }

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
    .select('user_id, player_name, team, headshot_url, home_runs, game_date, espn_player_id')
    .eq('league_id', league_id)
    .order('game_date', { ascending: false })

  const today = new Date().toLocaleDateString('en-CA')
  const stateByTeam = await buildMlbGameStateByTeam(today)

  const todayEspnIds = [...new Set((picks || []).filter((p) => p.game_date === today).map((p) => p.espn_player_id).filter(Boolean))]
  const injuryByEspnId = {}
  if (todayEspnIds.length) {
    const { data: salaryRows } = await supabase
      .from('mlb_dfs_salaries')
      .select('espn_player_id, injury_status')
      .eq('game_date', today)
      .in('espn_player_id', todayEspnIds)
    for (const r of salaryRows || []) injuryByEspnId[r.espn_player_id] = r.injury_status
  }

  const now = Date.now()
  const userMap = {}
  for (const uid of allMemberIds) {
    userMap[uid] = { totalHRs: 0, picks: [] }
  }
  for (const p of (picks || [])) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { totalHRs: 0, picks: [] }
    userMap[p.user_id].totalHRs += p.home_runs || 0
    const isToday = p.game_date === today
    const g = isToday ? stateByTeam[(p.team || '').toUpperCase()] : null
    // Hide today's pick from opponents until the player's game has started.
    // Past-date picks stay visible (games already played).
    const isLive = !isToday || g?.state === 'in' || g?.state === 'post' ||
      (g?.startsAt && new Date(g.startsAt).getTime() <= now)
    const hideFromOpponent = !isLive && p.user_id !== req.user.id
    userMap[p.user_id].picks.push({
      player_name: hideFromOpponent ? null : p.player_name,
      team: hideFromOpponent ? null : p.team,
      headshot_url: hideFromOpponent ? null : p.headshot_url,
      home_runs: p.home_runs || 0,
      game_date: p.game_date,
      game_state: hideFromOpponent ? null : (g?.state || null),
      game_period: hideFromOpponent ? null : (g?.period || null),
      game_starts_at: hideFromOpponent ? null : (g?.startsAt || null),
      injury_status: hideFromOpponent ? null : (isToday ? (injuryByEspnId[p.espn_player_id] || null) : null),
      hidden: hideFromOpponent,
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
