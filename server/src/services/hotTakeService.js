import { supabase } from '../config/supabase.js'
import { assertConnected } from './socialService.js'
import { createNotification } from './notificationService.js'

export async function createHotTake(userId, content, teamTags, imageUrl) {
  const { data, error } = await supabase
    .from('hot_takes')
    .insert({ user_id: userId, content, team_tags: teamTags?.length ? teamTags : null, image_url: imageUrl || null })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getHotTakesByUser(userId) {
  const { data, error } = await supabase
    .from('hot_takes')
    .select('id, content, team_tags, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function createReminder(actorId, hotTakeId) {
  // Fetch the hot take
  const { data: hotTake } = await supabase
    .from('hot_takes')
    .select('id, user_id, content')
    .eq('id', hotTakeId)
    .single()

  if (!hotTake) {
    const err = new Error('Hot take not found')
    err.status = 404
    throw err
  }

  // Prevent self-remind
  if (hotTake.user_id === actorId) {
    const err = new Error('You cannot remind yourself of your own hot take')
    err.status = 400
    throw err
  }

  // Must be connected (squad members only)
  await assertConnected(actorId, hotTake.user_id)

  // Insert reminder
  const { data, error } = await supabase
    .from('hot_take_reminders')
    .insert({ reminder_user_id: actorId, hot_take_id: hotTakeId })
    .select()
    .single()

  if (error) throw error

  // Notify the take author
  try {
    const { data: actor } = await supabase
      .from('users')
      .select('username')
      .eq('id', actorId)
      .single()
    const username = actor?.username || 'Someone'
    await createNotification(hotTake.user_id, 'hot_take_reminder', `${username} reminded you of your hot take`, {
      actorId,
      hotTakeId,
    })
  } catch (_) { /* notification is best-effort */ }

  return data
}

export async function askForHotTakes(actorId, targetUserId) {
  if (actorId === targetUserId) {
    const err = new Error('You cannot ask yourself for hot takes')
    err.status = 400
    throw err
  }

  const { data: actor } = await supabase
    .from('users')
    .select('username')
    .eq('id', actorId)
    .single()

  const username = actor?.username || 'Someone'

  await createNotification(targetUserId, 'hot_take_ask', `@${username} wants to hear your hot takes!`, {
    actorId,
  })

  return { success: true }
}

export async function updateHotTake(userId, hotTakeId, content, teamTags, imageUrl) {
  const { data: hotTake } = await supabase
    .from('hot_takes')
    .select('id, user_id')
    .eq('id', hotTakeId)
    .single()

  if (!hotTake) {
    const err = new Error('Hot take not found')
    err.status = 404
    throw err
  }

  if (hotTake.user_id !== userId) {
    const err = new Error('You can only edit your own hot takes')
    err.status = 403
    throw err
  }

  const { data, error } = await supabase
    .from('hot_takes')
    .update({ content, team_tags: teamTags?.length ? teamTags : null, image_url: imageUrl || null })
    .eq('id', hotTakeId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteHotTake(userId, hotTakeId) {
  const { data: hotTake } = await supabase
    .from('hot_takes')
    .select('id, user_id')
    .eq('id', hotTakeId)
    .single()

  if (!hotTake) {
    const err = new Error('Hot take not found')
    err.status = 404
    throw err
  }

  if (hotTake.user_id !== userId) {
    const err = new Error('You can only delete your own hot takes')
    err.status = 403
    throw err
  }

  const { error } = await supabase.from('hot_takes').delete().eq('id', hotTakeId)
  if (error) throw error
}
