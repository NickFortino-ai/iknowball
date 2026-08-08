import { supabase } from '../config/supabase.js'
import { assertConnected } from './socialService.js'
import { checkUserMuted, checkContent } from './contentFilterService.js'

export async function sendMessage(senderId, receiverId, content) {
  if (await checkUserMuted(senderId)) {
    const err = new Error('Your messaging privileges have been suspended')
    err.status = 403
    throw err
  }

  const filterResult = await checkContent(content)
  if (filterResult.blocked) {
    const err = new Error('Your message contains inappropriate language. Please revise and try again.')
    err.status = 400
    throw err
  }

  await assertConnected(senderId, receiverId)

  // Dedupe: reject identical message within 30 seconds
  const thirtySecsAgo = new Date(Date.now() - 30_000).toISOString()
  const { data: recent } = await supabase
    .from('direct_messages')
    .select('id, content, sender_id, receiver_id, created_at')
    .eq('sender_id', senderId)
    .eq('receiver_id', receiverId)
    .eq('content', content)
    .gte('created_at', thirtySecsAgo)
    .limit(1)

  if (recent?.length) return recent[0]

  const { data, error } = await supabase
    .from('direct_messages')
    .insert({ sender_id: senderId, receiver_id: receiverId, content })
    .select('id, content, sender_id, receiver_id, created_at')
    .single()

  if (error) throw error

  // Intentionally no notification here — the messages inbox has its own
  // unread indicator on the chat icon, which is where users will look.
  // Adding a bell notification too made every DM double-notify.

  return data
}

export async function getConversations(userId) {
  // Aggregation in the DB via the get_conversations_for_user RPC (see
  // migration 263). Returns exactly one row per partner — no message-
  // count-based cap, so chatty pairs can't push older partners off the
  // sidebar. Rows already come back ordered by last_message_at DESC.
  const { data: convoRows, error } = await supabase
    .rpc('get_conversations_for_user', { p_user_id: userId })

  if (error) throw error
  if (!convoRows?.length) return []

  const partnerIds = convoRows.map((r) => r.partner_id)
  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji')
    .in('id', partnerIds)

  const userMap = {}
  for (const u of users || []) userMap[u.id] = u

  return convoRows.map((r) => {
    const user = userMap[r.partner_id]
    return {
      partnerId: r.partner_id,
      lastMessage: r.last_message,
      lastMessageAt: r.last_message_at,
      unreadCount: Number(r.unread_count) || 0,
      username: user?.username,
      displayName: user?.display_name,
      avatarUrl: user?.avatar_url,
      avatarEmoji: user?.avatar_emoji,
    }
  })
}

export async function getThread(userId, partnerId, before = null) {
  await assertConnected(userId, partnerId)

  // Fetch partner profile
  const { data: partner } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji')
    .eq('id', partnerId)
    .single()

  let query = supabase
    .from('direct_messages')
    .select('id, sender_id, receiver_id, content, read_at, created_at')
    .or(
      `and(sender_id.eq.${userId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${userId})`
    )
    .order('created_at', { ascending: false })
    .limit(50)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data, error } = await query
  if (error) throw error

  const messages = (data || []).reverse()
  const nextCursor = data?.length === 50 ? data[data.length - 1].created_at : null

  return { partner, messages, nextCursor }
}

export async function markThreadRead(userId, partnerId) {
  const { error, count } = await supabase
    .from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('receiver_id', userId)
    .eq('sender_id', partnerId)
    .is('read_at', null)

  if (error) throw error
  return { marked: count || 0 }
}

export async function getUnreadMessageCount(userId) {
  const { count, error } = await supabase
    .from('direct_messages')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', userId)
    .is('read_at', null)

  if (error) throw error
  return count || 0
}
