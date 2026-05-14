import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { getCurrentNflWeek, getLockedTeamSet, getCurrentWeekMatchups } from '../services/tdPassService.js'
import { logger } from '../utils/logger.js'

const router = Router()
router.use(requireAuth)

// Pass-catching positions eligible for the Receptions Contest. WR/TE/RB
// cover the universe of NFL pass catchers — FB included for league
// completeness but rarely surfaces. Sorting by season `rec` totals
// naturally puts elite receivers up top.
const RECEIVER_POSITIONS = ['WR', 'TE', 'RB', 'FB']

// Curated preseason ranking — last year's reception leaders, top rookies,
// and high-volume PPR backs. Used for the player pool order before any
// 2026 receptions stats have been recorded. Once anyone records a catch
// on the season, sorting flips to live totals desc.
const PRESEASON_RECEPTION_RANKING = [
  'CeeDee Lamb', "Ja'Marr Chase", 'Justin Jefferson', 'Amon-Ra St. Brown',
  'Puka Nacua', 'Tyreek Hill', 'A.J. Brown', 'Garrett Wilson',
  'Drake London', 'Brian Thomas Jr.', 'Davante Adams', 'Malik Nabers',
  'Nico Collins', 'DK Metcalf', 'DJ Moore', 'Tee Higgins',
  'Mike Evans', 'Stefon Diggs', 'Terry McLaurin', 'Cooper Kupp',
  'Jaylen Waddle', 'Chris Olave', 'DeVonta Smith', 'Jaxon Smith-Njigba',
  'George Pickens', 'Calvin Ridley', 'Marvin Harrison Jr.', 'Rome Odunze',
  'Brock Bowers', 'Travis Kelce', 'Trey McBride', 'Sam LaPorta',
  'Mark Andrews', 'David Njoku', 'T.J. Hockenson', 'Dalton Kincaid',
  'Kyle Pitts', 'Cole Kmet', 'Pat Freiermuth', 'Evan Engram',
  'Christian McCaffrey', 'Saquon Barkley', 'Bijan Robinson', 'Jahmyr Gibbs',
  "De'Von Achane", 'Alvin Kamara', 'Breece Hall', 'James Cook',
  'Kenneth Walker III', 'Austin Ekeler', 'Tony Pollard', 'Aaron Jones',
  'Rachaad White', 'Travis Etienne Jr.', 'D\'Andre Swift', 'Najee Harris',
]
const PRESEASON_RECEPTION_RANK = {}
PRESEASON_RECEPTION_RANKING.forEach((name, i) => { PRESEASON_RECEPTION_RANK[name] = i })

router.get('/players', async (req, res) => {
  const { season, week } = await getCurrentNflWeek()
  const lockedTeams = await getLockedTeamSet()

  const { data: receivers } = await supabase
    .from('nfl_players')
    .select('id, full_name, position, team, headshot_url, injury_status')
    .in('position', RECEIVER_POSITIONS)
    .not('team', 'is', null)

  const { data: recStats } = await supabase
    .from('nfl_player_stats')
    .select('player_id, rec')
    .eq('season', season)

  const recMap = {}
  for (const s of (recStats || [])) {
    recMap[s.player_id] = (recMap[s.player_id] || 0) + (Number(s.rec) || 0)
  }

  const matchupByTeam = await getCurrentWeekMatchups()

  const pool = (receivers || [])
    .filter((d) => !lockedTeams.has(d.team))
    .map((d) => {
      const m = matchupByTeam[d.team] || null
      return {
        sleeper_player_id: d.id,
        player_name: d.full_name,
        position: d.position,
        team: d.team,
        headshot_url: d.headshot_url,
        injury_status: d.injury_status,
        season_receptions: recMap[d.id] || 0,
        opponent: m?.opponent || null,
        home_away: m?.home_away || null,
        game_starts_at: m?.starts_at || null,
      }
    })

  const hasStats = pool.some((p) => p.season_receptions > 0)
  pool.sort((a, b) => {
    const aBye = a.opponent ? 0 : 1
    const bBye = b.opponent ? 0 : 1
    if (aBye !== bBye) return aBye - bBye
    if (hasStats) {
      return b.season_receptions - a.season_receptions || a.player_name.localeCompare(b.player_name)
    }
    const aRank = PRESEASON_RECEPTION_RANK[a.player_name] ?? 999
    const bRank = PRESEASON_RECEPTION_RANK[b.player_name] ?? 999
    if (aRank !== bRank) return aRank - bRank
    return a.player_name.localeCompare(b.player_name)
  })

  res.json({ season, week, players: pool })
})

router.get('/picks', async (req, res) => {
  const { league_id } = req.query
  if (!league_id) return res.status(400).json({ error: 'league_id required' })

  const { season, week } = await getCurrentNflWeek()

  const { data } = await supabase
    .from('receptions_picks')
    .select('*')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('season', season)
    .eq('week', week)

  res.json(data || [])
})

router.get('/used', async (req, res) => {
  const { league_id } = req.query
  if (!league_id) return res.status(400).json({ error: 'league_id required' })

  const { season, week } = await getCurrentNflWeek()

  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('pick_reuse')
    .eq('league_id', league_id)
    .maybeSingle()
  const reuseMode = settings?.pick_reuse || 'season'
  if (reuseMode === 'unlimited') return res.json([])
  const maxUses = reuseMode === 'season' ? 1 : (parseInt(reuseMode, 10) || 1)

  const { data: priorPicks } = await supabase
    .from('receptions_picks')
    .select('sleeper_player_id, player_name')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('season', season)
    .neq('week', week)

  const counts = {}
  const names = {}
  for (const p of priorPicks || []) {
    counts[p.sleeper_player_id] = (counts[p.sleeper_player_id] || 0) + 1
    names[p.sleeper_player_id] = p.player_name
  }
  const exhausted = Object.entries(counts)
    .filter(([_, c]) => c >= maxUses)
    .map(([id]) => ({ sleeper_player_id: id, player_name: names[id] }))
  res.json(exhausted)
})

router.post('/picks', async (req, res) => {
  const { league_id, players } = req.body
  if (!league_id || !players?.length) {
    return res.status(400).json({ error: 'league_id and players required' })
  }
  if (players.length > 3) {
    return res.status(400).json({ error: 'Maximum 3 picks per week' })
  }

  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .maybeSingle()

  if (!member) return res.status(403).json({ error: 'Not a member of this league' })

  const { season, week } = await getCurrentNflWeek()

  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('pick_reuse')
    .eq('league_id', league_id)
    .maybeSingle()

  const reuseMode = settings?.pick_reuse || 'season'
  const maxUses = reuseMode === 'unlimited'
    ? Infinity
    : reuseMode === 'season' ? 1 : (parseInt(reuseMode, 10) || 1)
  const lockedTeams = await getLockedTeamSet()

  for (const p of players) {
    if (lockedTeams.has(p.team)) {
      return res.status(400).json({ error: `${p.player_name}'s game has already started` })
    }
  }

  if (maxUses < Infinity) {
    const playerIds = players.map((p) => p.sleeper_player_id)
    const { data: priorPicks } = await supabase
      .from('receptions_picks')
      .select('sleeper_player_id, week, player_name')
      .eq('league_id', league_id)
      .eq('user_id', req.user.id)
      .eq('season', season)
      .neq('week', week)
      .in('sleeper_player_id', playerIds)

    const useCount = {}
    for (const p of priorPicks || []) {
      useCount[p.sleeper_player_id] = (useCount[p.sleeper_player_id] || 0) + 1
    }
    for (const p of players) {
      if ((useCount[p.sleeper_player_id] || 0) >= maxUses) {
        return res.status(400).json({
          error: maxUses === 1
            ? `You already picked ${p.player_name} earlier this season`
            : `You've already used ${p.player_name} ${maxUses} times this season`,
        })
      }
    }
  }

  const { data: existingPicks } = await supabase
    .from('receptions_picks')
    .select('id, sleeper_player_id')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('season', season)
    .eq('week', week)

  const newIds = new Set(players.map((p) => p.sleeper_player_id))
  const existingIds = new Set((existingPicks || []).map((p) => p.sleeper_player_id))
  const toDeleteIds = (existingPicks || [])
    .filter((p) => !newIds.has(p.sleeper_player_id))
    .map((p) => p.id)
  const toInsert = players
    .filter((p) => !existingIds.has(p.sleeper_player_id))
    .map((p) => ({
      league_id,
      user_id: req.user.id,
      season,
      week,
      sleeper_player_id: p.sleeper_player_id,
      player_name: p.player_name,
      position: p.position,
      team: p.team,
      headshot_url: p.headshot_url,
    }))

  if (toDeleteIds.length) {
    await supabase.from('receptions_picks').delete().in('id', toDeleteIds)
  }
  if (toInsert.length) {
    const { error: pickErr } = await supabase.from('receptions_picks').insert(toInsert)
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
    .from('receptions_picks')
    .select('user_id, week, player_name, position, team, headshot_url, receptions')
    .eq('league_id', league_id)
    .order('week', { ascending: false })

  const { week: currentWeek } = await getCurrentNflWeek()
  const lockedTeams = await getLockedTeamSet()

  const userMap = {}
  for (const uid of allMemberIds) userMap[uid] = { totalReceptions: 0, picks: [] }
  for (const p of (picks || [])) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { totalReceptions: 0, picks: [] }
    userMap[p.user_id].totalReceptions += Number(p.receptions) || 0
    const isPastWeek = p.week < currentWeek
    const isLive = isPastWeek || lockedTeams.has(p.team)
    const hideFromOpponent = !isLive && p.user_id !== req.user.id
    userMap[p.user_id].picks.push({
      week: p.week,
      player_name: hideFromOpponent ? null : p.player_name,
      position: hideFromOpponent ? null : p.position,
      team: hideFromOpponent ? null : p.team,
      headshot_url: hideFromOpponent ? null : p.headshot_url,
      receptions: Number(p.receptions) || 0,
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
    .sort((a, b) => b.totalReceptions - a.totalReceptions)
    .map((s, i) => ({ ...s, rank: i + 1 }))

  res.json({ standings })
})

export default router
