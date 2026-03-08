import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createHotTake, updateHotTake, deleteHotTake, getHotTakesByUser, createReminder } from '../services/hotTakeService.js'
import { toggleBookmark, getBookmarkedHotTakes, getBookmarkStatusBatch } from '../services/socialService.js'
import { checkUserMuted, checkContent } from '../services/contentFilterService.js'
import { supabase } from '../config/supabase.js'

const router = Router()

const hotTakeSchema = z.object({
  content: z.string().min(1).max(280),
  team_tags: z.array(z.string().max(50)).max(5).optional(),
  image_url: z.string().url().optional(),
})

router.post('/', requireAuth, validate(hotTakeSchema), async (req, res) => {
  // Check if user is muted
  if (await checkUserMuted(req.user.id)) {
    return res.status(403).json({ error: 'Your posting privileges have been suspended' })
  }

  // Check content against banned words
  const filterResult = await checkContent(req.validated.content)
  if (filterResult.blocked) {
    return res.status(400).json({ error: 'Your post contains inappropriate language. Please revise and try again.' })
  }

  const hotTake = await createHotTake(req.user.id, req.validated.content, req.validated.team_tags, req.validated.image_url)
  res.status(201).json(hotTake)
})

router.get('/user/:userId', requireAuth, async (req, res) => {
  const data = await getHotTakesByUser(req.params.userId)
  res.json(data)
})

// Team feed endpoint
router.get('/team', requireAuth, async (req, res) => {
  const { team, before } = req.query
  if (!team) {
    return res.status(400).json({ error: 'team query param is required' })
  }

  let query = supabase
    .from('hot_takes')
    .select('id, user_id, content, team_tags, image_url, created_at')
    .contains('team_tags', [team])
    .order('created_at', { ascending: false })
    .limit(20)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data: hotTakes, error } = await query

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch team feed' })
  }

  if (!hotTakes?.length) {
    return res.json({ items: [], hasMore: false })
  }

  // Get user info for all hot take authors
  const userIds = [...new Set(hotTakes.map((t) => t.user_id))]
  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji')
    .in('id', userIds)

  const userMap = {}
  for (const u of users || []) {
    userMap[u.id] = u
  }

  // Get comment counts
  const hotTakeIds = hotTakes.map((t) => t.id)
  const { data: commentCounts } = await supabase
    .from('comments')
    .select('target_id')
    .eq('target_type', 'hot_take')
    .in('target_id', hotTakeIds)

  const commentCountMap = {}
  for (const c of commentCounts || []) {
    commentCountMap[c.target_id] = (commentCountMap[c.target_id] || 0) + 1
  }

  const items = hotTakes.map((take) => {
    const user = userMap[take.user_id]
    return {
      type: 'hot_take',
      id: take.id,
      userId: take.user_id,
      username: user?.username,
      display_name: user?.display_name,
      avatar_url: user?.avatar_url,
      avatar_emoji: user?.avatar_emoji,
      timestamp: take.created_at,
      commentCount: commentCountMap[take.id] || 0,
      hot_take: {
        id: take.id,
        content: take.content,
        team_tags: take.team_tags,
        image_url: take.image_url,
      },
    }
  })

  res.json({ items, hasMore: hotTakes.length === 20 })
})

// Bookmark endpoints
router.post('/:id/bookmark', requireAuth, async (req, res) => {
  const result = await toggleBookmark(req.user.id, req.params.id)
  res.json(result)
})

router.get('/bookmarks/list', requireAuth, async (req, res) => {
  const result = await getBookmarkedHotTakes(req.user.id, req.query.before || null)
  res.json(result)
})

router.get('/bookmarks/check', requireAuth, async (req, res) => {
  const ids = req.query.ids ? req.query.ids.split(',') : []
  const result = await getBookmarkStatusBatch(req.user.id, ids)
  res.json(result)
})

router.post('/:id/remind', requireAuth, async (req, res) => {
  const data = await createReminder(req.user.id, req.params.id)
  res.status(201).json(data)
})

router.patch('/:id', requireAuth, validate(hotTakeSchema), async (req, res) => {
  if (await checkUserMuted(req.user.id)) {
    return res.status(403).json({ error: 'Your posting privileges have been suspended' })
  }

  const filterResult = await checkContent(req.validated.content)
  if (filterResult.blocked) {
    return res.status(400).json({ error: 'Your post contains inappropriate language. Please revise and try again.' })
  }

  const hotTake = await updateHotTake(req.user.id, req.params.id, req.validated.content, req.validated.team_tags, req.validated.image_url)
  res.json(hotTake)
})

router.delete('/:id', requireAuth, async (req, res) => {
  await deleteHotTake(req.user.id, req.params.id)
  res.status(204).end()
})

export default router
