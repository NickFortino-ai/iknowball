import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { getNBAPlayerPool } from '../services/nbaDfsService.js'
import { fetchESPNScoreboard } from '../services/espnService.js'
import { logger } from '../utils/logger.js'

const router = Router()
router.use(requireAuth)

// Cache ESPN season 3PM leaders (refreshed every 30 min)
let threeLeadersCache = null
let threeLeadersCacheTime = 0
const THREE_CACHE_TTL = 30 * 60 * 1000

// Fetch ESPN's 3PM leaders for one season type and merge into accumulator.
// types/2 = regular season, types/3 = postseason. Adding playoff makes is
// the right call during the postseason window — players who don't make
// the playoffs simply get 0 added.
async function fetch3PMForType(seasonType, accumulator) {
  const targetAbbrevs = new Set(['3PM', 'TPM', 'threePointFieldGoalsMade'])
  const res = await fetch(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2026/types/${seasonType}/leaders?limit=200`)
  if (!res.ok) throw new Error(`ESPN returned ${res.status} for type ${seasonType}`)
  const data = await res.json()
  for (const cat of data.categories || []) {
    const abbr = cat.abbreviation || cat.name || ''
    if (!targetAbbrevs.has(abbr)) continue
    for (const leader of cat.leaders || []) {
      const ref = leader.athlete?.$ref || ''
      const m = ref.match(/\/athletes\/(\d+)/)
      if (!m) continue
      accumulator[m[1]] = (accumulator[m[1]] || 0) + Math.round(leader.value)
    }
    break
  }
}

async function getSeason3PMLeaders() {
  if (threeLeadersCache && Date.now() - threeLeadersCacheTime < THREE_CACHE_TTL) return threeLeadersCache
  const map = {}
  // Regular season is required; postseason is best-effort. If the
  // postseason endpoint hasn't started populating yet (off-season) it
  // returns an empty leaders array, not an error, so we just continue.
  try {
    await fetch3PMForType(2, map)
  } catch (err) {
    logger.error({ err }, 'Failed to fetch ESPN 3PM regular-season leaders')
    return threeLeadersCache || {}
  }
  try {
    await fetch3PMForType(3, map)
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch ESPN 3PM postseason leaders (continuing with regular only)')
  }
  threeLeadersCache = map
  threeLeadersCacheTime = Date.now()
  logger.info({ count: Object.keys(map).length }, 'Refreshed ESPN 3PM leaders cache (regular + postseason)')
  return map
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return d.toLocaleDateString('en-CA')
}

// Available NBA players for the night, sorted by season 3PM desc.
router.get('/players', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date required' })
  const pool = await getNBAPlayerPool(date)
  const leaders = await getSeason3PMLeaders()
  const enriched = pool.map((p) => ({
    ...p,
    season_threes: leaders[p.espn_player_id] || 0,
  }))
  enriched.sort((a, b) => b.season_threes - a.season_threes || b.salary - a.salary)
  res.json(enriched)
})

// Map team abbreviation -> live game state for the picks panel.
async function buildNbaGameStateByTeam(date) {
  try {
    const events = await fetchESPNScoreboard('basketball_nba')
    const map = {}
    for (const e of events) {
      if (!e.startsAt) continue
      const eventDate = new Date(e.startsAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      if (eventDate !== date) continue
      const entry = {
        state: e.state,
        period: e.period,
        startsAt: e.startsAt,
        homeAbbrev: e.homeAbbrev,
        awayAbbrev: e.awayAbbrev,
      }
      if (e.homeAbbrev) map[e.homeAbbrev] = entry
      if (e.awayAbbrev) map[e.awayAbbrev] = entry
    }
    return map
  } catch (err) {
    logger.error({ err }, 'Failed to fetch NBA scoreboard for 3-Point picks')
    return {}
  }
}

router.get('/picks', async (req, res) => {
  const { league_id, date } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })

  const { data } = await supabase
    .from('three_point_picks')
    .select('*')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('game_date', date)

  const picks = data || []
  const stateByTeam = await buildNbaGameStateByTeam(date)
  const enriched = picks.map((p) => {
    const g = stateByTeam[(p.team || '').toUpperCase()]
    return {
      ...p,
      game_state: g?.state || null,
      game_period: g?.period || null,
      game_starts_at: g?.startsAt || null,
    }
  })

  res.json(enriched)
})

router.get('/used', async (req, res) => {
  const { league_id, date } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })

  const weekStart = getWeekStart(date)
  const { data } = await supabase
    .from('three_point_usage')
    .select('espn_player_id, player_name')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('week_start', weekStart)

  res.json(data || [])
})

// Submit picks (up to 3 per night). Reuse rule comes from
// fantasy_settings.pick_reuse: 'weekly' (default, blocks players already
// used this Mon-Sun) or 'unlimited' (no reuse restriction).
router.post('/picks', async (req, res) => {
  const { league_id, date, players } = req.body
  if (!league_id || !date || !players?.length) {
    return res.status(400).json({ error: 'league_id, date, and players required' })
  }
  if (players.length > 3) {
    return res.status(400).json({ error: 'Maximum 3 picks per night' })
  }

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
  const weekStart = getWeekStart(date)

  if (reuseMode === 'weekly') {
    const { data: used } = await supabase
      .from('three_point_usage')
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
  }

  await supabase
    .from('three_point_picks')
    .delete()
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('game_date', date)

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

  const { error: pickErr } = await supabase.from('three_point_picks').insert(pickRows)
  if (pickErr) throw pickErr

  if (reuseMode === 'weekly') {
    const usageRows = players.map((p) => ({
      league_id,
      user_id: req.user.id,
      week_start: weekStart,
      espn_player_id: p.espn_player_id,
      player_name: p.player_name,
    }))
    const { error: usageErr } = await supabase
      .from('three_point_usage')
      .upsert(usageRows, { onConflict: 'league_id,user_id,week_start,espn_player_id' })
    if (usageErr) throw usageErr
  }

  res.json({ submitted: players.length })
})

router.get('/standings', async (req, res) => {
  const { league_id } = req.query
  if (!league_id) return res.status(400).json({ error: 'league_id required' })

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', league_id)

  if (!members?.length) return res.json({ standings: [] })

  const allMemberIds = members.map((m) => m.user_id)

  const { data: picks } = await supabase
    .from('three_point_picks')
    .select('user_id, player_name, team, headshot_url, made_threes, game_date')
    .eq('league_id', league_id)
    .order('game_date', { ascending: false })

  const today = new Date().toLocaleDateString('en-CA')
  const stateByTeam = await buildNbaGameStateByTeam(today)

  const userMap = {}
  for (const uid of allMemberIds) userMap[uid] = { totalThrees: 0, picks: [] }
  for (const p of (picks || [])) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { totalThrees: 0, picks: [] }
    userMap[p.user_id].totalThrees += p.made_threes || 0
    const isToday = p.game_date === today
    const g = isToday ? stateByTeam[(p.team || '').toUpperCase()] : null
    userMap[p.user_id].picks.push({
      player_name: p.player_name,
      team: p.team,
      headshot_url: p.headshot_url,
      made_threes: p.made_threes || 0,
      game_date: p.game_date,
      game_state: g?.state || null,
      game_period: g?.period || null,
      game_starts_at: g?.startsAt || null,
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
    .sort((a, b) => b.totalThrees - a.totalThrees)
    .map((s, i) => ({ ...s, rank: i + 1 }))

  res.json({ standings })
})

export default router
