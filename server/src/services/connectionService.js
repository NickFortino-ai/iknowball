import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

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

  return connectUsers(senderId, recipient.id, 'manual_request')
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
    .select('id, username, avatar_emoji')
    .in('id', connectedIds)

  const userMap = {}
  for (const u of users || []) {
    userMap[u.id] = u
  }

  // Query 3 sources in parallel
  const [underdogWins, hotStreaks, tierAchievements] = await Promise.all([
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

    // Source 2: Hot streaks (current_streak >= 5)
    supabase
      .from('user_sport_stats')
      .select('user_id, current_streak, sport_id, sports(name)')
      .in('user_id', connectedIds)
      .gte('current_streak', 5),

    // Source 3: Tier achievements (non-Rookie, updated recently)
    supabase
      .from('users')
      .select('id, tier, updated_at')
      .in('id', connectedIds)
      .neq('tier', 'Rookie')
      .gte('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
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

  // Process hot streaks
  for (const stat of hotStreaks.data || []) {
    const user = userMap[stat.user_id]
    if (!user) continue
    feed.push({
      type: 'hot_streak',
      userId: stat.user_id,
      username: user.username,
      avatar_emoji: user.avatar_emoji,
      message: `is on a ${stat.current_streak}-game streak`,
      timestamp: new Date().toISOString(),
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

  // Sort by timestamp desc, limit 15
  feed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  return feed.slice(0, 15)
}
