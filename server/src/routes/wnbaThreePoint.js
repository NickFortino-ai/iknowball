import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { getWNBAPlayerPool, buildWnbaGameStateByTeam } from '../services/wnbaThreePointService.js'
import { logger } from '../utils/logger.js'

const router = Router()
router.use(requireAuth)

// Mon-Sun week boundaries mirror the NBA 3-Point Contest behavior so the
// reuse-once-per-week rule lines up with the same calendar grid users see
// on the NBA side.
function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return d.toLocaleDateString('en-CA')
}

function getWeekEnd(weekStart) {
  const d = new Date(weekStart + 'T12:00:00')
  d.setDate(d.getDate() + 6)
  return d.toLocaleDateString('en-CA')
}

router.get('/players', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date required' })
  const pool = await getWNBAPlayerPool(date)
  res.json(pool)
})

router.get('/picks', async (req, res) => {
  const { league_id, date } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })

  const { data } = await supabase
    .from('wnba_three_point_picks')
    .select('*')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('game_date', date)

  const picks = data || []
  const stateByTeam = await buildWnbaGameStateByTeam(date)
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
    .from('wnba_three_point_picks')
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

  if (reuseMode === 'weekly') {
    const weekStart = getWeekStart(date)
    const weekEnd = getWeekEnd(weekStart)
    const { data: priorPicks } = await supabase
      .from('wnba_three_point_picks')
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

  // Diff existing against new instead of delete-all-reinsert so a kept
  // player's accumulated made_threes doesn't flash to 0 mid-game.
  const { data: existingPicks } = await supabase
    .from('wnba_three_point_picks')
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
    await supabase.from('wnba_three_point_picks').delete().in('id', toDeleteIds)
  }
  if (toInsert.length) {
    const { error: pickErr } = await supabase.from('wnba_three_point_picks').insert(toInsert)
    if (pickErr) throw pickErr
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
    .from('wnba_three_point_picks')
    .select('user_id, player_name, team, headshot_url, made_threes, game_date, espn_player_id')
    .eq('league_id', league_id)
    .order('game_date', { ascending: false })

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const stateByTeam = await buildWnbaGameStateByTeam(today)

  const now = Date.now()
  const userMap = {}
  for (const uid of allMemberIds) userMap[uid] = { totalThrees: 0, picks: [] }
  for (const p of (picks || [])) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { totalThrees: 0, picks: [] }
    userMap[p.user_id].totalThrees += p.made_threes || 0
    const isToday = p.game_date === today
    const g = isToday ? stateByTeam[(p.team || '').toUpperCase()] : null
    const isLive = !isToday || g?.state === 'in' || g?.state === 'post' ||
      (g?.startsAt && new Date(g.startsAt).getTime() <= now)
    const hideFromOpponent = !isLive && p.user_id !== req.user.id
    userMap[p.user_id].picks.push({
      player_name: hideFromOpponent ? null : p.player_name,
      team: hideFromOpponent ? null : p.team,
      headshot_url: hideFromOpponent ? null : p.headshot_url,
      made_threes: p.made_threes || 0,
      game_date: p.game_date,
      game_state: hideFromOpponent ? null : (g?.state || null),
      game_period: hideFromOpponent ? null : (g?.period || null),
      game_starts_at: hideFromOpponent ? null : (g?.startsAt || null),
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
    .sort((a, b) => b.totalThrees - a.totalThrees)
    .map((s, i) => ({ ...s, rank: i + 1 }))

  res.json({ standings })
})

export default router
