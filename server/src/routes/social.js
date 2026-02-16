import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import {
  toggleReaction,
  getReactionsForPick,
  getReactionsForPicks,
  addComment,
  getCommentsForPick,
  deleteComment,
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

router.post('/picks/:pickId/comments', requireAuth, validate(commentSchema), async (req, res) => {
  const comment = await addComment(req.user.id, req.params.pickId, req.validated.content)
  res.status(201).json(comment)
})

router.get('/picks/:pickId/comments', requireAuth, async (req, res) => {
  const comments = await getCommentsForPick(req.params.pickId)
  res.json(comments)
})

router.delete('/comments/:commentId', requireAuth, async (req, res) => {
  await deleteComment(req.user.id, req.params.commentId)
  res.status(204).end()
})

export default router
