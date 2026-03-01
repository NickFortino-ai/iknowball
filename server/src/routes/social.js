import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import {
  toggleReaction,
  getReactionsForPick,
  getReactionsForPicks,
  addComment,
  getComments,
  deleteComment,
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
})

// Pick comments
router.post('/picks/:pickId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'pick', req.params.pickId, req.validated.content)
  res.status(201).json(comment)
})

router.get('/picks/:pickId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('pick', req.params.pickId)
  res.json(comments)
})

// Parlay comments
router.post('/parlays/:parlayId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'parlay', req.params.parlayId, req.validated.content)
  res.status(201).json(comment)
})

router.get('/parlays/:parlayId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('parlay', req.params.parlayId)
  res.json(comments)
})

// Prop pick comments
router.post('/props/:propPickId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'prop', req.params.propPickId, req.validated.content)
  res.status(201).json(comment)
})

router.get('/props/:propPickId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('prop', req.params.propPickId)
  res.json(comments)
})

// Streak event comments
router.post('/streak-events/:streakEventId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'streak_event', req.params.streakEventId, req.validated.content)
  res.status(201).json(comment)
})

router.get('/streak-events/:streakEventId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('streak_event', req.params.streakEventId)
  res.json(comments)
})

// Record history comments
router.post('/records/:recordId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, 'record_history', req.params.recordId, req.validated.content)
  res.status(201).json(comment)
})

router.get('/records/:recordId/comments', requireAuth, async (req, res) => {
  const comments = await getComments('record_history', req.params.recordId)
  res.json(comments)
})

// Delete comment (generic — works for any target type)
router.delete('/comments/:commentId', requireAuth, async (req, res) => {
  await deleteComment(req.user.id, req.params.commentId)
  res.status(204).end()
})

// Feed reactions
const feedReactionSchema = z.object({
  target_type: z.enum(['pick', 'parlay', 'streak_event', 'record_history']),
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

export default router
