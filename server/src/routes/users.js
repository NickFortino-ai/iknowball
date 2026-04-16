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
import { getPublicPickHistory } from '../services/pickService.js'
import { getCrowns, getRecordHolders } from '../services/leaderboardService.js'

const router = Router()

const registerSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
})

const updateSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  avatar_url: z.string().url().nullable().optional(),
  bio: z.string().max(200).optional(),
  avatar_emoji: z.string().max(4).optional(),
  sports_interests: z.array(z.string()).max(10).optional(),
  // Per-type push preferences. Any notification type key can be set
  // to true/false. Missing key = default on. Used by
  // notificationService.js to decide whether to fire a push for that
  // user/type combination. Full list of active types is kept on the
  // client in components/settings/NotificationPreferences.jsx.
  push_preferences: z.record(z.string(), z.boolean()).optional(),
  title_preference: z.enum(['king', 'queen']).nullable().optional(),
  x_handle: z.string().max(30).nullable().optional(),
  instagram_handle: z.string().max(30).nullable().optional(),
  tiktok_handle: z.string().max(30).nullable().optional(),
  snapchat_handle: z.string().max(30).nullable().optional(),
  youtube_handle: z.string().max(50).nullable().optional(),
  venmo_handle: z.string().max(30).nullable().optional(),
  threads_handle: z.string().max(30).nullable().optional(),
  has_seen_onboarding: z.boolean().optional(),
  has_dismissed_readiness_banner: z.boolean().optional(),
  timezone: z.string().max(50).optional(),
  backdrop_image: z.string().max(200).nullable().optional(),
  backdrop_y: z.number().min(0).max(100).nullable().optional(),
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
    .ilike('username', username)
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
    .ilike('username', username)
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
    .select('id, username, display_name, avatar_url, avatar_emoji, bio, sports_interests, total_points, tier, title_preference, x_handle, instagram_handle, tiktok_handle, snapchat_handle, youtube_handle, venmo_handle, threads_handle, backdrop_image, backdrop_y, created_at')
    .eq('id', id)
    .single()

  if (error || !user) {
    return res.status(404).json({ error: 'User not found' })
  }

  // Get pick record (picks + parlays + props)
  const { data: picks } = await supabase
    .from('picks')
    .select('is_correct')
    .eq('user_id', id)
    .eq('status', 'settled')

  const { data: parlays } = await supabase
    .from('parlays')
    .select('is_correct')
    .eq('user_id', id)
    .eq('status', 'settled')

  const { data: propPicks } = await supabase
    .from('prop_picks')
    .select('is_correct')
    .eq('user_id', id)
    .eq('status', 'settled')

  const allSettled = [...(picks || []), ...(parlays || []), ...(propPicks || [])]
  const wins = allSettled.filter((p) => p.is_correct === true).length
  const losses = allSettled.filter((p) => p.is_correct === false).length
  const pushes = allSettled.filter((p) => p.is_correct === null).length

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

  // Compute per-sport ranks
  const sportIds = (sportStats || []).map((s) => s.sport_id)
  let sportRanks = {}
  if (sportIds.length > 0) {
    const { data: allSportStats } = await supabase
      .from('user_sport_stats')
      .select('user_id, sport_id, total_points')
      .in('sport_id', sportIds)
      .order('total_points', { ascending: false })

    for (const sportId of sportIds) {
      const ranked = (allSportStats || []).filter((s) => s.sport_id === sportId)
      const pos = ranked.findIndex((s) => s.user_id === id) + 1
      sportRanks[sportId] = { rank: pos, total: ranked.length }
    }
  }

  const enrichedSportStats = (sportStats || []).map((s) => ({
    ...s,
    sport_rank: sportRanks[s.sport_id]?.rank || null,
    sport_total_users: sportRanks[s.sport_id]?.total || null,
  }))

  const [crowns, records] = await Promise.all([getCrowns(id), getRecordHolders(id)])

  res.json({
    ...user,
    record: { wins, losses, pushes, total: wins + losses + pushes },
    rank,
    total_users: allUsers?.length || 0,
    sport_stats: enrichedSportStats,
    crowns,
    records,
  })
})

// Head-to-head record between current user and another user
router.get('/:id/head-to-head', requireAuth, async (req, res) => {
  const myId = req.user.id
  const theirId = req.params.id

  if (myId === theirId) {
    return res.json({ wins: 0, losses: 0, ties: 0, total: 0, games: [] })
  }

  // Verify connection exists
  const user_id_1 = myId < theirId ? myId : theirId
  const user_id_2 = myId < theirId ? theirId : myId

  const { data: connection } = await supabase
    .from('connections')
    .select('id')
    .eq('user_id_1', user_id_1)
    .eq('user_id_2', user_id_2)
    .eq('status', 'connected')
    .single()

  if (!connection) {
    return res.status(403).json({ error: 'You must be connected to view head-to-head' })
  }

  // Fetch both users' settled picks in parallel
  const [myPicksResult, theirPicksResult] = await Promise.all([
    supabase
      .from('picks')
      .select('game_id, is_correct, games(home_team, away_team, starts_at, sports(name))')
      .eq('user_id', myId)
      .eq('status', 'settled'),
    supabase
      .from('picks')
      .select('game_id, is_correct')
      .eq('user_id', theirId)
      .eq('status', 'settled'),
  ])

  const myPicks = myPicksResult.data || []
  const theirPicks = theirPicksResult.data || []

  // Build map of their picks by game_id
  const theirPickMap = {}
  for (const p of theirPicks) {
    theirPickMap[p.game_id] = p
  }

  let wins = 0, losses = 0, ties = 0
  const games = []

  for (const myPick of myPicks) {
    const theirPick = theirPickMap[myPick.game_id]
    if (!theirPick) continue

    // Both picked this game
    const myCorrect = myPick.is_correct === true
    const theirCorrect = theirPick.is_correct === true

    let result
    if (myCorrect && !theirCorrect) {
      wins++
      result = 'win'
    } else if (!myCorrect && theirCorrect) {
      losses++
      result = 'loss'
    } else {
      ties++
      result = 'tie'
    }

    games.push({
      game_id: myPick.game_id,
      matchup: `${myPick.games?.away_team} @ ${myPick.games?.home_team}`,
      sport: myPick.games?.sports?.name,
      date: myPick.games?.starts_at,
      result,
    })
  }

  // Sort by date desc, limit 20
  games.sort((a, b) => new Date(b.date) - new Date(a.date))

  res.json({
    wins,
    losses,
    ties,
    total: wins + losses + ties,
    games: games.slice(0, 20),
  })
})

// Get any user's settled pick history
router.get('/:id/picks', requireAuth, async (req, res) => {
  const picks = await getPublicPickHistory(req.params.id)
  res.json(picks)
})

// Get any user's settled parlay history
router.get('/:id/parlays', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('parlays')
    .select('*, parlay_legs(*, games(*, sports(key, name)))')
    .eq('user_id', req.params.id)
    .in('status', ['locked', 'settled'])
    .order('updated_at', { ascending: false })

  if (error) throw error
  res.json(data || [])
})

// Get any user's settled prop pick history
router.get('/:id/prop-picks', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('prop_picks')
    .select('*, player_props(*, games(id, home_team, away_team, starts_at, status, sports(key, name)))')
    .eq('user_id', req.params.id)
    .in('status', ['locked', 'settled'])
    .order('updated_at', { ascending: false })

  if (error) throw error
  res.json(data || [])
})

// Get any user's bonus points history
router.get('/:id/bonuses', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('bonus_points')
    .select('*')
    .eq('user_id', req.params.id)
    .order('created_at', { ascending: false })

  if (error) throw error
  res.json(data || [])
})

// Search users by username or display name.
// Pass ?includeSelf=true for callers that legitimately want to find the
// current user in results (e.g. leaderboard search). Default behavior
// excludes self since most callers are invite/connection flows.
router.get('/search', requireAuth, async (req, res) => {
  const q = req.query.q?.trim()
  const includeSelf = req.query.includeSelf === 'true'
  if (!q || q.length < 2) {
    return res.json([])
  }

  // Get blocked user IDs
  const { data: blocks } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', req.user.id)

  const blockedIds = (blocks || []).map((b) => b.blocked_id)

  let query = supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji')
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(10)

  if (!includeSelf) {
    query = query.neq('id', req.user.id)
  }

  if (blockedIds.length > 0) {
    for (const id of blockedIds) {
      query = query.neq('id', id)
    }
  }

  const { data, error } = await query
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

  // Compute global rank
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .gt('total_points', data.total_points || 0)

  res.json({ ...data, rank: (count || 0) + 1 })
})

router.get('/me/sports', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('user_sport_stats')
    .select('*, sports(key, name)')
    .eq('user_id', req.user.id)

  if (error) throw error
  res.json(data || [])
})

// ============================================
// Block System
// ============================================

router.get('/me/blocked', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id, created_at, blocked:users!blocked_users_blocked_id_fkey(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('blocker_id', req.user.id)
    .order('created_at', { ascending: false })

  if (error) throw error
  res.json(data || [])
})

router.post('/me/block', requireAuth, async (req, res) => {
  const { blocked_id } = req.body
  if (!blocked_id) {
    return res.status(400).json({ error: 'blocked_id is required' })
  }

  if (blocked_id === req.user.id) {
    return res.status(400).json({ error: 'You cannot block yourself' })
  }

  const { error } = await supabase
    .from('blocked_users')
    .insert({ blocker_id: req.user.id, blocked_id })

  if (error) {
    if (error.code === '23505') {
      return res.json({ success: true }) // already blocked
    }
    throw error
  }

  // Remove connection if exists
  const id1 = req.user.id < blocked_id ? req.user.id : blocked_id
  const id2 = req.user.id < blocked_id ? blocked_id : req.user.id
  await supabase
    .from('connections')
    .delete()
    .eq('user_id_1', id1)
    .eq('user_id_2', id2)

  res.json({ success: true })
})

router.delete('/me/block/:blockedId', requireAuth, async (req, res) => {
  await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', req.user.id)
    .eq('blocked_id', req.params.blockedId)

  res.status(204).end()
})

router.delete('/me', requireAuth, async (req, res) => {
  const { error } = await supabase.auth.admin.deleteUser(req.user.id)
  if (error) throw error
  res.status(204).end()
})

// Register or refresh a device token for native push. Called by the
// native app on first launch (and whenever APNs issues a new token).
// Upserts on (user_id, token) so repeated calls are idempotent.
const deviceTokenSchema = z.object({
  token: z.string().min(10).max(500),
  platform: z.enum(['ios', 'android']),
})
router.post('/me/device-token', requireAuth, validate(deviceTokenSchema), async (req, res) => {
  const { token, platform } = req.validated
  const { error } = await supabase
    .from('device_tokens')
    .upsert(
      { user_id: req.user.id, token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' }
    )
  if (error) throw error
  res.status(204).end()
})

// Deregister a device token. Called by the client on logout so we don't
// keep pushing to a device that's no longer signed in.
router.delete('/me/device-token', requireAuth, async (req, res) => {
  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'token is required' })
  await supabase
    .from('device_tokens')
    .delete()
    .eq('user_id', req.user.id)
    .eq('token', token)
  res.status(204).end()
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
