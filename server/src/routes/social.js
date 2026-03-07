import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { supabase } from '../config/supabase.js'
import {
  toggleReaction,
  getReactionsForPick,
  getReactionsForPicks,
  addComment,
  getComments,
  deleteComment,
  toggleCommentLike,
  toggleFeedReaction,
  getFeedReactionsBatch,
} from '../services/socialService.js'

const router = Router()

const reactionSchema = z.object({
  reaction_type: z.enum(['fire', 'clown', 'goat', 'dead', 'clap', 'ice']),
})

router.post('/picks/:pickId/reactions', requireAuth, validate(reactionSchema), async (req, res) => {
  const result = await toggleReaction(req.user.id, req.params.pickId, req.validated.reaction_type)
  res.json(result)
})

router.get('/picks/:pickId/reactions', requireAuth, async (req, res) => {
  const reactions = await getReactionsForPick(req.params.pickId)
  res.json(reactions)
})

router.get('/picks/reactions/batch', requireAuth, async (req, res) => {
  const pickIds = req.query.pickIds ? req.query.pickIds.split(',') : []
  const reactions = await getReactionsForPicks(pickIds)
  res.json(reactions)
})

const commentSchema = z.object({
  content: z.string().min(1).max(280),
  parent_id: z.string().uuid().nullable().optional(),
})

// Pick comments
router.post('/picks/:pickId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'pick', req.params.pickId, req.validated.content, req.validated.parent_id)
  res.status(201).json(comment)
})

router.get('/picks/:pickId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('pick', req.params.pickId, req.user.id)
  res.json(comments)
})

// Parlay comments
router.post('/parlays/:parlayId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'parlay', req.params.parlayId, req.validated.content, req.validated.parent_id)
  res.status(201).json(comment)
})

router.get('/parlays/:parlayId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('parlay', req.params.parlayId, req.user.id)
  res.json(comments)
})

// Prop pick comments
router.post('/props/:propPickId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'prop', req.params.propPickId, req.validated.content, req.validated.parent_id)
  res.status(201).json(comment)
})

router.get('/props/:propPickId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('prop', req.params.propPickId, req.user.id)
  res.json(comments)
})

// Streak event comments
router.post('/streak-events/:streakEventId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'streak_event', req.params.streakEventId, req.validated.content, req.validated.parent_id)
  res.status(201).json(comment)
})

router.get('/streak-events/:streakEventId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('streak_event', req.params.streakEventId, req.user.id)
  res.json(comments)
})

// Record history comments
router.post('/records/:recordId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'record_history', req.params.recordId, req.validated.content, req.validated.parent_id)
  res.status(201).json(comment)
})

router.get('/records/:recordId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('record_history', req.params.recordId, req.user.id)
  res.json(comments)
})

// Hot take comments
router.post('/hot-takes/:hotTakeId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'hot_take', req.params.hotTakeId, req.validated.content, req.validated.parent_id)
  res.status(201).json(comment)
})

router.get('/hot-takes/:hotTakeId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('hot_take', req.params.hotTakeId, req.user.id)
  res.json(comments)
})

// Delete comment (generic — works for any target type)
router.delete('/comments/:commentId', requireAuth, async (req, res) => {
  await deleteComment(req.user.id, req.params.commentId)
  res.status(204).end()
})

// Comment likes
router.post('/comments/:commentId/like', requireAuth, async (req, res) => {
  const result = await toggleCommentLike(req.user.id, req.params.commentId)
  res.json(result)
})

// Feed reactions
const feedReactionSchema = z.object({
  target_type: z.enum(['pick', 'parlay', 'streak_event', 'record_history', 'hot_take']),
  target_id: z.string().uuid(),
  reaction_type: z.enum(['fire', 'clown', 'goat', 'clap']),
})

router.post('/feed/reactions', requireAuth, validate(feedReactionSchema), async (req, res) => {
  const { target_type, target_id, reaction_type } = req.validated
  const result = await toggleFeedReaction(req.user.id, target_type, target_id, reaction_type)
  res.json(result)
})

router.get('/feed/reactions/batch', requireAuth, async (req, res) => {
  let items = []
  try {
    items = JSON.parse(req.query.items || '[]')
  } catch (_) { /* ignore parse errors */ }
  const reactions = await getFeedReactionsBatch(items)
  res.json(reactions)
})

// Streak detail
router.get('/streaks/:streakId', requireAuth, async (req, res) => {
  const { streakId } = req.params

  // 1. Fetch the streak event
  const { data: streakEvent, error } = await supabase
    .from('streak_events')
    .select('id, user_id, sport_id, streak_length, created_at, sports(key, name)')
    .eq('id', streakId)
    .single()

  if (error || !streakEvent) {
    return res.status(404).json({ error: 'Streak not found' })
  }

  // 2. Get current streak for this user+sport
  const { data: stats } = await supabase
    .from('user_sport_stats')
    .select('current_streak')
    .eq('user_id', streakEvent.user_id)
    .eq('sport_id', streakEvent.sport_id)
    .single()

  const currentStreak = stats?.current_streak || 0
  const isActive = currentStreak >= streakEvent.streak_length

  // 3. Get the picks that formed this streak
  const { data: picks } = await supabase
    .from('picks')
    .select('id, picked_team, odds_at_lock, points_earned, updated_at, games!inner(home_team, away_team, commence_time, sport_id, sports(key, name))')
    .eq('user_id', streakEvent.user_id)
    .eq('games.sport_id', streakEvent.sport_id)
    .eq('status', 'settled')
    .eq('is_correct', true)
    .lte('updated_at', streakEvent.created_at)
    .order('updated_at', { ascending: false })
    .limit(streakEvent.streak_length)

  // Reverse so oldest pick is first (chronological order)
  const orderedPicks = (picks || []).reverse()

  res.json({
    streakEvent,
    currentStreak: isActive ? currentStreak : streakEvent.streak_length,
    isActive,
    picks: orderedPicks,
  })
})

export default router
