import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { getMLBPlayerPool } from '../services/mlbDfsService.js'
import { fetchESPNScoreboard } from '../services/espnService.js'
import { leagueEndSportsDay } from '../utils/sportsDay.js'
import { logger } from '../utils/logger.js'

const router = Router()
router.use(requireAuth)

// Season strikeout totals — aggregated from our own mlb_dfs_player_stats
// table. ESPN's leaderboard endpoint was previously the source but it
// caps at the top 200 by raw count and excludes pitchers returning
// from injury / low-volume relievers, so Strider/Rodon/etc. showed 0
// despite real K totals. Our box-score scrape covers every pitcher
// who appeared in any game we tracked this season.
//
// Cached for 30 min — same TTL as the old ESPN feed. The aggregation
// is cheap (one query, group-by espn_player_id) so refreshing
// frequently is fine.
let kLeadersCache = null
let kLeadersCacheTime = 0
const K_CACHE_TTL = 30 * 60 * 1000

async function getSeasonStrikeoutLeaders() {
  if (kLeadersCache && Date.now() - kLeadersCacheTime < K_CACHE_TTL) return kLeadersCache
  try {
    const season = new Date().getFullYear()
    // Supabase caps select() at 1000 rows by default, but daily pitcher
    // rows × ~200 active pitchers × 30+ games can blow past that fast.
    // Page through to make sure we sum the full season.
    const { fetchAll } = await import('../utils/fetchAll.js')
    const rows = await fetchAll(
      supabase
        .from('mlb_dfs_player_stats')
        .select('espn_player_id, strikeouts')
        .eq('season', season)
        .eq('is_pitcher', true)
    )
    const kMap = {}
    for (const r of rows) {
      // Strip the -P suffix two-way players (Ohtani) carry — the
      // strikeouts contest matches pitchers by raw ESPN athlete id.
      const id = (r.espn_player_id || '').replace(/-P$/, '')
      if (!id) continue
      kMap[id] = (kMap[id] || 0) + (Number(r.strikeouts) || 0)
    }
    kLeadersCache = kMap
    kLeadersCacheTime = Date.now()
    logger.info({ count: Object.keys(kMap).length }, 'Refreshed season strikeout totals (from box scores)')
    return kMap
  } catch (err) {
    logger.error({ err }, 'Failed to aggregate season strikeouts from box scores')
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

function getWeekEnd(weekStart) {
  const d = new Date(weekStart + 'T12:00:00')
  d.setDate(d.getDate() + 6)
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

  // Strip the -P suffix that two-way players (Ohtani) carry — the
  // strikeout-leaders cache is keyed on real ESPN athlete IDs.
  const enriched = pitchers.map((p) => ({
    ...p,
    season_strikeouts: kMap[(p.espn_player_id || '').replace(/-P$/, '')] || 0,
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
      const eventDate = new Date(e.startsAt).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
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
    .from('strikeouts_picks')
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
    return res.status(400).json({ error: 'Maximum 3 picks per day' })
  }

  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .maybeSingle()

  if (!member) return res.status(403).json({ error: 'Not a member of this league' })

  // Reject picks past league end date — belt-and-suspenders against a stale
  // client. PT-anchored.
  const { data: leagueRow } = await supabase
    .from('leagues')
    .select('ends_at')
    .eq('id', league_id)
    .maybeSingle()
  const leagueEnd = leagueEndSportsDay(leagueRow?.ends_at)
  if (leagueEnd && date > leagueEnd) {
    return res.status(400).json({ error: 'This league has ended' })
  }

  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('pick_reuse')
    .eq('league_id', league_id)
    .maybeSingle()

  const reuseMode = settings?.pick_reuse || 'weekly'

  if (reuseMode === 'weekly') {
    // Check picks the user already made on OTHER days this week. Today
    // is excluded because we're about to replace it — a pitcher kept
    // across an edit must not be flagged as 'already used'.
    const weekStart = getWeekStart(date)
    const weekEnd = getWeekEnd(weekStart)
    const { data: priorPicks } = await supabase
      .from('strikeouts_picks')
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
  // wiping a row for a kept player briefly resets accumulated stats to 0.
  const { data: existingPicks } = await supabase
    .from('strikeouts_picks')
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
    await supabase.from('strikeouts_picks').delete().in('id', toDeleteIds)
  }
  if (toInsert.length) {
    const { error: pickErr } = await supabase.from('strikeouts_picks').insert(toInsert)
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
    .from('strikeouts_picks')
    .select('user_id, player_name, team, headshot_url, strikeouts, game_date, espn_player_id')
    .eq('league_id', league_id)
    .order('game_date', { ascending: false })

  // ET is the source of truth for US sports calendar dates — server runs in UTC
  // on Render so naive ambient-TZ would roll over at 8pm ET and miss today.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const stateByTeam = await buildMlbGameStateByTeam(today)

  const todayEspnIds = [...new Set((picks || []).filter((p) => p.game_date === today).map((p) => p.espn_player_id).filter(Boolean))]
  const salaryByEspnId = {}
  if (todayEspnIds.length) {
    const { data: salaryRows } = await supabase
      .from('mlb_dfs_salaries')
      .select('espn_player_id, injury_status, lineup_status')
      .eq('game_date', today)
      .in('espn_player_id', todayEspnIds)
    for (const r of salaryRows || []) salaryByEspnId[r.espn_player_id] = r
  }

  const now = Date.now()
  const userMap = {}
  for (const uid of allMemberIds) userMap[uid] = { totalStrikeouts: 0, picks: [] }
  for (const p of (picks || [])) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { totalStrikeouts: 0, picks: [] }
    userMap[p.user_id].totalStrikeouts += p.strikeouts || 0
    const isToday = p.game_date === today
    const g = isToday ? stateByTeam[(p.team || '').toUpperCase()] : null
    const isLive = !isToday || g?.state === 'in' || g?.state === 'post' ||
      (g?.startsAt && new Date(g.startsAt).getTime() <= now)
    const hideFromOpponent = !isLive && p.user_id !== req.user.id
    userMap[p.user_id].picks.push({
      player_name: hideFromOpponent ? null : p.player_name,
      team: hideFromOpponent ? null : p.team,
      headshot_url: hideFromOpponent ? null : p.headshot_url,
      strikeouts: p.strikeouts || 0,
      game_date: p.game_date,
      game_state: hideFromOpponent ? null : (g?.state || null),
      game_period: hideFromOpponent ? null : (g?.period || null),
      game_starts_at: hideFromOpponent ? null : (g?.startsAt || null),
      injury_status: hideFromOpponent ? null : (isToday ? (salaryByEspnId[p.espn_player_id]?.injury_status ?? null) : null),
      lineup_status: hideFromOpponent ? null : (isToday ? (salaryByEspnId[p.espn_player_id]?.lineup_status ?? null) : null),
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
    .sort((a, b) => b.totalStrikeouts - a.totalStrikeouts)
    .map((s, i) => ({ ...s, rank: i + 1 }))

  res.json({ standings })
})

export default router
