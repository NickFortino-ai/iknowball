import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createHotTake, updateHotTake, deleteHotTake, getHotTakesByUser, createReminder, askForHotTakes, createFlex } from '../services/hotTakeService.js'
import { toggleBookmark, getBookmarkedHotTakes, getBookmarkStatusBatch } from '../services/socialService.js'
import { checkUserMuted, checkContent } from '../services/contentFilterService.js'
import { createNotification } from '../services/notificationService.js'
import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { FALLBACK_TEAMS } from './teams.js'
import { parseEmbedSource } from '../utils/embedParser.js'

const router = Router()

const hotTakeSchema = z.object({
  content: z.string().max(2000).optional().default(''),
  team_tags: z.array(z.string().max(50)).max(5).optional(),
  sport_key: z.string().max(50).optional(),
  image_url: z.string().url().optional(),
  image_urls: z.array(z.string().url()).max(4).optional(),
  video_url: z.string().url().optional(),
  stream_video_uid: z.string().max(128).optional(),
  user_tags: z.array(z.string().uuid()).max(3).optional(),
  post_type: z.enum(['post', 'prediction', 'poll']).optional(),
  poll_options: z.array(z.string().min(1).max(100)).min(2).max(10).optional(),
  // Raw user input — URL or full embed snippet. Server parses it to a
  // safe {provider, refId, url} on the way in; only that structured shape
  // is stored so rendering can never trust user HTML.
  embed_source: z.string().max(4000).optional(),
}).refine((data) => data.content || data.image_url || data.image_urls?.length || data.video_url || data.embed_source, {
  message: 'Post must have text, an image, a video, or an embed',
})

const flexSchema = z.object({
  content: z.string().optional().default(''),
  pickId: z.string().uuid().optional(),
  parlayId: z.string().uuid().optional(),
  propPickId: z.string().uuid().optional(),
})

router.post('/flex', requireAuth, validate(flexSchema), async (req, res) => {
  if (await checkUserMuted(req.user.id)) {
    return res.status(403).json({ error: 'Your posting privileges have been suspended' })
  }
  const filterResult = await checkContent(req.validated.content)
  if (filterResult.blocked) {
    return res.status(400).json({ error: 'Your flex contains inappropriate language. Please revise and try again.' })
  }
  try {
    const flex = await createFlex(req.user.id, req.validated)
    res.status(201).json(flex)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
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

  // If the user sent an embed, parse it server-side into a safe structured
  // shape. Unknown / malformed input is silently dropped (post still goes
  // through) so a bad paste doesn't block the whole submission.
  const embed = req.validated.embed_source ? parseEmbedSource(req.validated.embed_source) : null

  const hotTake = await createHotTake(
    req.user.id,
    req.validated.content,
    req.validated.team_tags,
    req.validated.sport_key,
    req.validated.image_url,
    req.validated.user_tags,
    req.validated.video_url,
    req.validated.image_urls,
    req.validated.post_type,
    req.validated.stream_video_uid,
    embed
  )

  // Create poll options if poll type
  if (req.validated.post_type === 'poll' && req.validated.poll_options?.length) {
    const optionRows = req.validated.poll_options.map((label, i) => ({
      hot_take_id: hotTake.id,
      label,
      position: i,
    }))
    const { data: options } = await supabase
      .from('poll_options')
      .insert(optionRows)
      .select()
    hotTake.poll_options = options
  }

  res.status(201).json(hotTake)
})

router.get('/user/:userId', requireAuth, async (req, res) => {
  const data = await getHotTakesByUser(req.params.userId)
  res.json(data)
})

// Sport feed endpoint — all hot takes from any team in a sport
router.get('/sport', requireAuth, async (req, res) => {
  const { sport, before } = req.query
  if (!sport) {
    return res.status(400).json({ error: 'sport query param is required' })
  }

  const teamList = FALLBACK_TEAMS[sport]
  if (!teamList?.length) {
    return res.status(400).json({ error: 'Unknown sport' })
  }

  // Get blocked user IDs to filter out
  const { data: blocks } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', req.user.id)
  const blockedIds = (blocks || []).map((b) => b.blocked_id)

  // Match hot takes by sport_key (new) or by team name overlap (legacy, no sport_key).
  // Also filter out posts whose Cloudflare Stream video is still transcoding
  // — uploader sees their own pending posts, but this is the public team feed
  // so nothing pending should leak in.
  let query = supabase
    .from('hot_takes')
    .select('id, user_id, content, team_tags, user_tags, image_url, image_urls, video_url, stream_video_uid, stream_ready_at, post_type, embed_provider, embed_ref_id, embed_url, created_at')
    .or(`sport_key.eq.${sport},and(sport_key.is.null,team_tags.ov.{${teamList.map((t) => `"${t}"`).join(',')}})`)
    .or(`stream_ready_at.not.is.null,user_id.eq.${req.user.id}`)
    .order('created_at', { ascending: false })
    .limit(20)

  if (blockedIds.length > 0) {
    query = query.not('user_id', 'in', `(${blockedIds.join(',')})`)
  }

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data: hotTakes, error } = await query

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch sport feed' })
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

  // Resolve tagged users
  const allTaggedIds = [...new Set(hotTakes.flatMap((t) => t.user_tags || []))]
  const taggedUserMap = {}
  if (allTaggedIds.length > 0) {
    const { data: taggedUsers } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, avatar_emoji')
      .in('id', allTaggedIds)
    for (const u of taggedUsers || []) {
      taggedUserMap[u.id] = u
    }
  }

  const items = hotTakes.map((take) => {
    const user = userMap[take.user_id]
    const tagged_users = (take.user_tags || []).map((id) => taggedUserMap[id]).filter(Boolean)
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
        user_tags: take.user_tags,
        image_url: take.image_url,
        image_urls: take.image_urls || (take.image_url ? [take.image_url] : null),
        video_url: take.video_url,
        post_type: take.post_type || 'post',
        tagged_users,
      },
    }
  })

  res.json({ items, hasMore: hotTakes.length === 20 })
})

// Team feed endpoint
router.get('/team', requireAuth, async (req, res) => {
  const { team, before } = req.query
  if (!team) {
    return res.status(400).json({ error: 'team query param is required' })
  }

  // Get blocked user IDs to filter out
  const { data: blocks } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', req.user.id)
  const blockedIds = (blocks || []).map((b) => b.blocked_id)

  let query = supabase
    .from('hot_takes')
    .select('id, user_id, content, team_tags, user_tags, image_url, image_urls, video_url, stream_video_uid, stream_ready_at, post_type, embed_provider, embed_ref_id, embed_url, created_at')
    .contains('team_tags', [team])
    .or(`stream_ready_at.not.is.null,user_id.eq.${req.user.id}`)
    .order('created_at', { ascending: false })
    .limit(20)

  if (blockedIds.length > 0) {
    query = query.not('user_id', 'in', `(${blockedIds.join(',')})`)
  }

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

  // Resolve tagged users
  const allTaggedIds = [...new Set(hotTakes.flatMap((t) => t.user_tags || []))]
  const taggedUserMap = {}
  if (allTaggedIds.length > 0) {
    const { data: taggedUsers } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, avatar_emoji')
      .in('id', allTaggedIds)
    for (const u of taggedUsers || []) {
      taggedUserMap[u.id] = u
    }
  }

  const items = hotTakes.map((take) => {
    const user = userMap[take.user_id]
    const tagged_users = (take.user_tags || []).map((id) => taggedUserMap[id]).filter(Boolean)
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
        user_tags: take.user_tags,
        image_url: take.image_url,
        image_urls: take.image_urls || (take.image_url ? [take.image_url] : null),
        video_url: take.video_url,
        post_type: take.post_type || 'post',
        tagged_users,
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

// Vote on a poll
router.post('/:id/vote', requireAuth, async (req, res) => {
  const { option_id } = req.body
  if (!option_id) return res.status(400).json({ error: 'option_id is required' })

  // Verify option belongs to this hot take
  const { data: option } = await supabase
    .from('poll_options')
    .select('id')
    .eq('id', option_id)
    .eq('hot_take_id', req.params.id)
    .maybeSingle()

  if (!option) return res.status(404).json({ error: 'Poll option not found' })

  const { error } = await supabase
    .from('poll_votes')
    .insert({ option_id, hot_take_id: req.params.id, user_id: req.user.id })

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'You already voted on this poll' })
    throw error
  }

  // Return updated results
  const { data: options } = await supabase
    .from('poll_options')
    .select('id, label, position')
    .eq('hot_take_id', req.params.id)
    .order('position')

  const { data: votes } = await supabase
    .from('poll_votes')
    .select('option_id, user_id')
    .eq('hot_take_id', req.params.id)

  const voteCounts = {}
  for (const v of (votes || [])) {
    voteCounts[v.option_id] = (voteCounts[v.option_id] || 0) + 1
  }

  const results = (options || []).map((o) => ({
    ...o,
    votes: voteCounts[o.id] || 0,
  }))

  // Fire one-shot milestone notification when ≥6 non-author voters
  try {
    const { data: hotTake } = await supabase
      .from('hot_takes')
      .select('id, user_id, voters_notified_at')
      .eq('id', req.params.id)
      .maybeSingle()
    if (hotTake && !hotTake.voters_notified_at) {
      const nonAuthorCount = (votes || []).filter((v) => v.user_id !== hotTake.user_id).length
      if (nonAuthorCount >= 6) {
        await supabase
          .from('hot_takes')
          .update({ voters_notified_at: new Date().toISOString() })
          .eq('id', hotTake.id)
          .is('voters_notified_at', null)
        await createNotification(hotTake.user_id, 'poll_response_milestone',
          'People are responding to your poll!',
          { hotTakeId: hotTake.id })
      }
    }
  } catch (err) {
    logger.error({ err, hotTakeId: req.params.id }, 'Failed to fire poll milestone notification')
  }

  res.json({ options: results, userVote: option_id, totalVotes: votes?.length || 0 })
})

// Get poll results
router.get('/:id/poll', requireAuth, async (req, res) => {
  const { data: options } = await supabase
    .from('poll_options')
    .select('id, label, position')
    .eq('hot_take_id', req.params.id)
    .order('position')

  const { data: votes } = await supabase
    .from('poll_votes')
    .select('option_id, user_id')
    .eq('hot_take_id', req.params.id)

  const voteCounts = {}
  for (const v of (votes || [])) {
    voteCounts[v.option_id] = (voteCounts[v.option_id] || 0) + 1
  }

  const userVote = (votes || []).find((v) => v.user_id === req.user.id)?.option_id || null

  const results = (options || []).map((o) => ({
    ...o,
    votes: voteCounts[o.id] || 0,
  }))

  res.json({ options: results, userVote, totalVotes: votes?.length || 0 })
})

router.post('/:id/remind', requireAuth, async (req, res) => {
  const data = await createReminder(req.user.id, req.params.id, req.body.comment)
  res.status(201).json(data)
})

router.post('/ask/:userId', requireAuth, async (req, res) => {
  const data = await askForHotTakes(req.user.id, req.params.userId)
  res.status(201).json(data)
})

router.get('/:id', requireAuth, async (req, res) => {
  const { data: take, error } = await supabase
    .from('hot_takes')
    .select('id, user_id, content, team_tags, user_tags, image_url, image_urls, video_url, stream_video_uid, stream_ready_at, post_type, embed_provider, embed_ref_id, embed_url, created_at')
    .eq('id', req.params.id)
    .single()

  if (error || !take) {
    return res.status(404).json({ error: 'Post not found' })
  }

  // Non-author can't see a hot take whose video is still transcoding.
  if (take.stream_video_uid && !take.stream_ready_at && take.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Post not found' })
  }

  const { data: user } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji')
    .eq('id', take.user_id)
    .single()

  // Resolve tagged users
  let tagged_users = []
  if (take.user_tags?.length) {
    const { data: taggedUsers } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, avatar_emoji')
      .in('id', take.user_tags)
    tagged_users = taggedUsers || []
  }

  res.json({
    type: 'hot_take',
    id: take.id,
    userId: take.user_id,
    username: user?.username,
    display_name: user?.display_name,
    avatar_url: user?.avatar_url,
    avatar_emoji: user?.avatar_emoji,
    timestamp: take.created_at,
    hot_take: {
      id: take.id,
      content: take.content,
      team_tags: take.team_tags,
      user_tags: take.user_tags,
      image_url: take.image_url,
      image_urls: take.image_urls || (take.image_url ? [take.image_url] : null),
      video_url: take.video_url,
      post_type: take.post_type || 'post',
      tagged_users,
    },
  })
})

router.patch('/:id', requireAuth, validate(hotTakeSchema), async (req, res) => {
  if (await checkUserMuted(req.user.id)) {
    return res.status(403).json({ error: 'Your posting privileges have been suspended' })
  }

  const filterResult = await checkContent(req.validated.content)
  if (filterResult.blocked) {
    return res.status(400).json({ error: 'Your post contains inappropriate language. Please revise and try again.' })
  }

  const hotTake = await updateHotTake(req.user.id, req.params.id, req.validated.content, req.validated.team_tags, req.validated.sport_key, req.validated.image_url, req.validated.user_tags, req.validated.video_url, req.validated.image_urls)
  res.json(hotTake)
})

router.delete('/:id', requireAuth, async (req, res) => {
  await deleteHotTake(req.user.id, req.params.id)
  res.status(204).end()
})

export default router
