import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

export async function createNotification(userId, type, message, metadata = {}) {
  // Self-notification guard
  if (metadata.actorId === userId) return null

  const { data, error } = await supabase
    .from('notifications')
    .insert({ user_id: userId, type, message, metadata })
    .select()
    .single()

  if (error) {
    logger.error({ error, userId, type }, 'Failed to create notification')
    return null
  }

  return data
}

export async function getNotifications(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw error
  return data || []
}

export async function getUnreadCount(userId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) throw error
  return count || 0
}

export async function markAllRead(userId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) throw error
}

export async function markRead(userId, notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId)

  if (error) throw error
}
