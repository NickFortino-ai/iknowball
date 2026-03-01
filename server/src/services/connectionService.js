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
    .sort((a, b) => (b.total_points || 0) - (a.total_points || 0))
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
    .select('id, username, display_name, avatar_emoji, title_preference')
    .in('id', connectedIds)

  const userMap = {}
  for (const u of users || []) {
    userMap[u.id] = u
  }

  // Query 7 sources in parallel
  const [notablePicks, settledParlays, streakEvents, tierAchievements, recordsBroken, pickShares, recentComments] = await Promise.all([
    // Source 1: Notable picks — settled + correct where odds >= 250 OR multiplier > 1
    supabase
      .from('picks')
      .select('id, user_id, picked_team, odds_at_pick, status, is_correct, points_earned, multiplier, risk_points, reward_points, updated_at, games(home_team, away_team, sports(name))')
      .in('user_id', connectedIds)
      .eq('status', 'settled')
      .eq('is_correct', true)
      .or('odds_at_pick.gte.250,multiplier.gt.1')
      .order('updated_at', { ascending: false })
      .limit(15),

    // Source 2: Settled parlays
    supabase
      .from('parlays')
      .select('id, user_id, leg_count, combined_multiplier, status, is_correct, points_earned, risk_points, reward_points, updated_at, parlay_legs(picked_team, odds_at_submission, status, games(home_team, away_team, sports(name)))')
      .in('user_id', connectedIds)
      .eq('status', 'settled')
      .order('updated_at', { ascending: false })
      .limit(15),

    // Source 3: Streak events
    supabase
      .from('streak_events')
      .select('id, user_id, streak_length, created_at, sports(key, name)')
      .in('user_id', connectedIds)
      .order('created_at', { ascending: false })
      .limit(15),

    // Source 4: Tier achievements (non-Rookie, updated recently)
    supabase
      .from('users')
      .select('id, tier, updated_at')
      .in('id', connectedIds)
      .neq('tier', 'Rookie')
      .gte('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),

    // Source 5: Record broken
    supabase
      .from('record_history')
      .select('id, record_key, new_holder_id, previous_holder_id, previous_value, new_value, broken_at, records(display_name)')
      .in('new_holder_id', connectedIds)
      .order('broken_at', { ascending: false })
      .limit(10),

    // Source 6: Pick shares
    supabase
      .from('pick_shares')
      .select('id, pick_id, user_id, created_at, picks(picked_team, odds_at_pick, status, is_correct, points_earned, multiplier, risk_points, reward_points, games(home_team, away_team, sports(name)))')
      .in('user_id', connectedIds)
      .order('created_at', { ascending: false })
      .limit(15),

    // Source 7: Recent comments from connected users
    supabase
      .from('comments')
      .select('id, target_type, target_id, user_id, content, created_at')
      .in('user_id', connectedIds)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(15),
  ])

  const feed = []

  function buildPickedTeamName(pickedTeam, game) {
    return pickedTeam === 'home' ? game?.home_team : game?.away_team
  }

  // Process notable picks
  for (const pick of notablePicks.data || []) {
    const user = userMap[pick.user_id]
    if (!user) continue
    feed.push({
      type: 'pick',
      id: pick.id,
      userId: pick.user_id,
      username: user.username,
      display_name: user.display_name,
      avatar_emoji: user.avatar_emoji,
      timestamp: pick.updated_at,
      pick: {
        id: pick.id,
        picked_team: pick.picked_team,
        picked_team_name: buildPickedTeamName(pick.picked_team, pick.games),
        odds_at_pick: pick.odds_at_pick,
        status: pick.status,
        is_correct: pick.is_correct,
        points_earned: pick.points_earned,
        multiplier: pick.multiplier,
        risk_points: pick.risk_points,
        reward_points: pick.reward_points,
      },
      game: {
        home_team: pick.games?.home_team,
        away_team: pick.games?.away_team,
        sport_name: pick.games?.sports?.name,
      },
    })
  }

  // Process settled parlays
  for (const parlay of settledParlays.data || []) {
    const user = userMap[parlay.user_id]
    if (!user) continue
    feed.push({
      type: 'parlay',
      id: parlay.id,
      userId: parlay.user_id,
      username: user.username,
      display_name: user.display_name,
      avatar_emoji: user.avatar_emoji,
      timestamp: parlay.updated_at,
      parlay: {
        id: parlay.id,
        leg_count: parlay.leg_count,
        combined_multiplier: parlay.combined_multiplier,
        status: parlay.status,
        is_correct: parlay.is_correct,
        points_earned: parlay.points_earned,
        risk_points: parlay.risk_points,
        reward_points: parlay.reward_points,
        legs: (parlay.parlay_legs || []).map((leg) => ({
          picked_team_name: buildPickedTeamName(leg.picked_team, leg.games),
          sport_name: leg.games?.sports?.name,
          odds: leg.odds_at_submission,
          status: leg.status,
          home_team: leg.games?.home_team,
          away_team: leg.games?.away_team,
        })),
      },
    })
  }

  // Process streak events
  for (const event of streakEvents.data || []) {
    const user = userMap[event.user_id]
    if (!user) continue
    feed.push({
      type: 'streak',
      id: event.id,
      userId: event.user_id,
      username: user.username,
      display_name: user.display_name,
      avatar_emoji: user.avatar_emoji,
      timestamp: event.created_at,
      streak: {
        id: event.id,
        streak_length: event.streak_length,
        sport_name: event.sports?.name,
      },
    })
  }

  // Process tier achievements
  for (const u of tierAchievements.data || []) {
    const user = userMap[u.id]
    if (!user) continue
    feed.push({
      type: 'tier_up',
      id: `tier-${u.id}-${u.updated_at}`,
      userId: u.id,
      username: user.username,
      display_name: user.display_name,
      avatar_emoji: user.avatar_emoji,
      timestamp: u.updated_at,
      tier: { name: u.tier },
    })
  }

  // Process records broken
  for (const record of recordsBroken.data || []) {
    const user = userMap[record.new_holder_id]
    if (!user) continue
    // Fetch previous holder username if exists
    let previous_holder_username = null
    if (record.previous_holder_id) {
      const prevUser = userMap[record.previous_holder_id]
      if (prevUser) {
        previous_holder_username = prevUser.username
      } else {
        const { data: prevUserData } = await supabase
          .from('users')
          .select('username')
          .eq('id', record.previous_holder_id)
          .single()
        previous_holder_username = prevUserData?.username
      }
    }
    feed.push({
      type: 'record',
      id: record.id,
      userId: record.new_holder_id,
      username: user.username,
      display_name: user.display_name,
      avatar_emoji: user.avatar_emoji,
      timestamp: record.broken_at,
      record: {
        id: record.id,
        display_name: record.records?.display_name,
        new_value: record.new_value,
        previous_value: record.previous_value,
        previous_holder_username,
        record_key: record.record_key,
      },
    })
  }

  // Process pick shares
  for (const share of pickShares.data || []) {
    const user = userMap[share.user_id]
    if (!user || !share.picks) continue
    const pick = share.picks
    feed.push({
      type: 'pick',
      id: share.pick_id,
      userId: share.user_id,
      username: user.username,
      display_name: user.display_name,
      avatar_emoji: user.avatar_emoji,
      timestamp: share.created_at,
      pick: {
        id: share.pick_id,
        picked_team: pick.picked_team,
        picked_team_name: buildPickedTeamName(pick.picked_team, pick.games),
        odds_at_pick: pick.odds_at_pick,
        status: pick.status,
        is_correct: pick.is_correct,
        points_earned: pick.points_earned,
        multiplier: pick.multiplier,
        risk_points: pick.risk_points,
        reward_points: pick.reward_points,
      },
      game: {
        home_team: pick.games?.home_team,
        away_team: pick.games?.away_team,
        sport_name: pick.games?.sports?.name,
      },
    })
  }

  // Process recent comments (batch fetch target owners by type)
  const commentData = recentComments.data || []
  if (commentData.length > 0) {
    const targetsByType = {}
    for (const c of commentData) {
      if (!targetsByType[c.target_type]) targetsByType[c.target_type] = new Set()
      targetsByType[c.target_type].add(c.target_id)
    }

    const ownerMap = {}
    const TABLE_MAP = { pick: 'picks', parlay: 'parlays', prop: 'prop_picks', streak_event: 'streak_events', record_history: 'record_history' }
    const OWNER_COL = { pick: 'user_id', parlay: 'user_id', prop: 'user_id', streak_event: 'user_id', record_history: 'new_holder_id' }

    for (const [type, ids] of Object.entries(targetsByType)) {
      const table = TABLE_MAP[type]
      if (!table) continue
      const ownerCol = OWNER_COL[type]
      const { data: rows } = await supabase
        .from(table)
        .select(`id, ${ownerCol}`)
        .in('id', [...ids])
      for (const r of rows || []) {
        const ownerId = r[ownerCol]
        // Look up username from connected users or fetch separately
        let username = userMap[ownerId]?.username
        if (!username && ownerId) {
          const { data: ownerUser } = await supabase.from('users').select('username').eq('id', ownerId).single()
          username = ownerUser?.username
        }
        ownerMap[`${type}-${r.id}`] = { user_id: ownerId, username }
      }
    }

    for (const comment of commentData) {
      const user = userMap[comment.user_id]
      if (!user) continue

      const target = ownerMap[`${comment.target_type}-${comment.target_id}`]
      const ownerUsername = target?.user_id === comment.user_id
        ? null
        : target?.username || null

      feed.push({
        type: 'comment',
        id: comment.id,
        userId: comment.user_id,
        username: user.username,
        display_name: user.display_name,
        avatar_emoji: user.avatar_emoji,
        timestamp: comment.created_at,
        comment: {
          content: comment.content,
          target_type: comment.target_type,
          owner_username: ownerUsername,
        },
      })
    }
  }

  // Sort by timestamp desc, limit 30
  feed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  return feed.slice(0, 30)
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
