import { Router } from 'express'
import { z } from 'zod'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'

const router = Router()

const registerSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
})

const updateSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  avatar_url: z.string().url().optional(),
})

router.post('/register', requireAuth, validate(registerSchema), async (req, res) => {
  const { username } = req.validated

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .single()

  if (existing) {
    return res.status(409).json({ error: 'Username already taken' })
  }

  const { data, error } = await supabase
    .from('users')
    .insert({
      id: req.user.id,
      username,
      display_name: username,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'User already registered' })
    }
    throw error
  }

  res.status(201).json(data)
})

router.get('/me', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.user.id)
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'User profile not found' })
  }

  res.json(data)
})

router.get('/me/sports', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('user_sport_stats')
    .select('*, sports(key, name)')
    .eq('user_id', req.user.id)

  if (error) throw error
  res.json(data || [])
})

router.patch('/me', requireAuth, validate(updateSchema), async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .update({ ...req.validated, updated_at: new Date().toISOString() })
    .eq('id', req.user.id)
    .select()
    .single()

  if (error) throw error

  res.json(data)
})

export default router
