import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from './notificationService.js'
import { getPronouns } from '../utils/pronouns.js'

export async function connectUsers(userA, userB, source) {
  // Canonicalize ordering so user_id_1 < user_id_2
  const user_id_1 = userA < userB ? userA : userB
  const user_id_2 = userA < userB ? userB : userA

  const row = {
    user_id_1,
    user_id_2,
    source,
    status: source === 'league_auto' ? 'connected' : 'pending',
    requested_by: source === 'manual_request' ? userA : null,
  }

  // Upsert — if already exists, don't downgrade 'connected' to 'pending'
  const { data, error } = await supabase
    .from('connections')
    .upsert(row, { onConflict: 'user_id_1,user_id_2', ignoreDuplicates: true })
    .select()
    .single()

  if (error) {
    // ignoreDuplicates returns no rows on conflict — that's fine
    if (error.code === 'PGRST116') return null
    logger.error({ error }, 'Failed to upsert connection')
    throw error
  }

  return data
}

export async function connectLeagueMembers(userId, leagueId) {
  const { data: members, error } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)
    .neq('user_id', userId)

  if (error || !members?.length) return

  for (const member of members) {
    try {
      await connectUsers(userId, member.user_id, 'league_auto')
    } catch (err) {
      logger.error({ err, userId, memberId: member.user_id }, 'Failed to auto-connect league member')
    }
  }
}

export async function getMyConnections(userId) {
  const { data, error } = await supabase
    .from('connections')
    .select(`
      id,
      user_id_1,
      user_id_2,
      source,
      created_at
    `)
    .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
    .eq('status', 'connected')

  if (error) throw error
  if (!data?.length) return []

  // Get the other user's ID for each connection
  const otherUserIds = data.map((c) => c.user_id_1 === userId ? c.user_id_2 : c.user_id_1)

  // Get user details
  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_emoji, total_points, tier, updated_at')
    .in('id', otherUserIds)

  // Get max current_streak per user
  const { data: stats } = await supabase
    .from('user_sport_stats')
    .select('user_id, current_streak')
    .in('user_id', otherUserIds)

  const streakMap = {}
  for (const s of stats || []) {
    if (!streakMap[s.user_id] || s.current_streak > streakMap[s.user_id]) {
      streakMap[s.user_id] = s.current_streak
    }
  }

  const userMap = {}
  for (const u of users || []) {
    userMap[u.id] = u
  }

  return data
    .map((c) => {
      const otherId = c.user_id_1 === userId ? c.user_id_2 : c.user_id_1
      const user = userMap[otherId]
      if (!user) return null
      return {
        connection_id: c.id,
        user_id: otherId,
        username: user.username,
        display_name: user.display_name,
        avatar_emoji: user.avatar_emoji,
        total_points: user.total_points,
        tier: user.tier,
        current_streak: streakMap[otherId] || 0,
        updated_at: user.updated_at,
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
}

export async function getPendingRequests(userId) {
  const { data, error } = await supabase
    .from('connections')
    .select('id, user_id_1, user_id_2, requested_by, created_at')
    .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
    .eq('status', 'pending')
    .neq('requested_by', userId)

  if (error) throw error
  if (!data?.length) return []

  const requesterIds = data.map((c) => c.requested_by)

  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_emoji')
    .in('id', requesterIds)

  const userMap = {}
  for (const u of users || []) {
    userMap[u.id] = u
  }

  return data.map((c) => ({
    id: c.id,
    requester: userMap[c.requested_by] || null,
    created_at: c.created_at,
  }))
}

export async function sendConnectionRequest(senderId, username) {
  // Look up recipient
  const { data: recipient } = await supabase
    .from('users')
    .select('id, username')
    .eq('username', username)
    .single()

  if (!recipient) {
    const err = new Error('User not found')
    err.status = 404
    throw err
  }

  if (recipient.id === senderId) {
    const err = new Error('You cannot connect with yourself')
    err.status = 400
    throw err
  }

  // Check if already connected
  const user_id_1 = senderId < recipient.id ? senderId : recipient.id
  const user_id_2 = senderId < recipient.id ? recipient.id : senderId

  const { data: existing } = await supabase
    .from('connections')
    .select('id, status')
    .eq('user_id_1', user_id_1)
    .eq('user_id_2', user_id_2)
    .single()

  if (existing?.status === 'connected') {
    const err = new Error('You are already connected with this user')
    err.status = 400
    throw err
  }

  if (existing?.status === 'pending') {
    const err = new Error('A connection request is already pending')
    err.status = 400
    throw err
  }

  const connection = await connectUsers(senderId, recipient.id, 'manual_request')

  // Get sender username for notification
  const { data: sender } = await supabase
    .from('users')
    .select('username')
    .eq('id', senderId)
    .single()

  if (sender) {
    await createNotification(
      recipient.id,
      'connection_request',
      `@${sender.username} sent you a connection request`,
      { actorId: senderId, connectionId: connection?.id }
    )
  }

  return connection
}

export async function acceptConnectionRequest(connectionId, userId) {
  const { data: connection } = await supabase
    .from('connections')
    .select('*')
    .eq('id', connectionId)
    .single()

  if (!connection) {
    const err = new Error('Connection request not found')
    err.status = 404
    throw err
  }

  if (connection.status !== 'pending') {
    const err = new Error('This request is no longer pending')
    err.status = 400
    throw err
  }

  // Verify userId is the recipient (not the requester)
  if (connection.requested_by === userId) {
    const err = new Error('You cannot accept your own request')
    err.status = 400
    throw err
  }

  if (connection.user_id_1 !== userId && connection.user_id_2 !== userId) {
    const err = new Error('Connection request not found')
    err.status = 404
    throw err
  }

  const { data, error } = await supabase
    .from('connections')
    .update({ status: 'connected' })
    .eq('id', connectionId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function declineConnectionRequest(connectionId, userId) {
  const { data: connection } = await supabase
    .from('connections')
    .select('*')
    .eq('id', connectionId)
    .single()

  if (!connection) {
    const err = new Error('Connection request not found')
    err.status = 404
    throw err
  }

  if (connection.status !== 'pending') {
    const err = new Error('This request is no longer pending')
    err.status = 400
    throw err
  }

  if (connection.requested_by === userId) {
    const err = new Error('You cannot decline your own request')
    err.status = 400
    throw err
  }

  if (connection.user_id_1 !== userId && connection.user_id_2 !== userId) {
    const err = new Error('Connection request not found')
    err.status = 404
    throw err
  }

  const { error } = await supabase
    .from('connections')
    .delete()
    .eq('id', connectionId)

  if (error) throw error
}

export async function getConnectionActivity(userId) {
  // Get connected user IDs
  const { data: connections } = await supabase
    .from('connections')
    .select('user_id_1, user_id_2')
    .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
    .eq('status', 'connected')

  if (!connections?.length) return []

  const connectedIds = connections.map((c) =>
    c.user_id_1 === userId ? c.user_id_2 : c.user_id_1
  )

  // Get user details for mapping
  const { data: users } = await supabase
    .from('users')
    .select('id, username, avatar_emoji, title_preference')
    .in('id', connectedIds)

  const userMap = {}
  for (const u of users || []) {
    userMap[u.id] = u
  }

  // Query 4 sources in parallel
  const [underdogWins, streakEvents, tierAchievements, pickShares, recentComments] = await Promise.all([
    // Source 1: Big underdog wins (odds >= +250)
    supabase
      .from('picks')
      .select('id, user_id, odds_at_pick, points_earned, updated_at, games(home_team, away_team, picked_team)')
      .in('user_id', connectedIds)
      .eq('status', 'settled')
      .eq('is_correct', true)
      .gte('odds_at_pick', 250)
      .order('updated_at', { ascending: false })
      .limit(15),

    // Source 2: Streak events (replaces static hot_streak snapshot)
    supabase
      .from('streak_events')
      .select('user_id, streak_length, created_at, sports(name)')
      .in('user_id', connectedIds)
      .order('created_at', { ascending: false })
      .limit(15),

    // Source 3: Tier achievements (non-Rookie, updated recently)
    supabase
      .from('users')
      .select('id, tier, updated_at')
      .in('id', connectedIds)
      .neq('tier', 'Rookie')
      .gte('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),

    // Source 4: Pick shares
    supabase
      .from('pick_shares')
      .select('id, pick_id, user_id, created_at, picks(picked_team, odds_at_pick, games(home_team, away_team, starts_at, sports(name)))')
      .in('user_id', connectedIds)
      .order('created_at', { ascending: false })
      .limit(15),

    // Source 5: Recent comments from connected users
    supabase
      .from('pick_comments')
      .select('id, pick_id, user_id, content, created_at')
      .in('user_id', connectedIds)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(15),
  ])

  const feed = []

  // Process underdog wins
  for (const pick of underdogWins.data || []) {
    const user = userMap[pick.user_id]
    if (!user) continue
    const odds = pick.odds_at_pick >= 0 ? `+${pick.odds_at_pick}` : pick.odds_at_pick
    feed.push({
      type: 'underdog_win',
      userId: pick.user_id,
      pickId: pick.id,
      username: user.username,
      avatar_emoji: user.avatar_emoji,
      message: `hit a ${odds} pick for +${pick.points_earned} pts`,
      timestamp: pick.updated_at,
    })
  }

  // Process streak events
  for (const event of streakEvents.data || []) {
    const user = userMap[event.user_id]
    if (!user) continue
    const sportName = event.sports?.name || 'a sport'
    feed.push({
      type: 'hot_streak',
      userId: event.user_id,
      username: user.username,
      avatar_emoji: user.avatar_emoji,
      message: `just extended ${getPronouns(user.title_preference).possessive} streak to ${event.streak_length} in ${sportName}`,
      timestamp: event.created_at,
    })
  }

  // Process tier achievements
  for (const u of tierAchievements.data || []) {
    const user = userMap[u.id]
    if (!user) continue
    feed.push({
      type: 'tier_achievement',
      userId: u.id,
      username: user.username,
      avatar_emoji: user.avatar_emoji,
      message: `reached ${u.tier} tier`,
      timestamp: u.updated_at,
    })
  }

  // Process pick shares
  for (const share of pickShares.data || []) {
    const user = userMap[share.user_id]
    if (!user || !share.picks) continue
    const pick = share.picks
    const team = pick.picked_team === 'home' ? pick.games?.home_team : pick.games?.away_team
    const odds = pick.odds_at_pick >= 0 ? `+${pick.odds_at_pick}` : pick.odds_at_pick
    const sportName = pick.games?.sports?.name || ''
    feed.push({
      type: 'pick_share',
      userId: share.user_id,
      pickId: share.pick_id,
      username: user.username,
      avatar_emoji: user.avatar_emoji,
      message: `is taking ${team} ${odds} in ${sportName}`,
      timestamp: share.created_at,
    })
  }

  // Process recent comments (batch fetch pick owners)
  const commentData = recentComments.data || []
  if (commentData.length > 0) {
    const commentPickIds = [...new Set(commentData.map((c) => c.pick_id))]
    const { data: commentPicks } = await supabase
      .from('picks')
      .select('id, user_id, users(username)')
      .in('id', commentPickIds)

    const pickOwnerMap = {}
    for (const p of commentPicks || []) {
      pickOwnerMap[p.id] = p
    }

    for (const comment of commentData) {
      const user = userMap[comment.user_id]
      if (!user) continue

      const pick = pickOwnerMap[comment.pick_id]
      if (!pick) continue

      const ownerName = pick.user_id === comment.user_id
        ? `${getPronouns(user.title_preference).possessive} own`
        : pick.users?.username
          ? `@${pick.users.username}'s`
          : "a"

      feed.push({
        type: 'comment',
        userId: comment.user_id,
        pickId: comment.pick_id,
        username: user.username,
        avatar_emoji: user.avatar_emoji,
        message: `commented on ${ownerName} pick`,
        timestamp: comment.created_at,
      })
    }
  }

  // Sort by timestamp desc, limit 15
  feed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  return feed.slice(0, 15)
}

export async function getConnectionStatus(userId, otherUserId) {
  const user_id_1 = userId < otherUserId ? userId : otherUserId
  const user_id_2 = userId < otherUserId ? otherUserId : userId

  const { data } = await supabase
    .from('connections')
    .select('status, requested_by')
    .eq('user_id_1', user_id_1)
    .eq('user_id_2', user_id_2)
    .single()

  if (!data) return { status: 'none' }

  if (data.status === 'connected') return { status: 'connected' }

  // Pending — distinguish who sent the request
  if (data.requested_by === userId) return { status: 'pending_sent' }
  return { status: 'pending_received' }
}

export async function sharePickToSquad(userId, pickId) {
  // Verify pick exists and belongs to user
  const { data: pick } = await supabase
    .from('picks')
    .select('id, user_id, status')
    .eq('id', pickId)
    .single()

  if (!pick) {
    const err = new Error('Pick not found')
    err.status = 404
    throw err
  }

  if (pick.user_id !== userId) {
    const err = new Error('You can only share your own picks')
    err.status = 403
    throw err
  }

  if (pick.status === 'settled') {
    const err = new Error('Cannot share a settled pick')
    err.status = 400
    throw err
  }

  // Check if already shared
  const { data: existing } = await supabase
    .from('pick_shares')
    .select('id')
    .eq('pick_id', pickId)
    .single()

  if (existing) {
    const err = new Error('Pick already shared')
    err.status = 400
    throw err
  }

  const { data, error } = await supabase
    .from('pick_shares')
    .insert({ pick_id: pickId, user_id: userId })
    .select()
    .single()

  if (error) throw error
  return data
}
