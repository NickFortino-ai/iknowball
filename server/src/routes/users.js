import { Router } from 'express'
import { z } from 'zod'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import {
  getMyInvitations,
  acceptInvitation,
  declineInvitation,
} from '../services/invitationService.js'

const router = Router()

const registerSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
})

const updateSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  avatar_url: z.string().url().optional(),
  bio: z.string().max(200).optional(),
  avatar_emoji: z.string().max(4).optional(),
  sports_interests: z.array(z.string()).max(10).optional(),
})

// Resolve username to email for login (no auth required)
router.post('/resolve', async (req, res) => {
  const { username } = req.body
  if (!username) {
    return res.status(400).json({ error: 'username is required' })
  }

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .single()

  if (!user) {
    return res.status(404).json({ error: 'User not found' })
  }

  const { data: authUser, error } = await supabase.auth.admin.getUserById(user.id)

  if (error || !authUser?.user?.email) {
    return res.status(404).json({ error: 'User not found' })
  }

  res.json({ email: authUser.user.email })
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

router.get('/:id/profile', requireAuth, async (req, res) => {
  const { id } = req.params

  const { data: user, error } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji, bio, sports_interests, total_points, tier, created_at')
    .eq('id', id)
    .single()

  if (error || !user) {
    return res.status(404).json({ error: 'User not found' })
  }

  // Get pick record
  const { data: picks } = await supabase
    .from('picks')
    .select('is_correct')
    .eq('user_id', id)
    .eq('status', 'settled')

  const wins = picks?.filter((p) => p.is_correct === true).length || 0
  const losses = picks?.filter((p) => p.is_correct === false).length || 0
  const pushes = picks?.filter((p) => p.is_correct === null).length || 0

  // Get leaderboard rank
  const { data: allUsers } = await supabase
    .from('users')
    .select('id, total_points')
    .order('total_points', { ascending: false })

  const rank = allUsers ? allUsers.findIndex((u) => u.id === id) + 1 : null

  // Get sport stats
  const { data: sportStats } = await supabase
    .from('user_sport_stats')
    .select('*, sports(key, name)')
    .eq('user_id', id)

  res.json({
    ...user,
    record: { wins, losses, pushes, total: wins + losses + pushes },
    rank,
    total_users: allUsers?.length || 0,
    sport_stats: sportStats || [],
  })
})

// Search users by username or display name
router.get('/search', requireAuth, async (req, res) => {
  const q = req.query.q?.trim()
  if (!q || q.length < 2) {
    return res.json([])
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_emoji')
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .neq('id', req.user.id)
    .limit(10)

  if (error) throw error
  res.json(data || [])
})

// Get my pending invitations
router.get('/me/invitations', requireAuth, async (req, res) => {
  const invitations = await getMyInvitations(req.user.id)
  res.json(invitations)
})

// Accept an invitation
router.post('/me/invitations/:invitationId/accept', requireAuth, async (req, res) => {
  const result = await acceptInvitation(req.params.invitationId, req.user.id)
  res.json(result)
})

// Decline an invitation
router.post('/me/invitations/:invitationId/decline', requireAuth, async (req, res) => {
  await declineInvitation(req.params.invitationId, req.user.id)
  res.status(204).end()
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
