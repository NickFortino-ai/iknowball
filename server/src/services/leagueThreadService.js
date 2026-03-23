import { supabase } from '../config/supabase.js'
import { checkUserMuted, checkContent } from './contentFilterService.js'
import { createNotification } from './notificationService.js'
import { logger } from '../utils/logger.js'

const PAGE_SIZE = 50

export async function getThreadMessages(leagueId, userId, before = null) {
  // Verify membership
  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!member) {
    const err = new Error('You are not a member of this league')
    err.status = 403
    throw err
  }

  let query = supabase
    .from('league_messages')
    .select('id, league_id, user_id, content, user_tags, created_at')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data: messages, error } = await query
  if (error) throw error

  const hasMore = messages.length > PAGE_SIZE
  const page = hasMore ? messages.slice(0, PAGE_SIZE) : messages
  const nextCursor = hasMore ? page[page.length - 1].created_at : null

  // Fetch user profiles for message authors
  const userIds = [...new Set(page.map((m) => m.user_id))]
  const taggedIds = [...new Set(page.flatMap((m) => m.user_tags || []))]
  const allIds = [...new Set([...userIds, ...taggedIds])]

  let userMap = {}
  if (allIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, avatar_emoji')
      .in('id', allIds)

    for (const u of (users || [])) {
      userMap[u.id] = u
    }
  }

  const enriched = page.reverse().map((m) => ({
    ...m,
    user: userMap[m.user_id] || null,
    tagged_users: (m.user_tags || []).map((id) => userMap[id]).filter(Boolean),
  }))

  return { messages: enriched, nextCursor }
}

export async function postThreadMessage(leagueId, userId, content, userTags = []) {
  if (await checkUserMuted(userId)) {
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

  // Verify membership
  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!member) {
    const err = new Error('You are not a member of this league')
    err.status = 403
    throw err
  }

  // Check league not completed
  const { data: league } = await supabase
    .from('leagues')
    .select('status, name')
    .eq('id', leagueId)
    .single()

  if (league?.status === 'completed') {
    const err = new Error('This league thread is archived')
    err.status = 400
    throw err
  }

  const { data: message, error } = await supabase
    .from('league_messages')
    .insert({
      league_id: leagueId,
      user_id: userId,
      content,
      user_tags: userTags.length > 0 ? userTags : null,
    })
    .select('id, league_id, user_id, content, user_tags, created_at')
    .single()

  if (error) throw error

  // Fetch author profile
  const { data: author } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji')
    .eq('id', userId)
    .single()

  // Notify tagged users (best-effort)
  if (userTags.length > 0) {
    const authorName = author?.display_name || author?.username || 'Someone'
    for (const taggedId of userTags) {
      if (taggedId === userId) continue
      try {
        await createNotification(taggedId, 'league_thread_mention',
          `${authorName} mentioned you in ${league?.name || 'a league'} thread`,
          { actorId: userId, leagueId, messageId: message.id })
      } catch (err) {
        logger.error({ err, taggedId }, 'Failed to send thread mention notification')
      }
    }
  }

  return { ...message, user: author, tagged_users: [] }
}

export async function markThreadRead(leagueId, userId) {
  await supabase
    .from('league_thread_reads')
    .upsert({ league_id: leagueId, user_id: userId, last_read_at: new Date().toISOString() }, { onConflict: 'league_id,user_id' })
}

export async function hasUnreadMessages(leagueId, userId) {
  // Get last read timestamp
  const { data: readRecord } = await supabase
    .from('league_thread_reads')
    .select('last_read_at')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()

  // Get latest message (not from this user)
  let query = supabase
    .from('league_messages')
    .select('created_at')
    .eq('league_id', leagueId)
    .neq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (readRecord?.last_read_at) {
    query = supabase
      .from('league_messages')
      .select('created_at')
      .eq('league_id', leagueId)
      .neq('user_id', userId)
      .gt('created_at', readRecord.last_read_at)
      .limit(1)
      .maybeSingle()
  }

  const { data: unread } = await query
  return !!unread
}
