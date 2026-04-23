import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { supabase } from '../config/supabase.js'
import {
  createLeague,
  joinLeague,
  getMyLeagues,
  getLeagueDetails,
  updateLeague,
  deleteLeague,
  getLeagueMembers,
  getLeagueStandings,
  getLeagueWeeks,
  leaveLeague,
  removeMember,
  selectPickemGames,
} from '../services/leagueService.js'
import {
  sendInvitation,
  getLeagueInvitations,
} from '../services/invitationService.js'
import { sendLeagueInviteEmail } from '../services/emailService.js'
import {
  submitSurvivorPick,
  submitTouchdownPick,
  deleteSurvivorPick,
  getSurvivorBoard,
  getUsedTeams,
  settleSurvivorLeague,
} from '../services/survivorService.js'
import {
  submitLeaguePick,
  deleteLeaguePick,
  getLeaguePicks,
  getLeagueGames,
} from '../services/leaguePickService.js'
import {
  getBoard,
  claimSquare,
  unclaimSquare,
  randomAssignSquares,
  lockDigits,
  scoreQuarter,
  updateBoardSettings,
} from '../services/squaresService.js'
import {
  getTournament,
  getBracketEntry,
  getEntryByUser,
  getAllEntries,
  submitBracket,
  getTemplates,
  getUserEntriesForTemplate,
  updateBracketTournament,
} from '../services/bracketService.js'

const router = Router()

// ============================================
// Public (unauthenticated) routes
// ============================================

router.get('/preview/:code', async (req, res) => {
  const code = req.params.code.toUpperCase()
  const { data: league, error } = await supabase
    .from('leagues')
    .select('id, name, format, sport, status, max_members, backdrop_image, backdrop_y, commissioner_id, users!leagues_commissioner_id_fkey(username, display_name)')
    .eq('invite_code', code)
    .single()

  if (error || !league) {
    return res.status(404).json({ error: 'Invalid invite code' })
  }

  const { count } = await supabase
    .from('league_members')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', league.id)

  const { id: _, ...preview } = league
  res.json({ ...preview, member_count: count || 0 })
})

// ============================================
// League CRUD
// ============================================

const createLeagueSchema = z.object({
  name: z.string().min(1).max(50),
  format: z.enum(['pickem', 'survivor', 'squares', 'bracket', 'fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby']),
  sport: z.enum(['americanfootball_nfl', 'basketball_nba', 'baseball_mlb', 'basketball_ncaab', 'americanfootball_ncaaf', 'basketball_wnba', 'basketball_wncaab', 'icehockey_nhl', 'soccer_usa_mls', 'all']),
  duration: z.enum(['this_week', 'custom_range', 'full_season', 'playoffs_only']).optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  max_members: z.number().int().min(2).optional(),
  visibility: z.enum(['open', 'closed']).optional(),
  joins_locked_at: z.string().optional(),
  backdrop_image: z.string().optional(),
  settings: z.object({
    games_per_week: z.number().int().min(1).optional(),
    lives: z.number().int().min(1).max(2).optional(),
    all_eliminated_survive: z.boolean().optional(),
    pick_frequency: z.enum(['daily', 'weekly']).optional(),
    lock_odds_at: z.enum(['game_start', 'submission']).optional(),
    winner_bonus: z.number().int().min(0).optional(),
    runner_up_bonus: z.number().int().min(0).optional(),
    game_id: z.string().uuid().optional(),
    assignment_method: z.enum(['self_select', 'random']).optional(),
    points_per_quarter: z.array(z.number().int().min(0)).length(4).optional(),
    row_team_name: z.string().min(1).max(50).optional(),
    col_team_name: z.string().min(1).max(50).optional(),
    template_id: z.string().uuid().optional(),
    locks_at: z.string().optional(),
  }).optional(),
  fantasy_settings: z.object({
    format: z.enum(['traditional', 'salary_cap', 'hr_derby']).optional(),
    scoring_format: z.enum(['ppr', 'half_ppr', 'standard']).optional(),
    num_teams: z.number().int().min(2).max(20).optional(),
    draft_pick_timer: z.number().int().optional(),
    waiver_type: z.enum(['priority', 'rolling', 'faab']).optional(),
    faab_starting_budget: z.number().int().min(1).max(10000).optional(),
    trade_review: z.enum(['commissioner', 'league_vote', 'none']).optional(),
    salary_cap: z.number().int().min(10000).max(200000).optional(),
    season_type: z.enum(['full_season', 'single_week']).optional(),
    champion_metric: z.enum(['total_points', 'most_wins']).optional(),
    single_week: z.number().int().min(1).max(18).optional(),
    playoff_teams: z.number().int().optional(),
  }).optional(),
})

router.post('/', requireAuth, validate(createLeagueSchema), async (req, res) => {
  const league = await createLeague(req.user.id, req.validated)
  res.status(201).json(league)
})

router.get('/', requireAuth, async (req, res) => {
  const leagues = await getMyLeagues(req.user.id, req.query.tz)
  res.json(leagues)
})

// Reorder leagues
const reorderSchema = z.object({
  order: z.array(z.string().uuid()),
})

router.patch('/reorder', requireAuth, validate(reorderSchema), async (req, res) => {
  const { order } = req.validated
  const userId = req.user.id

  for (let i = 0; i < order.length; i++) {
    await supabase
      .from('league_members')
      .update({ display_order: i })
      .eq('league_id', order[i])
      .eq('user_id', userId)
  }

  res.json({ ok: true })
})

// Trophy case: user's league wins
router.get('/my-wins', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('bonus_points')
    .select('id, league_id, type, label, points, created_at, leagues(name, format, sport)')
    .eq('user_id', req.user.id)
    .in('type', ['league_win', 'survivor_win'])
    .order('created_at', { ascending: false })

  if (error) throw error
  if (!data?.length) return res.json([])

  const leagueIds = [...new Set(data.filter(w => w.league_id).map(w => w.league_id))]
  const { data: members } = await supabase
    .from('league_members')
    .select('league_id')
    .in('league_id', leagueIds)

  const countMap = {}
  for (const m of members || []) {
    countMap[m.league_id] = (countMap[m.league_id] || 0) + 1
  }

  res.json(data.map(w => ({
    ...w,
    league_name: w.leagues?.name || 'Deleted League',
    league_format: w.leagues?.format || null,
    league_sport: w.leagues?.sport || null,
    member_count: countMap[w.league_id] || 0,
  })))
})

// Public bracket templates (for commissioners creating leagues)
router.get('/bracket-templates/active', requireAuth, async (req, res) => {
  const templates = await getTemplates({ sport: req.query.sport })
  res.json(templates)
})

// Open leagues the user can join
router.get('/open', requireAuth, async (req, res) => {
  const now = new Date().toISOString()

  // Get leagues that are open visibility, haven't started yet, not completed,
  // not past their join lock, and not past their end date
  const { data: leagues, error } = await supabase
    .from('leagues')
    .select('id, name, format, sport, status, max_members, commissioner_id, starts_at, ends_at, joins_locked_at, duration, settings, backdrop_image, backdrop_y, created_at, users!leagues_commissioner_id_fkey(display_name, username)')
    .eq('visibility', 'open')
    .eq('status', 'open')
    .or(`joins_locked_at.is.null,joins_locked_at.gt.${now}`)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error

  // Get member counts and check which ones the user is already in.
  // Paginate to bypass Supabase 1000-row default limit — with up to 50 leagues
  // this can easily exceed 1000 rows and silently truncate, breaking the
  // "already joined" filter and member_count.
  const leagueIds = (leagues || []).map((l) => l.id)

  async function fetchAllMembers(ids) {
    const PAGE = 1000
    let all = []
    let offset = 0
    while (true) {
      const { data, error: memErr } = await supabase
        .from('league_members')
        .select('league_id, user_id')
        .in('league_id', ids)
        .range(offset, offset + PAGE - 1)
      if (memErr) throw memErr
      all = all.concat(data || [])
      if (!data || data.length < PAGE) break
      offset += PAGE
    }
    return all
  }
  const members = leagueIds.length ? await fetchAllMembers(leagueIds) : []

  const countMap = {}
  const userLeagues = new Set()
  for (const m of members) {
    countMap[m.league_id] = (countMap[m.league_id] || 0) + 1
    if (m.user_id === req.user.id) userLeagues.add(m.league_id)
  }

  // Pull fantasy_settings.draft_date for any fantasy leagues in this batch
  // so the open league cards can show a live "Draft starts in N days"
  // countdown.
  const fantasyLeagueIds = (leagues || [])
    .filter((l) => l.format === 'fantasy')
    .map((l) => l.id)
  const draftDateByLeague = {}
  const draftStatusByLeague = {}
  if (fantasyLeagueIds.length) {
    const { data: fs } = await supabase
      .from('fantasy_settings')
      .select('league_id, draft_date, draft_status')
      .in('league_id', fantasyLeagueIds)
    for (const row of fs || []) {
      draftDateByLeague[row.league_id] = row.draft_date
      draftStatusByLeague[row.league_id] = row.draft_status
    }
  }

  const result = (leagues || [])
    .filter((l) => !userLeagues.has(l.id)) // exclude leagues user already joined
    .filter((l) => !l.max_members || (countMap[l.id] || 0) < l.max_members) // exclude full leagues
    .map((l) => ({
      id: l.id,
      name: l.name,
      format: l.format,
      sport: l.sport,
      status: l.status,
      member_count: countMap[l.id] || 0,
      max_members: l.max_members,
      commissioner: l.users?.display_name || l.users?.username || 'Unknown',
      starts_at: l.starts_at,
      ends_at: l.ends_at,
      duration: l.duration,
      settings: l.settings || {},
      joins_locked_at: l.joins_locked_at,
      backdrop_image: l.backdrop_image,
      backdrop_y: l.backdrop_y ?? 50,
      draft_date: draftDateByLeague[l.id] || null,
      draft_status: draftStatusByLeague[l.id] || null,
    }))

  res.json(result)
})

// Available backdrop images for league creation
router.get('/backdrops', requireAuth, async (req, res) => {
  const { sport } = req.query
  const { data: backdrops } = await supabase
    .from('league_backdrops')
    .select('filename, label, formats, sort_order')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('label')

  if (!backdrops?.length) return res.json([])

  // Exclusive filters: only show backdrops specifically tagged with this format
  const exclusiveFilters = ['touchdown_survivor', 'td_pass_competition']
  const isExclusive = exclusiveFilters.includes(sport)

  const filtered = sport
    ? backdrops.filter((b) => {
        if (b.formats.includes(sport)) return true
        if (!isExclusive && (!b.formats?.length)) return true
        return false
      })
    : backdrops

  res.json(filtered)
})

router.get('/:id', requireAuth, async (req, res) => {
  const league = await getLeagueDetails(req.params.id, req.user.id)
  res.json(league)
})

const updateLeagueSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  max_members: z.number().int().min(2).nullable().optional(),
  settings: z.record(z.any()).optional(),
  duration: z.enum(['this_week', 'custom_range', 'full_season', 'playoffs_only']).optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  commissioner_note: z.string().max(1000).nullable().optional(),
  visibility: z.enum(['open', 'closed']).optional(),
  joins_locked_at: z.string().nullable().optional(),
  backdrop_image: z.string().nullable().optional(),
  backdrop_y: z.number().min(0).max(100).nullable().optional(),
})

router.patch('/:id', requireAuth, validate(updateLeagueSchema), async (req, res) => {
  const league = await updateLeague(req.params.id, req.user.id, req.validated)
  res.json(league)
})

router.delete('/:id', requireAuth, async (req, res) => {
  await deleteLeague(req.params.id, req.user.id)
  res.status(204).end()
})

router.patch('/:id/auto-connect', requireAuth, async (req, res) => {
  const { auto_connect } = req.body
  if (typeof auto_connect !== 'boolean') {
    return res.status(400).json({ error: 'auto_connect must be a boolean' })
  }

  const { error } = await supabase
    .from('league_members')
    .update({ auto_connect })
    .eq('league_id', req.params.id)
    .eq('user_id', req.user.id)

  if (error) return res.status(500).json({ error: 'Failed to update preference' })
  res.json({ auto_connect })
})

router.post('/:id/complete', requireAuth, async (req, res) => {
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id, status')
    .eq('id', req.params.id)
    .single()

  if (!league) {
    return res.status(404).json({ error: 'League not found' })
  }
  if (league.commissioner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the commissioner can complete a league' })
  }
  if (league.status === 'completed') {
    return res.status(400).json({ error: 'League is already completed' })
  }

  const { data, error } = await supabase
    .from('leagues')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) throw error
  res.json(data)
})

// ============================================
// Membership
// ============================================

const joinLeagueSchema = z.object({
  invite_code: z.string().min(1),
})

router.post('/:id/join', requireAuth, validate(joinLeagueSchema), async (req, res) => {
  const league = await joinLeague(req.user.id, req.validated.invite_code)
  res.json(league)
})

// Join an open league by ID (no invite code needed)
router.post('/:id/join-open', requireAuth, async (req, res) => {
  const { data: league } = await supabase
    .from('leagues')
    .select('invite_code, visibility, joins_locked_at, status')
    .eq('id', req.params.id)
    .single()

  if (!league) return res.status(404).json({ error: 'League not found' })
  if (league.visibility !== 'open') return res.status(403).json({ error: 'This league is not open for public joining' })
  if (league.joins_locked_at && new Date(league.joins_locked_at) < new Date()) {
    return res.status(400).json({ error: 'This league is no longer accepting new members' })
  }

  const result = await joinLeague(req.user.id, league.invite_code)
  res.json(result)
})

router.get('/:id/members', requireAuth, async (req, res) => {
  const members = await getLeagueMembers(req.params.id, req.user.id)
  res.json(members)
})

router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  if (req.params.userId === req.user.id) {
    await leaveLeague(req.params.id, req.user.id)
  } else {
    await removeMember(req.params.id, req.user.id, req.params.userId)
  }
  res.status(204).end()
})

// ============================================
// Invitations
// ============================================

const sendInviteSchema = z.object({
  username: z.string().min(1),
})

router.post('/:id/invitations', requireAuth, validate(sendInviteSchema), async (req, res) => {
  const invitation = await sendInvitation(req.params.id, req.user.id, req.validated.username)
  res.status(201).json(invitation)
})

router.get('/:id/invitations', requireAuth, async (req, res) => {
  const invitations = await getLeagueInvitations(req.params.id, req.user.id)
  res.json(invitations)
})

const emailInviteSchema = z.object({
  email: z.string().email(),
})

router.post('/:id/invitations/email', requireAuth, validate(emailInviteSchema), async (req, res) => {
  const { data: league, error: leagueError } = await supabase
    .from('leagues')
    .select('commissioner_id, name, invite_code, status')
    .eq('id', req.params.id)
    .single()

  if (leagueError || !league) {
    return res.status(404).json({ error: 'League not found' })
  }
  if (league.commissioner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the commissioner can send invitations' })
  }
  if (league.status === 'completed') {
    return res.status(400).json({ error: 'This league is no longer accepting members' })
  }

  await sendLeagueInviteEmail(req.validated.email, league.name, league.invite_code)
  res.json({ message: 'Invitation email sent' })
})

// ============================================
// Standings & Weeks
// ============================================

router.get('/:id/standings', requireAuth, async (req, res) => {
  const standings = await getLeagueStandings(req.params.id, req.user.id)
  res.json(standings)
})

router.get('/:id/weeks', requireAuth, async (req, res) => {
  const weeks = await getLeagueWeeks(req.params.id, req.user.id)
  res.json(weeks)
})

// ============================================
// Pick'em selections
// ============================================

const selectGamesSchema = z.object({
  week_id: z.string().uuid(),
  game_ids: z.array(z.string().uuid()).min(1),
})

router.post('/:id/pickem/selections', requireAuth, validate(selectGamesSchema), async (req, res) => {
  const selections = await selectPickemGames(
    req.params.id,
    req.user.id,
    req.validated.week_id,
    req.validated.game_ids
  )
  res.json(selections)
})

router.get('/:id/pickem/selections', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('pickem_selections')
    .select('*')
    .eq('league_id', req.params.id)
    .eq('user_id', req.user.id)

  if (error) throw error
  res.json(data)
})

// ============================================
// League Picks (new pick'em system)
// ============================================

const leaguePickSchema = z.object({
  week_id: z.string().uuid(),
  game_id: z.string().uuid(),
  picked_team: z.enum(['home', 'away']),
})

router.post('/:id/pickem/picks', requireAuth, validate(leaguePickSchema), async (req, res) => {
  const result = await submitLeaguePick(
    req.params.id,
    req.user.id,
    req.validated.week_id,
    req.validated.game_id,
    req.validated.picked_team
  )
  res.status(201).json(result)
})

router.delete('/:id/pickem/picks/:gameId', requireAuth, async (req, res) => {
  await deleteLeaguePick(req.params.id, req.user.id, req.params.gameId)
  res.status(204).end()
})

router.get('/:id/pickem/picks', requireAuth, async (req, res) => {
  const picks = await getLeaguePicks(req.params.id, req.user.id, req.query.week_id)
  res.json(picks)
})

router.get('/:id/pickem/member-picks/:userId', requireAuth, async (req, res) => {
  // Verify requester is a member
  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', req.params.id)
    .eq('user_id', req.user.id)
    .single()

  if (!member) return res.status(403).json({ error: 'Not a member of this league' })

  const picks = await getLeaguePicks(req.params.id, req.params.userId)
  // Only return settled picks
  res.json((picks || []).filter(p => p.status === 'settled'))
})

router.get('/:id/pickem/games', requireAuth, async (req, res) => {
  if (!req.query.week_id) {
    return res.status(400).json({ error: 'week_id query parameter is required' })
  }
  const games = await getLeagueGames(req.params.id, req.query.week_id)
  res.json(games)
})

// ============================================
// Survivor
// ============================================

const survivorPickSchema = z.object({
  week_id: z.string().uuid(),
  game_id: z.string().uuid(),
  picked_team: z.enum(['home', 'away']),
})

router.post('/:id/survivor/picks', requireAuth, validate(survivorPickSchema), async (req, res) => {
  const pick = await submitSurvivorPick(
    req.params.id,
    req.user.id,
    req.validated.week_id,
    req.validated.game_id,
    req.validated.picked_team
  )
  res.status(201).json(pick)
})

router.delete('/:id/survivor/picks/:weekId', requireAuth, async (req, res) => {
  await deleteSurvivorPick(req.params.id, req.user.id, req.params.weekId)
  res.status(204).end()
})

// Touchdown survivor — pick a player
const touchdownPickSchema = z.object({
  week_id: z.string().uuid(),
  player_id: z.string(),
})

router.post('/:id/survivor/touchdown-pick', requireAuth, validate(touchdownPickSchema), async (req, res) => {
  const pick = await submitTouchdownPick(
    req.params.id,
    req.user.id,
    req.validated.week_id,
    req.validated.player_id
  )
  res.status(201).json(pick)
})

// Touchdown survivor — get available NFL players
router.get('/:id/survivor/touchdown-players', requireAuth, async (req, res) => {
  const { position, q } = req.query

  let query = supabase
    .from('nfl_players')
    .select('id, full_name, position, team, headshot_url, injury_status, search_rank')
    .eq('status', 'Active')
    .not('team', 'is', null)
    .in('position', ['RB', 'WR', 'TE', 'QB'])
    .order('search_rank', { ascending: true })
    .limit(100)

  if (position && position !== 'All') {
    query = query.eq('position', position)
  }
  if (q) {
    query = query.ilike('full_name', `%${q}%`)
  }

  const { data, error } = await query
  if (error) throw error

  // Get used player IDs for this user in this league
  const { data: usedPicks } = await supabase
    .from('survivor_picks')
    .select('player_id')
    .eq('league_id', req.params.id)
    .eq('user_id', req.user.id)
    .in('status', ['locked', 'survived', 'eliminated'])

  const usedIds = new Set((usedPicks || []).map((p) => p.player_id).filter(Boolean))

  const players = (data || []).map((p) => ({
    ...p,
    used: usedIds.has(p.id),
  }))

  res.json(players)
})

router.get('/:id/survivor/board', requireAuth, async (req, res) => {
  const board = await getSurvivorBoard(req.params.id, req.user.id)
  res.json(board)
})

router.get('/:id/survivor/used-teams', requireAuth, async (req, res) => {
  const teams = await getUsedTeams(req.params.id, req.user.id)
  res.json(teams)
})

router.post('/:id/survivor/settle', requireAuth, async (req, res) => {
  const result = await settleSurvivorLeague(req.params.id, req.user.id)
  res.json({ success: true, ...result })
})

// ============================================
// Squares
// ============================================

router.get('/:id/squares/board', requireAuth, async (req, res) => {
  const board = await getBoard(req.params.id)
  res.json(board)
})

const claimSquareSchema = z.object({
  row_pos: z.number().int().min(0).max(9),
  col_pos: z.number().int().min(0).max(9),
})

router.post('/:id/squares/claim', requireAuth, validate(claimSquareSchema), async (req, res) => {
  const claim = await claimSquare(req.params.id, req.user.id, req.validated.row_pos, req.validated.col_pos)
  res.status(201).json(claim)
})

router.post('/:id/squares/unclaim', requireAuth, validate(claimSquareSchema), async (req, res) => {
  const result = await unclaimSquare(req.params.id, req.user.id, req.validated.row_pos, req.validated.col_pos)
  res.json(result)
})

router.post('/:id/squares/random-assign', requireAuth, async (req, res) => {
  const count = await randomAssignSquares(req.params.id, req.user.id)
  res.json({ assigned: count })
})

router.post('/:id/squares/lock-digits', requireAuth, async (req, res) => {
  const board = await lockDigits(req.params.id, req.user.id)
  res.json(board)
})

const scoreQuarterSchema = z.object({
  quarter: z.number().int().min(1).max(4),
  away_score: z.number().int().min(0),
  home_score: z.number().int().min(0),
})

router.post('/:id/squares/score-quarter', requireAuth, validate(scoreQuarterSchema), async (req, res) => {
  const result = await scoreQuarter(
    req.params.id,
    req.user.id,
    req.validated.quarter,
    req.validated.away_score,
    req.validated.home_score
  )
  res.json(result)
})

const updateBoardSettingsSchema = z.object({
  row_team_name: z.string().min(1).max(50).optional(),
  col_team_name: z.string().min(1).max(50).optional(),
})

router.patch('/:id/squares/board', requireAuth, validate(updateBoardSettingsSchema), async (req, res) => {
  const board = await updateBoardSettings(req.params.id, req.user.id, req.validated)
  res.json(board)
})

// ============================================
// Bracket
// ============================================

router.get('/:id/bracket/tournament', requireAuth, async (req, res) => {
  const tournament = await getTournament(req.params.id)
  res.json(tournament)
})

const updateBracketTournamentSchema = z.object({
  locks_at: z.string().optional(),
})

router.patch('/:id/bracket/tournament', requireAuth, validate(updateBracketTournamentSchema), async (req, res) => {
  const league = await getLeagueDetails(req.params.id, req.user.id)
  if (league.commissioner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the commissioner can update bracket settings' })
  }
  const tournament = await getTournament(req.params.id)
  const updated = await updateBracketTournament(tournament.id, req.body)
  res.json(updated)
})

router.get('/:id/bracket/entry', requireAuth, async (req, res) => {
  const tournament = await getTournament(req.params.id)
  const entry = await getBracketEntry(tournament.id, req.user.id)
  res.json(entry)
})

router.get('/:id/bracket/entries', requireAuth, async (req, res) => {
  const tournament = await getTournament(req.params.id)
  const entries = await getAllEntries(tournament.id)
  res.json(entries)
})

router.get('/:id/bracket/entries/:userId', requireAuth, async (req, res) => {
  const tournament = await getTournament(req.params.id)
  const entry = await getEntryByUser(tournament.id, req.params.userId)
  res.json(entry)
})

router.get('/:id/bracket/series-games', requireAuth, async (req, res) => {
  const { team1, team2 } = req.query
  if (!team1 || !team2) return res.status(400).json({ error: 'team1 and team2 required' })
  const league = await getLeagueDetails(req.params.id, req.user.id)
  // Get the bracket tournament's lock time — only show games after this (playoff games)
  const { data: tournament } = await supabase
    .from('bracket_tournaments')
    .select('locks_at')
    .eq('league_id', league.id)
    .single()
  // Find the sport_id for this league's sport
  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', league.sport)
    .single()
  if (!sport) return res.json([])
  // Query completed games between these two teams after the bracket locked (playoff games only)
  let query = supabase
    .from('games')
    .select('id, home_team, away_team, home_score, away_score, winner, starts_at, status, season')
    .eq('sport_id', sport.id)
    .eq('status', 'final')
    .or(`and(home_team.eq.${team1},away_team.eq.${team2}),and(home_team.eq.${team2},away_team.eq.${team1})`)
    .order('starts_at', { ascending: true })
  if (tournament?.locks_at) {
    query = query.gte('starts_at', tournament.locks_at)
  }
  const { data: filtered } = await query
  // Attach top scorers for each game
  if (filtered.length) {
    const gameIds = filtered.map((g) => g.id)
    const { data: scorers } = await supabase
      .from('game_top_scorers')
      .select('game_id, team, player_name, points, headshot_url')
      .in('game_id', gameIds)
    const scorerMap = {}
    for (const s of scorers || []) {
      if (!scorerMap[s.game_id]) scorerMap[s.game_id] = []
      scorerMap[s.game_id].push(s)
    }

    // On-demand backfill: fetch top scorers for final games that are missing them
    const { findESPNEventId, fetchGameTopScorers } = await import('../services/espnService.js')
    const missingGames = filtered.filter((g) => !scorerMap[g.id] && g.status === 'final')
    for (const g of missingGames) {
      try {
        const espnEventId = await findESPNEventId(league.sport, g.home_team, g.away_team, g.starts_at)
        if (!espnEventId) continue
        const fetched = await fetchGameTopScorers(league.sport, espnEventId)
        if (!fetched.length) continue
        for (const s of fetched) {
          await supabase
            .from('game_top_scorers')
            .upsert({
              game_id: g.id,
              team: s.team,
              player_name: s.playerName,
              points: s.points,
              headshot_url: s.headshotUrl,
            }, { onConflict: 'game_id,team' })
        }
        scorerMap[g.id] = fetched.map((s) => ({
          game_id: g.id,
          team: s.team,
          player_name: s.playerName,
          points: s.points,
          headshot_url: s.headshotUrl,
        }))
      } catch {}
    }

    for (const g of filtered) {
      g.top_scorers = scorerMap[g.id] || []
    }
  }
  res.json(filtered)
})

router.get('/:id/bracket/my-other-entries', requireAuth, async (req, res) => {
  const tournament = await getTournament(req.params.id)
  const entries = await getUserEntriesForTemplate(
    tournament.template_id,
    req.user.id,
    tournament.id
  )
  res.json(entries)
})

const submitBracketSchema = z.object({
  picks: z.array(
    z.object({
      template_matchup_id: z.string().uuid(),
      picked_team: z.string().min(1),
      series_length: z.number().int().min(4).max(7).optional(),
    })
  ).min(1),
  entry_name: z.string().max(50).optional(),
  tiebreaker_score: z.number().int().min(0).max(500),
})

router.post('/:id/bracket/entry', requireAuth, validate(submitBracketSchema), async (req, res) => {
  const tournament = await getTournament(req.params.id)
  const result = await submitBracket(
    tournament.id,
    req.user.id,
    req.validated.picks,
    req.validated.entry_name,
    req.validated.tiebreaker_score
  )
  res.status(201).json(result)
})

// ============================================
// Thread (League Chat)
// ============================================

import { getThreadMessages, postThreadMessage, markThreadRead, hasUnreadMessages } from '../services/leagueThreadService.js'

const threadMessageSchema = z.object({
  content: z.string().min(1).max(2000),
  user_tags: z.array(z.string().uuid()).max(10).optional(),
})

router.get('/:id/thread', requireAuth, async (req, res) => {
  const before = req.query.before || null
  const result = await getThreadMessages(req.params.id, req.user.id, before)
  res.json(result)
})

router.post('/:id/thread', requireAuth, validate(threadMessageSchema), async (req, res) => {
  const message = await postThreadMessage(
    req.params.id,
    req.user.id,
    req.validated.content,
    req.validated.user_tags || []
  )
  res.status(201).json(message)
})

router.post('/:id/thread/read', requireAuth, async (req, res) => {
  await markThreadRead(req.params.id, req.user.id)
  res.status(204).end()
})

router.get('/:id/thread/unread', requireAuth, async (req, res) => {
  const unread = await hasUnreadMessages(req.params.id, req.user.id)
  res.json({ unread })
})

// ============================================
// Fantasy Football
// ============================================

import {
  createFantasySettings,
  getFantasySettings,
  updateFantasySettings,
  initializeDraft,
  startDraft,
  makeDraftPick,
  makeOfflineDraftPick,
  startOfflineDraft,
  undoLastDraftPick,
  getDraftBoard,
  getDraftQueue,
  setDraftQueue,
  pauseDraft,
  resumeDraft,
  getMyRankings,
  setMyRankings,
  resetMyRankings,
  getGlobalRank,
  getDraftPlayerDetail,
  getFantasyStandings,
  getRoster,
  searchAvailablePlayers,
  generateMatchups,
  setFantasyLineup,
  addDropPlayer,
  dropRosterPlayer,
  proposeTrade,
  acceptTrade,
  declineTrade,
  cancelTrade,
  approveTrade,
  vetoTrade,
  getTradesForLeague,
  submitWaiverClaim,
  cancelWaiverClaim,
  getMyWaiverClaims,
  getWaiverState,
  getWaiverStateForLeague,
  processLeagueWaivers,
  getPlayerDetail,
  resizeFantasyLeague,
  cancelFantasyLeague,
  computeFantasyUnderfillState,
  setFantasyWeeklyLineup,
  getFantasyWeeklyLineup,
  promoteWeeklyLineup,
} from '../services/fantasyService.js'

// Get fantasy settings
router.get('/:id/fantasy/settings', requireAuth, async (req, res) => {
  const data = await getFantasySettings(req.params.id)
  res.json(data)
})

// Update fantasy settings (commissioner, pre-draft)
router.patch('/:id/fantasy/settings', requireAuth, async (req, res) => {
  const data = await updateFantasySettings(req.params.id, req.body)
  res.json(data)
})

// Initialize draft (randomize order, create pick slots)
router.post('/:id/fantasy/draft/init', requireAuth, async (req, res) => {
  const result = await initializeDraft(req.params.id)
  res.json(result)
})

// Underfill state for the commissioner banner / modal
router.get('/:id/fantasy/underfill-state', requireAuth, async (req, res) => {
  try {
    const { data: settings } = await supabase
      .from('fantasy_settings')
      .select('league_id, num_teams, format')
      .eq('league_id', req.params.id)
      .single()
    if (!settings || settings.format !== 'traditional') {
      return res.json({ state: 'ok', currentCount: 0, targetEven: null, willDrop: 0 })
    }
    const { count } = await supabase
      .from('league_members')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', req.params.id)
    res.json(computeFantasyUnderfillState(count || 0, settings.num_teams))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Resize an underfilled league down to the closest valid even count.
// Drops the most recent N signups. Commissioner only.
router.post('/:id/fantasy/resize', requireAuth, async (req, res) => {
  try {
    const { data: league } = await supabase.from('leagues').select('commissioner_id').eq('id', req.params.id).single()
    if (!league || league.commissioner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the commissioner can resize the league' })
    }
    const result = await resizeFantasyLeague(req.params.id, { reason: 'commissioner' })
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// Cancel a fantasy league. Commissioner only.
router.post('/:id/fantasy/cancel', requireAuth, async (req, res) => {
  try {
    const { data: league } = await supabase.from('leagues').select('commissioner_id').eq('id', req.params.id).single()
    if (!league || league.commissioner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the commissioner can cancel the league' })
    }
    const result = await cancelFantasyLeague(req.params.id, { reason: 'commissioner' })
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// Postpone the draft. Commissioner only. Resets the underfill notification
// dedup flags so the commish gets fresh alerts based on the new date.
router.post('/:id/fantasy/postpone-draft', requireAuth, async (req, res) => {
  try {
    const { data: league } = await supabase.from('leagues').select('commissioner_id').eq('id', req.params.id).single()
    if (!league || league.commissioner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the commissioner can postpone the draft' })
    }
    const { draft_date } = req.body
    if (!draft_date) return res.status(400).json({ error: 'draft_date required' })
    const newDate = new Date(draft_date)
    if (isNaN(newDate.getTime())) return res.status(400).json({ error: 'Invalid draft_date' })
    if (newDate.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'New draft date must be in the future' })
    }
    await supabase
      .from('fantasy_settings')
      .update({
        draft_date: newDate.toISOString(),
        underfill_notified_3d_at: null,
        underfill_notified_1d_at: null,
        underfill_notified_10m_at: null,
        draft_pre_start_notified_at: null,
      })
      .eq('league_id', req.params.id)

    // Notify every league member that the draft has moved + nudge them
    // to invite friends so the league actually fills up before the new
    // draft date
    try {
      const { data: leagueRow } = await supabase
        .from('leagues')
        .select('name, invite_code')
        .eq('id', req.params.id)
        .single()
      const { data: members } = await supabase
        .from('league_members')
        .select('user_id')
        .eq('league_id', req.params.id)
      const { createNotification } = await import('../services/notificationService.js')
      const leagueName = leagueRow?.name || 'your league'
      for (const m of members || []) {
        if (m.user_id === req.user.id) continue // skip the commish themselves
        await createNotification(
          m.user_id,
          'fantasy_draft_postponed',
          `${leagueName} draft has been postponed. Help fill the league — invite friends to join before the new draft time!`,
          { leagueId: req.params.id, draft_date: newDate.toISOString(), inviteCode: leagueRow?.invite_code }
        )
      }
    } catch (err) {
      // Don't fail the whole request if notifications fail
    }

    res.json({ ok: true, draft_date: newDate.toISOString() })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// Start the draft
router.post('/:id/fantasy/draft/start', requireAuth, async (req, res) => {
  const result = await startDraft(req.params.id)
  res.json(result)
})

// Pause the draft (commissioner only)
router.post('/:id/fantasy/draft/pause', requireAuth, async (req, res) => {
  const { data: league } = await supabase.from('leagues').select('commissioner_id').eq('id', req.params.id).single()
  if (!league || league.commissioner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the commissioner can pause the draft' })
  }
  const result = await pauseDraft(req.params.id)
  res.json(result)
})

// Resume the draft (commissioner only)
router.post('/:id/fantasy/draft/resume', requireAuth, async (req, res) => {
  const { data: league } = await supabase.from('leagues').select('commissioner_id').eq('id', req.params.id).single()
  if (!league || league.commissioner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the commissioner can resume the draft' })
  }
  const result = await resumeDraft(req.params.id)
  res.json(result)
})

// Make a draft pick
router.post('/:id/fantasy/draft/pick', requireAuth, async (req, res) => {
  const { playerId } = req.body
  if (!playerId) return res.status(400).json({ error: 'playerId is required' })
  const result = await makeDraftPick(req.params.id, req.user.id, playerId)
  res.json(result)
})

// Commissioner offline pick (records on behalf of whoever is on the clock)
router.post('/:id/fantasy/draft/offline-pick', requireAuth, async (req, res) => {
  const { playerId } = req.body
  if (!playerId) return res.status(400).json({ error: 'playerId is required' })
  const result = await makeOfflineDraftPick(req.params.id, req.user.id, playerId)
  res.json(result)
})

// Start draft in offline mode (commissioner enters results after in-person draft)
router.post('/:id/fantasy/draft/start-offline', requireAuth, async (req, res) => {
  const result = await startOfflineDraft(req.params.id, req.user.id)
  res.json(result)
})

// Undo last draft pick (commissioner only)
router.post('/:id/fantasy/draft/undo', requireAuth, async (req, res) => {
  const result = await undoLastDraftPick(req.params.id, req.user.id)
  res.json(result)
})

// Get draft board
router.get('/:id/fantasy/draft', requireAuth, async (req, res) => {
  const data = await getDraftBoard(req.params.id)
  res.json(data)
})

// Fantasy traditional standings (W-L-T, PF, PA, streak)
router.get('/:id/fantasy/standings', requireAuth, async (req, res) => {
  const data = await getFantasyStandings(req.params.id)
  res.json(data)
})

// Draft-context player detail (separate from in-season player detail)
router.get('/:id/fantasy/draft-player-detail/:playerId', requireAuth, async (req, res) => {
  const data = await getDraftPlayerDetail(req.params.playerId, { leagueId: req.params.id })
  try {
    const { getPublishedBlurb } = await import('../services/playerBlurbService.js')
    const blurb = await getPublishedBlurb(req.params.playerId)
    if (blurb) data.blurb = blurb
  } catch {}
  res.json(data)
})

// Get my global rank against all teams across IKB with the same format
router.get('/:id/fantasy/global-rank', requireAuth, async (req, res) => {
  const data = await getGlobalRank(req.params.id, req.user.id)
  res.json(data)
})

// Get my custom rankings (lazily seeds from ADP on first call)
router.get('/:id/fantasy/my-rankings', requireAuth, async (req, res) => {
  const data = await getMyRankings(req.params.id, req.user.id)
  res.json(data)
})

// Replace my custom rankings
router.put('/:id/fantasy/my-rankings', requireAuth, async (req, res) => {
  const { playerIds } = req.body
  const result = await setMyRankings(req.params.id, req.user.id, playerIds || [])
  res.json(result)
})

// Reset my rankings — wipe and re-seed from current ADP
router.post('/:id/fantasy/my-rankings/reset', requireAuth, async (req, res) => {
  const result = await resetMyRankings(req.params.id, req.user.id)
  res.json(result)
})

// Get my pre-rank draft queue
router.get('/:id/fantasy/draft/queue', requireAuth, async (req, res) => {
  const data = await getDraftQueue(req.params.id, req.user.id)
  res.json(data)
})

// Replace my pre-rank draft queue
router.put('/:id/fantasy/draft/queue', requireAuth, async (req, res) => {
  const { playerIds } = req.body
  const result = await setDraftQueue(req.params.id, req.user.id, playerIds || [])
  res.json(result)
})

// Get user's roster (with lazy promotion of pre-set weekly lineup)
router.get('/:id/fantasy/roster', requireAuth, async (req, res) => {
  try {
    // Promote pre-set weekly lineup if one exists for the current week
    const settings = await getFantasySettings(req.params.id)
    if (settings?.current_week && settings?.season) {
      await promoteWeeklyLineup(req.params.id, req.user.id, settings.current_week, settings.season)
    }
  } catch {}
  const data = await getRoster(req.params.id, req.user.id)
  res.json(data)
})

// Get another user's roster
router.get('/:id/fantasy/roster/:userId', requireAuth, async (req, res) => {
  const data = await getRoster(req.params.id, req.params.userId)
  res.json(data)
})

// Player detail (for the player modal — works for any NFL player)
router.get('/:id/fantasy/players/:playerId/detail', requireAuth, async (req, res) => {
  try {
    const data = await getPlayerDetail(req.params.id, req.params.playerId)
    // Attach published blurb if available
    try {
      const { getPublishedBlurb } = await import('../services/playerBlurbService.js')
      const blurb = await getPublishedBlurb(req.params.playerId)
      if (blurb) data.blurb = blurb
    } catch {}
    res.json(data)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// Search available players
router.get('/:id/fantasy/players', requireAuth, async (req, res) => {
  const { q, position, sort } = req.query
  const data = await searchAvailablePlayers(req.params.id, q, position, sort)
  res.json(data)
})

// Get player IDs that have published blurbs (lightweight check for indicators)
router.get('/:id/fantasy/blurb-ids', requireAuth, async (req, res) => {
  const { data } = await supabase
    .from('player_blurbs')
    .select('player_id')
    .eq('status', 'published')
  res.json((data || []).map((r) => r.player_id))
})

// Set fantasy team name
router.patch('/:id/fantasy/team-name', requireAuth, async (req, res) => {
  const { team_name } = req.body
  if (team_name != null && typeof team_name !== 'string') return res.status(400).json({ error: 'team_name must be a string' })
  const { error } = await supabase
    .from('league_members')
    .update({ fantasy_team_name: team_name?.trim() || null })
    .eq('league_id', req.params.id)
    .eq('user_id', req.user.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ updated: true })
})

// Set starting lineup (current week)
router.post('/:id/fantasy/lineup', requireAuth, async (req, res) => {
  try {
    const { slots } = req.body
    if (!Array.isArray(slots)) {
      return res.status(400).json({ error: 'slots array required: [{ player_id, slot }, ...]' })
    }
    const result = await setFantasyLineup(req.params.id, req.user.id, slots)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// Get pre-set weekly lineup for a future week
router.get('/:id/fantasy/lineup/week/:week', requireAuth, async (req, res) => {
  try {
    const settings = await getFantasySettings(req.params.id)
    const season = settings?.season || new Date().getUTCFullYear()
    const result = await getFantasyWeeklyLineup(req.params.id, req.user.id, parseInt(req.params.week), season)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// Save pre-set weekly lineup for a future week
router.post('/:id/fantasy/lineup/week/:week', requireAuth, async (req, res) => {
  try {
    const { slots } = req.body
    if (!Array.isArray(slots)) {
      return res.status(400).json({ error: 'slots array required: [{ player_id, slot }, ...]' })
    }
    const settings = await getFantasySettings(req.params.id)
    const season = settings?.season || new Date().getUTCFullYear()
    const result = await setFantasyWeeklyLineup(req.params.id, req.user.id, parseInt(req.params.week), season, slots)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// Add a free agent (optionally dropping a player to make room)
router.post('/:id/fantasy/add-drop', requireAuth, async (req, res) => {
  try {
    const { add_player_id, drop_player_id } = req.body
    const result = await addDropPlayer(req.params.id, req.user.id, add_player_id, drop_player_id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// Standalone drop — remove a player from your roster, leave the slot empty
router.delete('/:id/fantasy/roster/:playerId', requireAuth, async (req, res) => {
  try {
    const result = await dropRosterPlayer(req.params.id, req.user.id, req.params.playerId)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// === Transactions log ===
router.get('/:id/fantasy/transactions', requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  const { data, error } = await supabase
    .from('fantasy_transactions')
    .select('*, users(id, username, display_name, avatar_url, avatar_emoji), nfl_players(id, full_name, position, team, headshot_url)')
    .eq('league_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// === Trades ===
router.get('/:id/fantasy/trades', requireAuth, async (req, res) => {
  const data = await getTradesForLeague(req.params.id)
  res.json(data)
})

router.post('/:id/fantasy/trades', requireAuth, async (req, res) => {
  try {
    const { receiver_user_id, proposer_player_ids, receiver_player_ids, message } = req.body
    const result = await proposeTrade(
      req.params.id,
      req.user.id,
      receiver_user_id,
      proposer_player_ids || [],
      receiver_player_ids || [],
      message,
    )
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/:id/fantasy/trades/:tradeId/accept', requireAuth, async (req, res) => {
  try {
    const dropPlayerIds = req.body?.drop_player_ids || []
    const result = await acceptTrade(req.params.tradeId, req.user.id, dropPlayerIds)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, requires_drop: err.requires_drop, drops_needed: err.drops_needed })
  }
})

router.post('/:id/fantasy/trades/:tradeId/decline', requireAuth, async (req, res) => {
  try {
    const result = await declineTrade(req.params.tradeId, req.user.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/:id/fantasy/trades/:tradeId/cancel', requireAuth, async (req, res) => {
  try {
    const result = await cancelTrade(req.params.tradeId, req.user.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/:id/fantasy/trades/:tradeId/approve', requireAuth, async (req, res) => {
  try {
    const result = await approveTrade(req.params.tradeId, req.user.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/:id/fantasy/trades/:tradeId/veto', requireAuth, async (req, res) => {
  try {
    const result = await vetoTrade(req.params.tradeId, req.user.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// === Waivers ===
router.get('/:id/fantasy/waivers/state', requireAuth, async (req, res) => {
  const all = await getWaiverStateForLeague(req.params.id)
  const me = all.find((s) => s.user_id === req.user.id) || null
  res.json({ league: all, me })
})

router.get('/:id/fantasy/waivers/claims', requireAuth, async (req, res) => {
  const data = await getMyWaiverClaims(req.params.id, req.user.id)
  res.json(data)
})

router.post('/:id/fantasy/waivers/claims', requireAuth, async (req, res) => {
  try {
    const { add_player_id, drop_player_id, bid_amount } = req.body
    const result = await submitWaiverClaim(req.params.id, req.user.id, add_player_id, drop_player_id, bid_amount || 0)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.delete('/:id/fantasy/waivers/claims/:claimId', requireAuth, async (req, res) => {
  try {
    const result = await cancelWaiverClaim(req.params.claimId, req.user.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// Commissioner can manually process waivers (e.g. mid-week)
router.post('/:id/fantasy/waivers/process', requireAuth, async (req, res) => {
  // Verify commissioner
  const { data: member } = await supabase
    .from('league_members')
    .select('role')
    .eq('league_id', req.params.id)
    .eq('user_id', req.user.id)
    .maybeSingle()
  if (member?.role !== 'commissioner') {
    return res.status(403).json({ error: 'Only the commissioner can manually process waivers' })
  }
  const result = await processLeagueWaivers(req.params.id)
  res.json(result)
})

// Generate matchups (commissioner, after draft)
router.post('/:id/fantasy/matchups/generate', requireAuth, async (req, res) => {
  const result = await generateMatchups(req.params.id)
  res.json(result)
})

// League Activity Report
router.get('/:id/report', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('dfs_league_reports')
    .select('report_data, generated_at')
    .eq('league_id', req.params.id)
    .maybeSingle()

  if (error) throw error
  if (!data) return res.status(404).json({ error: 'No report available for this league' })
  res.json({ report: data.report_data, generated_at: data.generated_at })
})

export default router
