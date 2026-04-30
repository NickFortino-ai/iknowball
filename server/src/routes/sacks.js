import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { getCurrentNflWeek, getLockedTeamSet, getCurrentWeekMatchups } from '../services/tdPassService.js'
import { logger } from '../utils/logger.js'

const router = Router()
router.use(requireAuth)

// Defensive positions eligible for the Sacks Contest. Anyone who could
// realistically record a sack — front seven heaviest, but DBs occasionally
// blitz so we include them too. Sorting by season idp_sack naturally pushes
// non-rushers to the bottom.
const DEFENSIVE_POSITIONS = [
  'DE', 'DT', 'NT', 'DL', 'LB', 'ILB', 'OLB', 'MLB', 'CB', 'S', 'FS', 'SS', 'DB',
]

// Curated preseason ranking (last year's sack leaders + high-profile IDP
// rookies). Used for the player pool order before any 2026 idp_sack stats
// have been recorded. Once even one defender has a sack on the season,
// sorting flips to live season totals desc.
const PRESEASON_SACK_RANKING = [
  'Myles Garrett', 'Brian Burns', 'Danielle Hunter', 'Aidan Hutchinson',
  'Rueben Bain Jr.', 'Nik Bonitto', 'Tuli Tuipulotu', 'Arvell Reese',
  'Micah Parsons', 'Josh Sweat', 'David Bailey', 'Will Anderson Jr.',
  'Byron Young', 'Akheem Mesidor', 'Al-Quadin Muhammad', 'Jeffery Simmons',
  'Peter Woods', 'Cameron Jordan', 'James Pearce Jr.', 'Lee Hunter',
  'Montez Sweat', 'Maxx Crosby', 'Kayden McDonald', 'Chase Young',
  'Alex Highsmith', 'Sonny Styles', 'Von Miller', 'Jadeveon Clowney',
  'Bradley Chubb', 'Harold Landry III', 'Laiatu Latu', 'Brandon Dorlus',
  'Josh Hines-Allen', 'Jonathon Cooper', 'Will McDonald IV', 'Dallas Turner',
  'John Franklin-Myers', 'Rashan Gary', "K'Lavon Chaisson", 'Odafe Oweh',
  'Nick Herbig', 'Jared Verse', 'Leonard Williams', 'Chris Jones',
  'T.J. Watt', 'Uchenna Nwosu', 'Andrew Van Ginkel', 'Zach Allen',
  "Dre'Mont Jones", 'Kobie Turner', 'Greg Rousseau', 'Byron Murphy II',
  'Yaya Diaby', 'Calais Campbell', 'Maliek Collins', 'Eric Wilson',
]
const PRESEASON_SACK_RANK = {}
PRESEASON_SACK_RANKING.forEach((name, i) => { PRESEASON_SACK_RANK[name] = i })

// Available defenders for the current NFL week. Sorted by season idp_sack
// desc; locked teams are excluded.
router.get('/players', async (req, res) => {
  const { season, week } = await getCurrentNflWeek()
  const lockedTeams = await getLockedTeamSet()

  const { data: defenders } = await supabase
    .from('nfl_players')
    .select('id, full_name, position, team, headshot_url, injury_status')
    .in('position', DEFENSIVE_POSITIONS)
    .not('team', 'is', null)

  // Aggregate season idp_sack from nfl_player_stats
  const { data: sackStats } = await supabase
    .from('nfl_player_stats')
    .select('player_id, idp_sack')
    .eq('season', season)

  const sackMap = {}
  for (const s of (sackStats || [])) {
    sackMap[s.player_id] = (sackMap[s.player_id] || 0) + (Number(s.idp_sack) || 0)
  }

  const matchupByTeam = await getCurrentWeekMatchups()

  const pool = (defenders || [])
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
        season_sacks: sackMap[d.id] || 0,
        opponent: m?.opponent || null,
        home_away: m?.home_away || null,
        game_starts_at: m?.starts_at || null,
      }
    })

  // Once any defender has a sack on the season, sort live; otherwise use
  // the curated preseason ranking. Bye-week defenders sink to the bottom
  // either way.
  const hasStats = pool.some((p) => p.season_sacks > 0)
  pool.sort((a, b) => {
    const aBye = a.opponent ? 0 : 1
    const bBye = b.opponent ? 0 : 1
    if (aBye !== bBye) return aBye - bBye
    if (hasStats) {
      return b.season_sacks - a.season_sacks || a.player_name.localeCompare(b.player_name)
    }
    const aRank = PRESEASON_SACK_RANK[a.player_name] ?? 999
    const bRank = PRESEASON_SACK_RANK[b.player_name] ?? 999
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
    .from('sacks_picks')
    .select('*')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('season', season)
    .eq('week', week)

  res.json(data || [])
})

// Players the user has already picked this season (for "season" reuse rule).
router.get('/used', async (req, res) => {
  const { league_id } = req.query
  if (!league_id) return res.status(400).json({ error: 'league_id required' })

  const { season } = await getCurrentNflWeek()

  const { data } = await supabase
    .from('sacks_picks')
    .select('sleeper_player_id, player_name, week')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('season', season)

  res.json(data || [])
})

// Submit picks (up to 3 per week). Replaces any existing picks for the
// current week. pick_reuse=season blocks defenders already used in any
// prior week of this season; pick_reuse=unlimited skips the check.
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

  // Reuse rule: 'unlimited' → no cap. Anything else parses to a max-uses
  // count per defender per season ('season' is the legacy alias for 1;
  // '1'/'2'/'3'/'4' are the commissioner-tunable values).
  const reuseMode = settings?.pick_reuse || 'season'
  const maxUses = reuseMode === 'unlimited'
    ? Infinity
    : reuseMode === 'season' ? 1 : (parseInt(reuseMode, 10) || 1)
  const lockedTeams = await getLockedTeamSet()

  // Lock check — can't pick a defender whose team has already started
  for (const p of players) {
    if (lockedTeams.has(p.team)) {
      return res.status(400).json({ error: `${p.player_name}'s game has already started` })
    }
  }

  if (maxUses < Infinity) {
    const playerIds = players.map((p) => p.sleeper_player_id)
    const { data: priorPicks } = await supabase
      .from('sacks_picks')
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

  // Replace any prior picks for the current week (allowed until lock)
  await supabase
    .from('sacks_picks')
    .delete()
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .eq('season', season)
    .eq('week', week)

  const pickRows = players.map((p) => ({
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

  const { error: pickErr } = await supabase.from('sacks_picks').insert(pickRows)
  if (pickErr) throw pickErr

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
    .from('sacks_picks')
    .select('user_id, week, player_name, position, team, headshot_url, sacks')
    .eq('league_id', league_id)
    .order('week', { ascending: false })

  const userMap = {}
  for (const uid of allMemberIds) userMap[uid] = { totalSacks: 0, picks: [] }
  for (const p of (picks || [])) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { totalSacks: 0, picks: [] }
    userMap[p.user_id].totalSacks += Number(p.sacks) || 0
    userMap[p.user_id].picks.push({
      week: p.week,
      player_name: p.player_name,
      position: p.position,
      team: p.team,
      headshot_url: p.headshot_url,
      sacks: Number(p.sacks) || 0,
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
    .sort((a, b) => b.totalSacks - a.totalSacks)
    .map((s, i) => ({ ...s, rank: i + 1 }))

  res.json({ standings })
})

export default router
