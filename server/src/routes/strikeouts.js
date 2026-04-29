import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { getMLBPlayerPool } from '../services/mlbDfsService.js'
import { fetchESPNScoreboard } from '../services/espnService.js'
import { logger } from '../utils/logger.js'

const router = Router()
router.use(requireAuth)

// Cache ESPN season strikeout leaders (refreshed every 30 min). ESPN's
// pitching leaderboard for type=2 (regular season) is keyed by abbrev "SO".
let kLeadersCache = null
let kLeadersCacheTime = 0
const K_CACHE_TTL = 30 * 60 * 1000

async function getSeasonStrikeoutLeaders() {
  if (kLeadersCache && Date.now() - kLeadersCacheTime < K_CACHE_TTL) return kLeadersCache
  try {
    const res = await fetch('https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/2026/types/2/leaders?limit=200')
    if (!res.ok) throw new Error(`ESPN returned ${res.status}`)
    const data = await res.json()
    const kMap = {}
    for (const cat of data.categories || []) {
      const abbr = cat.abbreviation || cat.name || ''
      // ESPN exposes pitcher Ks as "SO" or "K" depending on the season feed
      if (abbr === 'SO' || abbr === 'K' || abbr === 'strikeOuts') {
        for (const leader of cat.leaders || []) {
          const ref = leader.athlete?.$ref || ''
          const match = ref.match(/\/athletes\/(\d+)/)
          if (match) kMap[match[1]] = Math.round(leader.value)
        }
        break
      }
    }
    kLeadersCache = kMap
    kLeadersCacheTime = Date.now()
    logger.info({ count: Object.keys(kMap).length }, 'Refreshed ESPN strikeout leaders cache')
    return kMap
  } catch (err) {
    logger.error({ err }, 'Failed to fetch ESPN strikeout leaders')
    return kLeadersCache || {}
  }
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return d.toLocaleDateString('en-CA')
}

// Available pitchers for the day, sorted by season strikeouts desc.
router.get('/players', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date required' })
  const pool = await getMLBPlayerPool(date)

  // Pitchers only — strikeouts are a pitching stat
  const pitchers = pool.filter((p) => p.is_pitcher)

  const kMap = await getSeasonStrikeoutLeaders()

  const enriched = pitchers.map((p) => ({
    ...p,
    season_strikeouts: kMap[p.espn_player_id] || 0,
  }))
  enriched.sort((a, b) => b.season_strikeouts - a.season_strikeouts || b.salary - a.salary)

  res.json(enriched)
})

async function buildMlbGameStateByTeam(date) {
  try {
    const events = await fetchESPNScoreboard('baseball_mlb')
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
    logger.error({ err }, 'Failed to fetch MLB scoreboard for strikeouts picks')
    return {}
  }
}

router.get('/picks', async (req, res) => {
  const { league_id, date } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })

  const { data } = await supabase
    .from('strikeouts_picks')
    .select('*')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('game_date', date)

  const picks = data || []
  const stateByTeam = await buildMlbGameStateByTeam(date)
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
    .from('strikeouts_usage')
    .select('espn_player_id, player_name')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('week_start', weekStart)

  res.json(data || [])
})

router.post('/picks', async (req, res) => {
  const { league_id, date, players } = req.body
  if (!league_id || !date || !players?.length) {
    return res.status(400).json({ error: 'league_id, date, and players required' })
  }
  if (players.length > 3) {
    return res.status(400).json({ error: 'Maximum 3 picks per day' })
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
      .from('strikeouts_usage')
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
    .from('strikeouts_picks')
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

  const { error: pickErr } = await supabase.from('strikeouts_picks').insert(pickRows)
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
      .from('strikeouts_usage')
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
    .from('strikeouts_picks')
    .select('user_id, player_name, team, headshot_url, strikeouts, game_date')
    .eq('league_id', league_id)
    .order('game_date', { ascending: false })

  const today = new Date().toLocaleDateString('en-CA')
  const stateByTeam = await buildMlbGameStateByTeam(today)

  const userMap = {}
  for (const uid of allMemberIds) userMap[uid] = { totalStrikeouts: 0, picks: [] }
  for (const p of (picks || [])) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { totalStrikeouts: 0, picks: [] }
    userMap[p.user_id].totalStrikeouts += p.strikeouts || 0
    const isToday = p.game_date === today
    const g = isToday ? stateByTeam[(p.team || '').toUpperCase()] : null
    userMap[p.user_id].picks.push({
      player_name: p.player_name,
      team: p.team,
      headshot_url: p.headshot_url,
      strikeouts: p.strikeouts || 0,
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
    .sort((a, b) => b.totalStrikeouts - a.totalStrikeouts)
    .map((s, i) => ({ ...s, rank: i + 1 }))

  res.json({ standings })
})

export default router
