import { supabase } from '../config/supabase.js'
import { createNotification } from './notificationService.js'

async function assertConnected(actorId, ownerId) {
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

async function getTargetOwner(targetType, targetId) {
  const TABLE_MAP = {
    pick: 'picks',
    parlay: 'parlays',
    prop: 'prop_picks',
    streak_event: 'streak_events',
    record_history: 'record_history',
  }
  const OWNER_COL = {
    pick: 'user_id',
    parlay: 'user_id',
    prop: 'user_id',
    streak_event: 'user_id',
    record_history: 'new_holder_id',
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

const NOTIFICATION_LABELS = { pick: 'pick', parlay: 'parlay', prop: 'prop pick', streak_event: 'streak', record_history: 'record' }

export async function toggleReaction(userId, pickId, reactionType) {
  const ownerId = await getTargetOwner('pick', pickId)
  await assertConnected(userId, ownerId)

  // Check if reaction already exists
  const { data: existing } = await supabase
    .from('pick_reactions')
    .select('id')
    .eq('pick_id', pickId)
    .eq('user_id', userId)
    .eq('reaction_type', reactionType)
    .single()

  if (existing) {
    await supabase.from('pick_reactions').delete().eq('id', existing.id)
    return { toggled: 'off' }
  }

  await supabase.from('pick_reactions').insert({
    pick_id: pickId,
    user_id: userId,
    reaction_type: reactionType,
  })

  // Notify pick owner on reaction (skip self)
  if (userId !== ownerId) {
    try {
      const { data: actor } = await supabase
        .from('users')
        .select('username')
        .eq('id', userId)
        .single()
      const username = actor?.username || 'Someone'
      await createNotification(ownerId, 'reaction', `${username} reacted ${reactionType} to your pick`, {
        actorId: userId,
        pickId,
        reactionType,
      })
    } catch (_) { /* notification is best-effort */ }
  }

  return { toggled: 'on' }
}

export async function getReactionsForPick(pickId) {
  const { data, error } = await supabase
    .from('pick_reactions')
    .select('reaction_type, user_id, users(username)')
    .eq('pick_id', pickId)

  if (error) throw error

  // Group by reaction type
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
    .from('pick_reactions')
    .select('pick_id, reaction_type, user_id, users(username)')
    .in('pick_id', pickIds)

  if (error) throw error

  const result = {}
  for (const row of data || []) {
    if (!result[row.pick_id]) result[row.pick_id] = {}
    if (!result[row.pick_id][row.reaction_type]) {
      result[row.pick_id][row.reaction_type] = { type: row.reaction_type, count: 0, users: [] }
    }
    result[row.pick_id][row.reaction_type].count++
    result[row.pick_id][row.reaction_type].users.push({
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

export async function addComment(userId, targetType, targetId, content) {
  const ownerId = await getTargetOwner(targetType, targetId)
  await assertConnected(userId, ownerId)

  const { data, error } = await supabase
    .from('comments')
    .insert({ target_type: targetType, target_id: targetId, user_id: userId, content })
    .select('id, content, created_at, user_id, users(username, avatar_emoji)')
    .single()

  if (error) throw error

  // Notify owner on comment (skip self)
  if (userId !== ownerId) {
    try {
      const label = NOTIFICATION_LABELS[targetType]
      const username = data.users?.username || 'Someone'
      const metadata = { actorId: userId }
      if (targetType === 'pick') metadata.pickId = targetId
      else if (targetType === 'parlay') metadata.parlayId = targetId
      else if (targetType === 'prop') metadata.propPickId = targetId
      await createNotification(ownerId, 'comment', `${username} commented on your ${label}`, metadata)
    } catch (_) { /* notification is best-effort */ }
  }

  return data
}

export async function getComments(targetType, targetId) {
  const { data, error } = await supabase
    .from('comments')
    .select('id, content, created_at, user_id, target_type, target_id, users(username, avatar_emoji)')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
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
  await assertConnected(userId, ownerId)

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

  if (userId !== ownerId) {
    try {
      const { data: actor } = await supabase
        .from('users')
        .select('username')
        .eq('id', userId)
        .single()
      const username = actor?.username || 'Someone'
      await createNotification(ownerId, 'reaction', `${username} reacted ${reactionType} to your ${targetType.replace('_', ' ')}`, {
        actorId: userId,
        targetType,
        targetId,
        reactionType,
      })
    } catch (_) { /* notification is best-effort */ }
  }

  return { toggled: 'on' }
}

export async function getFeedReactionsBatch(items) {
  if (!items?.length) return {}

  // Build OR filter for all target_type + target_id pairs
  const orFilter = items.map((i) => `and(target_type.eq.${i.target_type},target_id.eq.${i.target_id})`).join(',')

  const { data, error } = await supabase
    .from('feed_reactions')
    .select('target_type, target_id, reaction_type, user_id, users(username)')
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
    })
  }

  const mapped = {}
  for (const key of Object.keys(result)) {
    mapped[key] = Object.values(result[key])
  }
  return mapped
}
