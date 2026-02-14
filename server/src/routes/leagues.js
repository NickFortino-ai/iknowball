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
import {
  submitSurvivorPick,
  deleteSurvivorPick,
  getSurvivorBoard,
  getUsedTeams,
} from '../services/survivorService.js'
import {
  getBoard,
  claimSquare,
  randomAssignSquares,
  lockDigits,
  scoreQuarter,
} from '../services/squaresService.js'

const router = Router()

// ============================================
// League CRUD
// ============================================

const createLeagueSchema = z.object({
  name: z.string().min(1).max(50),
  format: z.enum(['pickem', 'survivor', 'squares']),
  sport: z.enum(['americanfootball_nfl', 'basketball_nba', 'baseball_mlb', 'basketball_ncaab', 'americanfootball_ncaaf', 'all']),
  duration: z.enum(['this_week', 'custom_range', 'full_season', 'playoffs_only']),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  max_members: z.number().int().min(2).optional(),
  settings: z.object({
    games_per_week: z.number().int().min(1).optional(),
    lives: z.number().int().min(1).max(2).optional(),
    all_eliminated_survive: z.boolean().optional(),
    winner_bonus: z.number().int().min(0).optional(),
    runner_up_bonus: z.number().int().min(0).optional(),
    game_id: z.string().uuid().optional(),
    squares_per_member: z.number().int().min(1).max(100).optional(),
    assignment_method: z.enum(['self_select', 'random']).optional(),
    points_per_quarter: z.array(z.number().int().min(0)).length(4).optional(),
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

router.get('/:id', requireAuth, async (req, res) => {
  const league = await getLeagueDetails(req.params.id, req.user.id)
  res.json(league)
})

const updateLeagueSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  max_members: z.number().int().min(2).nullable().optional(),
  settings: z.record(z.any()).optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
})

router.patch('/:id', requireAuth, validate(updateLeagueSchema), async (req, res) => {
  const league = await updateLeague(req.params.id, req.user.id, req.validated)
  res.json(league)
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
  const board = await getSurvivorBoard(req.params.id)
  res.json(board)
})

router.get('/:id/survivor/used-teams', requireAuth, async (req, res) => {
  const teams = await getUsedTeams(req.params.id, req.user.id)
  res.json(teams)
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

export default router
