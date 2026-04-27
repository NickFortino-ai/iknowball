import { supabase } from '../config/supabase.js'
import { createNotification } from './notificationService.js'
import { checkUserMuted, checkContent } from './contentFilterService.js'

export async function assertConnected(actorId, ownerId) {
  // Allow self-interactions
  if (actorId === ownerId) return

  const user_id_1 = actorId < ownerId ? actorId : ownerId
  const user_id_2 = actorId < ownerId ? ownerId : actorId

  const { data } = await supabase
    .from('connections')
    .select('id')
    .eq('user_id_1', user_id_1)
    .eq('user_id_2', user_id_2)
    .eq('status', 'connected')
    .single()

  if (!data) {
    const err = new Error('You must be connected to this user')
    err.status = 403
    throw err
  }
}

// Friendly singular noun for reaction notifications. "Reacted to your X"
// reads better with "post" / "prediction" than the raw target_type string
// (which would yield "futures pick" etc.).
function reactionTargetLabel(targetType) {
  switch (targetType) {
    case 'hot_take':
      return 'post'
    case 'pick':
    case 'parlay':
    case 'prop':
    case 'futures_pick':
    case 'head_to_head':
      return 'prediction'
    case 'streak_event':
    case 'record_history':
      return 'achievement'
    default:
      return 'post'
  }
}

async function getTargetOwner(targetType, targetId) {
  const TABLE_MAP = {
    pick: 'picks',
    parlay: 'parlays',
    prop: 'prop_picks',
    streak_event: 'streak_events',
    record_history: 'record_history',
    hot_take: 'hot_takes',
    head_to_head: 'picks',
    hot_take_reminder: 'hot_take_reminders',
    futures_pick: 'futures_picks',
  }
  const OWNER_COL = {
    pick: 'user_id',
    parlay: 'user_id',
    prop: 'user_id',
    streak_event: 'user_id',
    record_history: 'new_holder_id',
    hot_take: 'user_id',
    head_to_head: 'user_id',
    hot_take_reminder: 'reminder_user_id',
    futures_pick: 'user_id',
  }

  // H2H items have composite IDs like "h2h-..." that aren't real DB UUIDs
  if (targetType === 'head_to_head' && typeof targetId === 'string' && targetId.startsWith('h2h-')) {
    return null
  }

  const table = TABLE_MAP[targetType]
  const ownerCol = OWNER_COL[targetType]
  if (!table) {
    const err = new Error(`Unknown target type: ${targetType}`)
    err.status = 400
    throw err
  }

  const { data } = await supabase
    .from(table)
    .select(ownerCol)
    .eq('id', targetId)
    .single()

  if (!data) {
    const err = new Error(`${targetType} not found`)
    err.status = 404
    throw err
  }
  return data[ownerCol]
}

const NOTIFICATION_LABELS = { pick: 'pick', parlay: 'parlay', prop: 'prop pick', streak_event: 'streak', record_history: 'record', hot_take: 'post', head_to_head: 'head-to-head', hot_take_reminder: 'post', futures_pick: 'futures pick' }

export async function toggleReaction(userId, pickId, reactionType) {
  // Unified: use feed_reactions with target_type='pick'
  return toggleFeedReaction(userId, 'pick', pickId, reactionType)
}

export async function getReactionsForPick(pickId) {
  const { data, error } = await supabase
    .from('feed_reactions')
    .select('reaction_type, user_id, users(username)')
    .eq('target_type', 'pick')
    .eq('target_id', pickId)

  if (error) throw error

  const grouped = {}
  for (const row of data || []) {
    if (!grouped[row.reaction_type]) {
      grouped[row.reaction_type] = { type: row.reaction_type, count: 0, users: [] }
    }
    grouped[row.reaction_type].count++
    grouped[row.reaction_type].users.push({
      userId: row.user_id,
      username: row.users.username,
    })
  }
  return Object.values(grouped)
}

export async function getReactionsForPicks(pickIds) {
  if (!pickIds.length) return {}

  const { data, error } = await supabase
    .from('feed_reactions')
    .select('target_id, reaction_type, user_id, users(username)')
    .eq('target_type', 'pick')
    .in('target_id', pickIds)

  if (error) throw error

  const result = {}
  for (const row of data || []) {
    if (!result[row.target_id]) result[row.target_id] = {}
    if (!result[row.target_id][row.reaction_type]) {
      result[row.target_id][row.reaction_type] = { type: row.reaction_type, count: 0, users: [] }
    }
    result[row.target_id][row.reaction_type].count++
    result[row.target_id][row.reaction_type].users.push({
      userId: row.user_id,
      username: row.users.username,
    })
  }

  // Convert inner objects to arrays
  const mapped = {}
  for (const pickId of Object.keys(result)) {
    mapped[pickId] = Object.values(result[pickId])
  }
  return mapped
}

export async function addComment(userId, targetType, targetId, content, parentId = null) {
  // Check if user is muted
  if (await checkUserMuted(userId)) {
    const err = new Error('Your posting privileges have been suspended')
    err.status = 403
    throw err
  }

  // Check content against banned words
  const filterResult = await checkContent(content)
  if (filterResult.blocked) {
    const err = new Error('Your comment contains inappropriate language. Please revise and try again.')
    err.status = 400
    throw err
  }

  const ownerId = await getTargetOwner(targetType, targetId)

  const insertData = { target_type: targetType, target_id: targetId, user_id: userId, content }
  if (parentId) insertData.parent_id = parentId

  const { data, error } = await supabase
    .from('comments')
    .insert(insertData)
    .select('id, content, created_at, user_id, parent_id, users(username, avatar_url, avatar_emoji)')
    .single()

  if (error) throw error

  // Determine who to notify
  let notifyUserId = ownerId
  if (parentId) {
    // Reply — notify the parent comment's author instead
    const { data: parentComment } = await supabase
      .from('comments')
      .select('user_id')
      .eq('id', parentId)
      .single()
    if (parentComment) notifyUserId = parentComment.user_id
  }

  if (notifyUserId && userId !== notifyUserId) {
    try {
      let label = NOTIFICATION_LABELS[targetType]
      // For hot_takes, use the actual post_type (post, prediction, poll)
      if (targetType === 'hot_take') {
        const { data: ht } = await supabase.from('hot_takes').select('post_type').eq('id', targetId).single()
        if (ht?.post_type === 'prediction') label = 'prediction'
        else if (ht?.post_type === 'poll') label = 'poll'
      }
      const username = data.users?.username || 'Someone'
      const metadata = { actorId: userId, targetType, targetId }
      if (targetType === 'pick') metadata.pickId = targetId
      else if (targetType === 'parlay') metadata.parlayId = targetId
      else if (targetType === 'prop') metadata.propPickId = targetId
      else if (targetType === 'hot_take') metadata.hotTakeId = targetId
      const message = parentId
        ? `${username} replied to your comment`
        : `${username} commented on your ${label}`
      await createNotification(notifyUserId, 'comment', message, metadata)
    } catch (_) { /* notification is best-effort */ }
  }

  return data
}

export async function getComments(targetType, targetId, requestingUserId = null) {
  const { data, error } = await supabase
    .from('comments')
    .select('id, content, created_at, user_id, target_type, target_id, parent_id, users(username, avatar_url, avatar_emoji)')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: true })

  if (error) throw error
  const comments = data || []
  if (!comments.length) return comments

  // Batch-fetch like counts
  const commentIds = comments.map((c) => c.id)
  const { data: likeCounts } = await supabase
    .from('comment_likes')
    .select('comment_id')
    .in('comment_id', commentIds)

  const likeCountMap = {}
  for (const row of likeCounts || []) {
    likeCountMap[row.comment_id] = (likeCountMap[row.comment_id] || 0) + 1
  }

  // Fetch user's own likes if requesting user provided
  const userLikeSet = new Set()
  if (requestingUserId) {
    const { data: userLikes } = await supabase
      .from('comment_likes')
      .select('comment_id')
      .in('comment_id', commentIds)
      .eq('user_id', requestingUserId)
    for (const row of userLikes || []) {
      userLikeSet.add(row.comment_id)
    }
  }

  return comments.map((c) => ({
    ...c,
    like_count: likeCountMap[c.id] || 0,
    has_liked: userLikeSet.has(c.id),
  }))
}

export async function toggleCommentLike(userId, commentId) {
  const { data: existing } = await supabase
    .from('comment_likes')
    .select('id')
    .eq('comment_id', commentId)
    .eq('user_id', userId)
    .single()

  if (existing) {
    await supabase.from('comment_likes').delete().eq('id', existing.id)
    return { toggled: 'off' }
  }

  await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: userId })
  return { toggled: 'on' }
}

export async function deleteComment(userId, commentId) {
  const { data: comment } = await supabase
    .from('comments')
    .select('id, user_id')
    .eq('id', commentId)
    .single()

  if (!comment) {
    const err = new Error('Comment not found')
    err.status = 404
    throw err
  }

  if (comment.user_id !== userId) {
    const err = new Error('You can only delete your own comments')
    err.status = 403
    throw err
  }

  const { error } = await supabase.from('comments').delete().eq('id', commentId)
  if (error) throw error
}

// --- Feed Reactions ---

export async function toggleFeedReaction(userId, targetType, targetId, reactionType) {
  const ownerId = await getTargetOwner(targetType, targetId)

  const { data: existing } = await supabase
    .from('feed_reactions')
    .select('id')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('user_id', userId)
    .eq('reaction_type', reactionType)
    .single()

  if (existing) {
    await supabase.from('feed_reactions').delete().eq('id', existing.id)
    return { toggled: 'off' }
  }

  await supabase.from('feed_reactions').insert({
    target_type: targetType,
    target_id: targetId,
    user_id: userId,
    reaction_type: reactionType,
  })

  if (ownerId && userId !== ownerId) {
    try {
      const { data: actor } = await supabase
        .from('users')
        .select('username')
        .eq('id', userId)
        .single()
      const username = actor?.username || 'Someone'
      const label = reactionTargetLabel(targetType)
      await createNotification(ownerId, 'reaction', `${username} reacted to your ${label}`, {
        actorId: userId,
        targetType,
        targetId,
        reactionType,
      })
    } catch (_) { /* notification is best-effort */ }
  }

  return { toggled: 'on' }
}

// --- Bookmarks ---

export async function toggleBookmark(userId, hotTakeId) {
  const { data: existing } = await supabase
    .from('hot_take_bookmarks')
    .select('id')
    .eq('user_id', userId)
    .eq('hot_take_id', hotTakeId)
    .single()

  if (existing) {
    await supabase.from('hot_take_bookmarks').delete().eq('id', existing.id)
    return { toggled: 'off' }
  }

  await supabase.from('hot_take_bookmarks').insert({ user_id: userId, hot_take_id: hotTakeId })
  return { toggled: 'on' }
}

export async function getBookmarkStatusBatch(userId, hotTakeIds) {
  if (!hotTakeIds?.length) return {}

  const { data } = await supabase
    .from('hot_take_bookmarks')
    .select('hot_take_id')
    .eq('user_id', userId)
    .in('hot_take_id', hotTakeIds)

  const result = {}
  for (const id of hotTakeIds) {
    result[id] = false
  }
  for (const row of data || []) {
    result[row.hot_take_id] = true
  }
  return result
}

export async function getBookmarkedHotTakes(userId, before = null) {
  let query = supabase
    .from('hot_take_bookmarks')
    .select('hot_take_id, created_at, hot_takes(id, user_id, content, team_tags, image_url, image_urls, video_url, post_type, user_tags, created_at)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data, error } = await query
  if (error) throw error

  if (!data?.length) return { items: [], hasMore: false }

  // Get user info for all hot take authors
  const userIds = [...new Set(data.map((b) => b.hot_takes?.user_id).filter(Boolean))]
  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji')
    .in('id', userIds)

  const userMap = {}
  for (const u of users || []) {
    userMap[u.id] = u
  }

  // Get comment counts
  const hotTakeIds = data.map((b) => b.hot_takes?.id).filter(Boolean)
  const { data: commentCounts } = await supabase
    .from('comments')
    .select('target_id')
    .eq('target_type', 'hot_take')
    .in('target_id', hotTakeIds)

  const commentCountMap = {}
  for (const c of commentCounts || []) {
    commentCountMap[c.target_id] = (commentCountMap[c.target_id] || 0) + 1
  }

  const items = data.filter((b) => b.hot_takes).map((bookmark) => {
    const take = bookmark.hot_takes
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
      bookmarkedAt: bookmark.created_at,
      commentCount: commentCountMap[take.id] || 0,
      hot_take: {
        id: take.id,
        content: take.content,
        team_tags: take.team_tags,
        image_url: take.image_url,
        image_urls: take.image_urls || (take.image_url ? [take.image_url] : null),
        video_url: take.video_url,
        post_type: take.post_type || 'post',
        user_tags: take.user_tags,
      },
    }
  })

  return { items, hasMore: data.length === 20 }
}

export async function getFeedReactionsBatch(items) {
  if (!items?.length) return {}

  // Build OR filter for all target_type + target_id pairs
  const orFilter = items.map((i) => `and(target_type.eq.${i.target_type},target_id.eq.${i.target_id})`).join(',')

  const { data, error } = await supabase
    .from('feed_reactions')
    .select('target_type, target_id, reaction_type, user_id, users(username, display_name)')
    .or(orFilter)

  if (error) throw error

  const result = {}
  for (const row of data || []) {
    const key = `${row.target_type}-${row.target_id}`
    if (!result[key]) result[key] = {}
    if (!result[key][row.reaction_type]) {
      result[key][row.reaction_type] = { type: row.reaction_type, count: 0, users: [] }
    }
    result[key][row.reaction_type].count++
    result[key][row.reaction_type].users.push({
      userId: row.user_id,
      username: row.users?.username,
      displayName: row.users?.display_name,
    })
  }

  const mapped = {}
  for (const key of Object.keys(result)) {
    mapped[key] = Object.values(result[key])
  }
  return mapped
}
