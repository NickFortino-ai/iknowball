import { supabase } from '../config/supabase.js'
import { assertConnected } from './socialService.js'
import { createNotification } from './notificationService.js'

export async function createHotTake(userId, content, teamTags, sportKey, imageUrl, userTags, videoUrl, imageUrls) {
  // Support both single image_url and multi image_urls
  const resolvedImageUrls = imageUrls?.length ? imageUrls : imageUrl ? [imageUrl] : null
  const { data, error } = await supabase
    .from('hot_takes')
    .insert({ user_id: userId, content, team_tags: teamTags?.length ? teamTags : null, sport_key: sportKey || null, image_url: resolvedImageUrls?.[0] || null, image_urls: resolvedImageUrls, user_tags: userTags?.length ? userTags : null, video_url: videoUrl || null })
    .select()
    .single()

  if (error) throw error

  // Notify tagged users (best-effort)
  if (userTags?.length) {
    try {
      const { data: actor } = await supabase
        .from('users')
        .select('username')
        .eq('id', userId)
        .single()
      const username = actor?.username || 'Someone'
      for (const taggedId of userTags) {
        if (taggedId === userId) continue
        await createNotification(taggedId, 'hot_take_callout', `@${username} called you out in a hot take`, {
          actorId: userId,
          hotTakeId: data.id,
        })
      }
    } catch (_) { /* notification is best-effort */ }
  }

  return data
}

export async function getHotTakesByUser(userId) {
  const { data, error } = await supabase
    .from('hot_takes')
    .select('id, content, team_tags, user_tags, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function createReminder(actorId, hotTakeId, comment) {
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

  const isSelfRemind = hotTake.user_id === actorId

  // Must be connected (squad members only) — skip for self-remind
  if (!isSelfRemind) {
    await assertConnected(actorId, hotTake.user_id)
  }

  // Insert reminder
  const { data, error } = await supabase
    .from('hot_take_reminders')
    .insert({ reminder_user_id: actorId, hot_take_id: hotTakeId, comment: comment || null })
    .select()
    .single()

  if (error) throw error

  // Notify the take author (skip for self-remind)
  if (!isSelfRemind) {
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
  }

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

export async function updateHotTake(userId, hotTakeId, content, teamTags, sportKey, imageUrl, userTags, videoUrl, imageUrls) {
  const { data: hotTake } = await supabase
    .from('hot_takes')
    .select('id, user_id, user_tags')
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
    .update({ content, team_tags: teamTags?.length ? teamTags : null, sport_key: sportKey || null, image_url: (imageUrls?.length ? imageUrls[0] : imageUrl) || null, image_urls: imageUrls?.length ? imageUrls : imageUrl ? [imageUrl] : null, user_tags: userTags?.length ? userTags : null, video_url: videoUrl || null })
    .eq('id', hotTakeId)
    .select()
    .single()

  if (error) throw error

  // Notify only newly tagged users (best-effort)
  if (userTags?.length) {
    try {
      const previousTags = new Set(hotTake.user_tags || [])
      const newlyTagged = userTags.filter((id) => !previousTags.has(id) && id !== userId)
      if (newlyTagged.length > 0) {
        const { data: actor } = await supabase
          .from('users')
          .select('username')
          .eq('id', userId)
          .single()
        const username = actor?.username || 'Someone'
        for (const taggedId of newlyTagged) {
          await createNotification(taggedId, 'hot_take_callout', `@${username} called you out in a hot take`, {
            actorId: userId,
            hotTakeId,
          })
        }
      }
    } catch (_) { /* notification is best-effort */ }
  }

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
