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
    .select('id, name, format, sport, status, max_members')
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
  format: z.enum(['pickem', 'survivor', 'squares', 'bracket', 'fantasy']),
  sport: z.enum(['americanfootball_nfl', 'basketball_nba', 'baseball_mlb', 'basketball_ncaab', 'americanfootball_ncaaf', 'basketball_wnba', 'basketball_wncaab', 'icehockey_nhl', 'soccer_usa_mls', 'all']),
  duration: z.enum(['this_week', 'custom_range', 'full_season', 'playoffs_only']).optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  max_members: z.number().int().min(2).optional(),
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
    scoring_format: z.enum(['ppr', 'half_ppr', 'standard']).optional(),
    num_teams: z.number().int().min(2).max(20).optional(),
    draft_pick_timer: z.number().int().optional(),
    waiver_type: z.enum(['priority', 'rolling']).optional(),
    trade_review: z.enum(['commissioner', 'league_vote', 'none']).optional(),
    playoff_teams: z.number().int().optional(),
  }).optional(),
})

router.post('/', requireAuth, validate(createLeagueSchema), async (req, res) => {
  const league = await createLeague(req.user.id, req.validated)
  res.status(201).json(league)
})

router.get('/', requireAuth, async (req, res) => {
  const leagues = await getMyLeagues(req.user.id)
  res.json(leagues)
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
  getDraftBoard,
  getRoster,
  searchAvailablePlayers,
  generateMatchups,
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

// Start the draft
router.post('/:id/fantasy/draft/start', requireAuth, async (req, res) => {
  const result = await startDraft(req.params.id)
  res.json(result)
})

// Make a draft pick
router.post('/:id/fantasy/draft/pick', requireAuth, async (req, res) => {
  const { playerId } = req.body
  if (!playerId) return res.status(400).json({ error: 'playerId is required' })
  const result = await makeDraftPick(req.params.id, req.user.id, playerId)
  res.json(result)
})

// Get draft board
router.get('/:id/fantasy/draft', requireAuth, async (req, res) => {
  const data = await getDraftBoard(req.params.id)
  res.json(data)
})

// Get user's roster
router.get('/:id/fantasy/roster', requireAuth, async (req, res) => {
  const data = await getRoster(req.params.id, req.user.id)
  res.json(data)
})

// Get another user's roster
router.get('/:id/fantasy/roster/:userId', requireAuth, async (req, res) => {
  const data = await getRoster(req.params.id, req.params.userId)
  res.json(data)
})

// Search available players
router.get('/:id/fantasy/players', requireAuth, async (req, res) => {
  const { q, position } = req.query
  const data = await searchAvailablePlayers(req.params.id, q, position)
  res.json(data)
})

// Generate matchups (commissioner, after draft)
router.post('/:id/fantasy/matchups/generate', requireAuth, async (req, res) => {
  const result = await generateMatchups(req.params.id)
  res.json(result)
})

export default router
