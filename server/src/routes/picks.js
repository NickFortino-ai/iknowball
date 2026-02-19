import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { submitPick, deletePick, getUserPicks, getUserPickHistory, getPickById } from '../services/pickService.js'
import { supabase } from '../config/supabase.js'

const router = Router()

const submitPickSchema = z.object({
  game_id: z.string().uuid(),
  picked_team: z.enum(['home', 'away']),
})

router.post('/', requireAuth, validate(submitPickSchema), async (req, res) => {
  const pick = await submitPick(req.user.id, req.validated.game_id, req.validated.picked_team)
  res.status(201).json(pick)
})

router.get('/me', requireAuth, async (req, res) => {
  const picks = await getUserPicks(req.user.id, req.query.status)
  res.json(picks)
})

router.get('/me/history', requireAuth, async (req, res) => {
  const picks = await getUserPickHistory(req.user.id)
  res.json(picks)
})

router.get('/me/bonuses', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('bonus_points')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })

  if (error) throw error
  res.json(data || [])
})

router.get('/:pickId', requireAuth, async (req, res) => {
  const pick = await getPickById(req.params.pickId)
  res.json(pick)
})

router.delete('/:gameId', requireAuth, async (req, res) => {
  await deletePick(req.user.id, req.params.gameId)
  res.status(204).end()
})

export default router
