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
  // Fetch recent messages involving this user
  const { data: messages, error } = await supabase
    .from('direct_messages')
    .select('id, sender_id, receiver_id, content, read_at, created_at')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw error
  if (!messages?.length) return []

  // Group by partner, keep latest message + unread count
  const convos = {}
  for (const m of messages) {
    const partnerId = m.sender_id === userId ? m.receiver_id : m.sender_id
    if (!convos[partnerId]) {
      convos[partnerId] = {
        partnerId,
        lastMessage: m.content,
        lastMessageAt: m.created_at,
        unreadCount: 0,
      }
    }
    if (m.receiver_id === userId && !m.read_at) {
      convos[partnerId].unreadCount++
    }
  }

  // Fetch partner profiles
  const partnerIds = Object.keys(convos)
  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji')
    .in('id', partnerIds)

  const userMap = {}
  for (const u of users || []) userMap[u.id] = u

  return Object.values(convos)
    .map((c) => {
      const user = userMap[c.partnerId]
      return {
        ...c,
        username: user?.username,
        displayName: user?.display_name,
        avatarUrl: user?.avatar_url,
        avatarEmoji: user?.avatar_emoji,
      }
    })
    .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
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
