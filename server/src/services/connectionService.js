import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from './notificationService.js'

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

export async function connectAutoConnectMembers(leagueId) {
  const { data: members, error } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)
    .eq('auto_connect', true)

  if (error || !members?.length || members.length < 2) return

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      try {
        await connectUsers(members[i].user_id, members[j].user_id, 'league_auto')
      } catch (err) {
        logger.error({ err, leagueId }, 'Failed to auto-connect league members on complete')
      }
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
    .select('id, username, display_name, avatar_url, avatar_emoji, total_points, tier, updated_at')
    .in('id', otherUserIds)

  // Get global rank for each user via RPC or count
  const rankMap = {}
  const uniquePoints = [...new Set((users || []).map((u) => u.total_points || 0))]
  const rankCounts = {}
  for (const pts of uniquePoints) {
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gt('total_points', pts)
    rankCounts[pts] = (count || 0) + 1
  }
  for (const u of users || []) {
    rankMap[u.id] = rankCounts[u.total_points || 0]
  }

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
        avatar_url: user.avatar_url,
        avatar_url: user.avatar_url,
      avatar_emoji: user.avatar_emoji,
        total_points: user.total_points,
        rank: rankMap[otherId] || null,
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
    .select('id, username, display_name, avatar_url, avatar_emoji')
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

  // Notify the requester that their request was accepted
  const { data: acceptor } = await supabase
    .from('users')
    .select('display_name, username')
    .eq('id', userId)
    .single()

  const acceptorName = acceptor?.display_name || acceptor?.username || 'Someone'
  await createNotification(connection.requested_by, 'connection_accepted',
    `${acceptorName} accepted your connection request!`,
    { actorId: userId })

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

export async function getConnectionActivity(userId, before, scope = 'squad', targetUserId = null, userTimezone = null) {
  const isAll = scope === 'all'
  const isHighlights = scope === 'highlights'
  const isHotTakes = scope === 'hot_takes'
  const isPolls = scope === 'polls'
  const isPredictions = scope === 'predictions'
  const isUserHighlights = scope === 'user_highlights'
  const isUserHotTakes = scope === 'user_hot_takes'

  // Filter out blocked users — always needed
  const { data: blocks } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', userId)

  const blockedSet = new Set((blocks || []).map((b) => b.blocked_id))

  let connectedIds = []
  let allIds = [userId]
  const userMap = {}

  if (isUserHighlights && targetUserId) {
    // User highlights: show a specific user's activity
    allIds = [targetUserId]
    connectedIds = [targetUserId]
    const { data: users } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, avatar_emoji, title_preference')
      .eq('id', targetUserId)
    for (const u of users || []) {
      userMap[u.id] = u
    }
  } else if (isUserHotTakes) {
    // User hot takes: handled specially below — no connections needed
  } else if (isHighlights) {
    // Highlights: show only the current user's activity
    allIds = [userId]
    connectedIds = [userId]
    const { data: users } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, avatar_emoji, title_preference')
      .eq('id', userId)
    for (const u of users || []) {
      userMap[u.id] = u
    }
  } else if (isHotTakes) {
    // Hot takes: handled specially below — no connections needed
  } else if (!isAll) {
    // Get connected user IDs
    const { data: connections } = await supabase
      .from('connections')
      .select('user_id_1, user_id_2')
      .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
      .eq('status', 'connected')

    if (!connections?.length) return { items: [], nextCursor: null }

    connectedIds = connections.map((c) =>
      c.user_id_1 === userId ? c.user_id_2 : c.user_id_1
    ).filter((id) => !blockedSet.has(id))

    allIds = [userId, ...connectedIds]

    // Get user details for mapping (including self for H2H)
    const { data: users } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, avatar_emoji, title_preference')
      .in('id', allIds)

    for (const u of users || []) {
      userMap[u.id] = u
    }
  }

  // Build streak map for all users in scope
  const streakMap = {}
  if (!isAll && !isHotTakes && !isUserHotTakes) {
    const { data: streakStats } = await supabase
      .from('user_sport_stats')
      .select('user_id, current_streak')
      .in('user_id', allIds)
    for (const s of streakStats || []) {
      if (!streakMap[s.user_id] || s.current_streak > streakMap[s.user_id]) {
        streakMap[s.user_id] = s.current_streak
      }
    }
  }

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  // Helper to conditionally add cursor filter
  function applyBefore(query, col) {
    return before ? query.lt(col, before) : query
  }

  // Helper: for 'all'/'hot_takes' scope, skip user filter; for 'squad'/'highlights', filter by user ids
  function filterByUser(query, col, ids) {
    return (isAll || isHotTakes || isUserHotTakes || isPolls || isPredictions) ? query : query.in(col, ids)
  }

  // For hot_takes/user_hot_takes scope, only run Source 9; everything else resolves to empty
  const skipForHotTakes = (isHotTakes || isUserHotTakes || isPolls || isPredictions) ? Promise.resolve({ data: [] }) : null

  // Query sources in parallel (some skipped for 'all' / 'highlights' / 'hot_takes' scope)
  const [notablePicks, settledParlays, streakEvents, tierAchievements, recordsBroken, pickShares, leagueWins, h2hPicks, hotTakes, hotTakeReminders, sweatShares, viralHotTakes, futuresPicks] = await Promise.all([
    // Source 1: Notable picks — settled where (correct AND odds >= 250) OR (multiplier >= 3)
    // Fetches at +250 threshold; "all" scope filters to +300 during processing
    skipForHotTakes ||
    applyBefore(filterByUser(supabase
      .from('picks')
      .select('id, user_id, picked_team, odds_at_pick, status, is_correct, points_earned, multiplier, risk_points, reward_points, updated_at, game_id, games(home_team, away_team, sports(name))'),
      'user_id', connectedIds)
      .eq('status', 'settled')
      .or('and(is_correct.eq.true,odds_at_pick.gte.250),multiplier.gte.3'), 'updated_at')
      .order('updated_at', { ascending: false })
      .limit(50),

    // Source 2: Settled parlays (won + bad beats only, filtered in processing)
    skipForHotTakes ||
    applyBefore(filterByUser(supabase
      .from('parlays')
      .select('id, user_id, leg_count, combined_multiplier, status, is_correct, points_earned, risk_points, reward_points, updated_at, parlay_legs(picked_team, odds_at_submission, status, games(home_team, away_team, sports(name)))'),
      'user_id', connectedIds)
      .eq('status', 'settled'), 'updated_at')
      .order('updated_at', { ascending: false })
      .limit(50),

    // Source 3: Streak events (squad/highlights + all scope for 10+ streaks)
    (isHotTakes || isUserHotTakes || isUserHighlights || isPolls || isPredictions) ? Promise.resolve({ data: [] }) :
    applyBefore(filterByUser(supabase
      .from('streak_events')
      .select('id, user_id, streak_length, created_at, sports(key, name)'),
      'user_id', connectedIds), 'created_at')
      .order('created_at', { ascending: false })
      .limit(50),

    // Source 4: (removed — tier_up cards disabled)
    Promise.resolve({ data: [] }),

    // Source 5: Record broken
    skipForHotTakes ||
    applyBefore(filterByUser(supabase
      .from('record_history')
      .select('id, record_key, new_holder_id, previous_holder_id, previous_value, new_value, broken_at, records(display_name)'),
      'new_holder_id', connectedIds), 'broken_at')
      .order('broken_at', { ascending: false })
      .limit(30),

    // Source 6: Pick shares (squad only)
    (isAll || isHighlights || isHotTakes || isUserHighlights || isUserHotTakes || isPolls || isPredictions) ? Promise.resolve({ data: [] }) :
    applyBefore(supabase
      .from('pick_shares')
      .select('id, pick_id, user_id, created_at, picks(game_id, picked_team, odds_at_pick, status, is_correct, points_earned, multiplier, risk_points, reward_points, games(home_team, away_team, sports(name)))')
      .in('user_id', connectedIds), 'created_at')
      .order('created_at', { ascending: false })
      .limit(15),

    // Source 7: League wins — league_win (isWinner=true) + survivor_win notifications
    skipForHotTakes ||
    applyBefore(supabase
      .from('notifications')
      .select('id, user_id, type, message, metadata, created_at')
      .or('and(type.eq.league_win,metadata->>isWinner.eq.true),type.eq.survivor_win')
      .in('user_id', connectedIds), 'created_at')
      .order('created_at', { ascending: false })
      .limit(30),

    // Source 8: H2H — settled picks in last 3 days (squad only)
    (isAll || isHighlights || isHotTakes || isUserHighlights || isUserHotTakes || isPolls || isPredictions) ? Promise.resolve({ data: [] }) :
    applyBefore(supabase
      .from('picks')
      .select('id, user_id, picked_team, game_id, is_correct, odds_at_pick, points_earned, risk_points, multiplier, updated_at, games(home_team, away_team, sports(name))')
      .in('user_id', allIds)
      .eq('status', 'settled')
      .gte('updated_at', threeDaysAgo), 'updated_at')
      .order('updated_at', { ascending: false })
      .limit(100),

    // Source 9: Hot takes (posts, predictions, polls)
    (() => {
      const htSelect = 'id, user_id, content, team_tags, user_tags, image_url, image_urls, video_url, post_type, created_at, flex_pick_id, flex_parlay_id, flex_prop_pick_id'
      let htQuery
      if (isPolls) {
        htQuery = supabase.from('hot_takes').select(htSelect).eq('post_type', 'poll')
      } else if (isPredictions) {
        htQuery = supabase.from('hot_takes').select(htSelect).eq('post_type', 'prediction')
      } else if (isHotTakes) {
        htQuery = supabase.from('hot_takes').select(htSelect)
      } else if (isUserHotTakes && targetUserId) {
        htQuery = supabase.from('hot_takes').select(htSelect).eq('user_id', targetUserId)
      } else {
        htQuery = filterByUser(supabase.from('hot_takes').select(htSelect), 'user_id', allIds)
      }
      return applyBefore(htQuery, 'created_at')
        .order('created_at', { ascending: false })
        .limit((isHotTakes || isUserHotTakes || isPolls || isPredictions) ? 30 : 15)
    })(),

    // Source 10: Hot take reminders (squad only)
    (isAll || isHighlights || isHotTakes || isUserHighlights || isUserHotTakes || isPolls || isPredictions) ? Promise.resolve({ data: [] }) :
    applyBefore(supabase
      .from('hot_take_reminders')
      .select('id, reminder_user_id, hot_take_id, comment, created_at, hot_takes(id, user_id, content, team_tags, user_tags, created_at)')
      .in('reminder_user_id', allIds), 'created_at')
      .order('created_at', { ascending: false })
      .limit(15),

    // Source 11: All pick shares for sweat cards (squad only)
    (isAll || isHighlights || isHotTakes || isUserHighlights || isUserHotTakes || isPolls || isPredictions) ? Promise.resolve({ data: [] }) :
    supabase
      .from('pick_shares')
      .select('id, pick_id, user_id, created_at, picks(id, user_id, picked_team, odds_at_pick, status, is_correct, points_earned, multiplier, risk_points, reward_points, updated_at, game_id, games(id, home_team, away_team, starts_at, sports(name)))')
      .in('user_id', connectedIds)
      .gte('created_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50),

    // Source 12: Hot take reminder counts — to find viral takes (5+ reminds)
    (isHighlights || isUserHighlights || isPolls || isPredictions) ? Promise.resolve({ data: [] }) :
    supabase
      .from('hot_take_reminders')
      .select('hot_take_id')
      .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()),

    // Source 13: Futures picks — new submissions + settled results
    skipForHotTakes ||
    applyBefore(filterByUser(supabase
      .from('futures_picks')
      .select('id, user_id, picked_outcome, odds_at_submission, risk_at_submission, reward_at_submission, status, is_correct, points_earned, created_at, updated_at, futures_markets(title, sport_key)'),
      'user_id', connectedIds), 'created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  // For 'all' / 'hot_takes' / 'user_hot_takes' scope, batch-fetch user data from query results
  if (isAll || isHotTakes || isUserHotTakes || isPolls || isPredictions) {
    const userIdSet = new Set()
    for (const pick of notablePicks.data || []) userIdSet.add(pick.user_id)
    for (const parlay of settledParlays.data || []) userIdSet.add(parlay.user_id)
    for (const record of recordsBroken.data || []) {
      userIdSet.add(record.new_holder_id)
      if (record.previous_holder_id) userIdSet.add(record.previous_holder_id)
    }
    for (const pick of h2hPicks.data || []) userIdSet.add(pick.user_id)
    for (const take of hotTakes.data || []) userIdSet.add(take.user_id)
    for (const win of leagueWins.data || []) userIdSet.add(win.user_id)
    for (const fp of futuresPicks.data || []) userIdSet.add(fp.user_id)
    // viralHotTakes user IDs are added after we fetch the actual hot takes below
    userIdSet.delete(undefined)
    for (const id of blockedSet) userIdSet.delete(id)
    const userIdsToFetch = [...userIdSet]
    if (userIdsToFetch.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url, avatar_emoji, title_preference')
        .in('id', userIdsToFetch)
      for (const u of users || []) {
        userMap[u.id] = u
      }
    }
  }

  const feed = []

  function buildPickedTeamName(pickedTeam, game) {
    return pickedTeam === 'home' ? game?.home_team : game?.away_team
  }

  function buildUserFields(user) {
    return {
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      avatar_emoji: user.avatar_emoji,
      title_preference: user.title_preference || null,
    }
  }

  // Process notable picks — categorize by type
  for (const pick of notablePicks.data || []) {
    const user = userMap[pick.user_id]
    if (!user) continue

    // Determine card type: multiplier check first, then underdog
    // Underdog threshold: +250 for squad, +300 for "all of IKB"
    const underdogMin = isAll ? 300 : 250
    let type = 'pick'
    if (pick.multiplier >= 3 && pick.is_correct) {
      type = 'multiplier_hit'
    } else if (pick.multiplier >= 3 && !pick.is_correct) {
      type = 'multiplier_miss'
    } else if (pick.is_correct && pick.odds_at_pick >= underdogMin) {
      type = 'underdog_hit'
    } else if (pick.is_correct && pick.odds_at_pick < underdogMin) {
      // Below this scope's underdog threshold and not a multiplier — skip
      continue
    }

    feed.push({
      type,
      id: pick.id,
      userId: pick.user_id,
      ...buildUserFields(user),
      timestamp: pick.updated_at,
      game_id: pick.game_id,
      current_streak: streakMap[pick.user_id] || 0,
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

  // Track pick IDs from Source 1 to deduplicate against Source 6
  const source1PickIds = new Set((notablePicks.data || []).map(p => p.id))

  // Process settled parlays — keep wins and bad beats only
  for (const parlay of settledParlays.data || []) {
    const user = userMap[parlay.user_id]
    if (!user) continue

    const legs = (parlay.parlay_legs || []).map((leg) => ({
      picked_team_name: buildPickedTeamName(leg.picked_team, leg.games),
      sport_name: leg.games?.sports?.name,
      odds: leg.odds_at_submission,
      status: leg.status,
      home_team: leg.games?.home_team,
      away_team: leg.games?.away_team,
    }))

    // Only feature parlays with 4+ legs; "all" scope requires 4x+ multiplier
    if (parlay.leg_count < 4) continue
    if (isAll && (parlay.combined_multiplier || 0) < 4) continue

    if (parlay.is_correct) {
      // Won parlay
      feed.push({
        type: 'parlay',
        id: parlay.id,
        userId: parlay.user_id,
        ...buildUserFields(user),
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
          legs,
        },
      })
    } else {
      // Bad beat: fully settled parlay with 5+ legs and exactly 1 lost leg
      // (all others won). "One away from cashing" stings more on bigger
      // parlays; raising the minimum from 4 to 5 legs trims the feed.
      const lostLegs = parlay.parlay_legs?.filter((l) => l.status === 'lost') || []
      const wonLegs = parlay.parlay_legs?.filter((l) => l.status === 'won') || []
      if (lostLegs.length === 1 && wonLegs.length === parlay.leg_count - 1 && parlay.leg_count >= 5) {
        feed.push({
          type: 'bad_beat',
          id: parlay.id,
          userId: parlay.user_id,
          ...buildUserFields(user),
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
            legs,
          },
        })
      }
      // All other lost parlays are discarded
    }
  }

  // Process streak events — show streaks >= 5 (squad/highlights) or >= 10 (all)
  // Deduplicate: per user+sport, only show the highest streak (old data may have one row per win)
  const streakMin = isAll ? 10 : 5
  const bestStreaks = {}
  for (const event of streakEvents.data || []) {
    if (event.streak_length < streakMin) continue
    const key = `${event.user_id}|${event.sports?.name}`
    if (!bestStreaks[key] || event.streak_length > bestStreaks[key].streak_length) {
      bestStreaks[key] = event
    }
  }
  for (const event of Object.values(bestStreaks)) {
    const user = userMap[event.user_id]
    if (!user) continue
    feed.push({
      type: 'streak',
      id: event.id,
      userId: event.user_id,
      ...buildUserFields(user),
      timestamp: event.created_at,
      streak: {
        id: event.id,
        streak_length: event.streak_length,
        sport_name: event.sports?.name,
      },
    })
  }

  // Process records broken — dedup: per (user, record_key), only keep the highest/latest break
  const bestRecordBreak = {}
  for (const record of recordsBroken.data || []) {
    const key = `${record.new_holder_id}|${record.record_key}`
    const existing = bestRecordBreak[key]
    if (!existing || (record.new_value || 0) > (existing.new_value || 0)) {
      bestRecordBreak[key] = record
    }
  }

  for (const record of Object.values(bestRecordBreak)) {
    const user = userMap[record.new_holder_id]
    if (!user) continue
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
      ...buildUserFields(user),
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

  // Process futures picks
  for (const fp of futuresPicks.data || []) {
    const user = userMap[fp.user_id]
    if (!user) continue

    if (fp.status === 'settled' && fp.is_correct) {
      // 2-week rule: pick must have been made at least 14 days before settlement
      const pickDate = new Date(fp.created_at).getTime()
      const settleDate = new Date(fp.updated_at).getTime()
      const daysBetween = (settleDate - pickDate) / (1000 * 60 * 60 * 24)
      if (daysBetween < 14) continue

      // All of IKB: only show if odds were at least +120
      if (isAll && (fp.odds_at_submission || 0) < 120) continue

      feed.push({
        type: 'futures_hit',
        id: fp.id,
        userId: fp.user_id,
        ...buildUserFields(user),
        timestamp: fp.updated_at,
        futures: {
          id: fp.id,
          picked_outcome: fp.picked_outcome,
          market_title: fp.futures_markets?.title,
          sport_key: fp.futures_markets?.sport_key,
          odds_at_submission: fp.odds_at_submission,
          points_earned: fp.points_earned,
          pick_date: fp.created_at,
          status: fp.status,
          is_correct: fp.is_correct,
        },
      })
    } else if (fp.status === 'locked') {
      // Pending futures pick — show that user made a bold call
      feed.push({
        type: 'futures_pick',
        id: fp.id,
        userId: fp.user_id,
        ...buildUserFields(user),
        timestamp: fp.created_at,
        futures: {
          id: fp.id,
          picked_outcome: fp.picked_outcome,
          market_title: fp.futures_markets?.title,
          sport_key: fp.futures_markets?.sport_key,
          odds_at_submission: fp.odds_at_submission,
          points_earned: fp.points_earned,
          pick_date: fp.created_at,
          status: fp.status,
          is_correct: fp.is_correct,
        },
      })
    }
  }

  // Process pick shares
  for (const share of pickShares.data || []) {
    const user = userMap[share.user_id]
    if (!user || !share.picks) continue
    const pick = share.picks
    // Skip pending picks (handled by sweat cards) and recently settled (handled by sweat_result)
    if (pick.status !== 'settled') continue
    // Skip picks already in feed from Source 1 (notable picks)
    if (source1PickIds.has(share.pick_id)) continue

    feed.push({
      type: 'pick',
      id: share.pick_id,
      userId: share.user_id,
      ...buildUserFields(user),
      timestamp: share.created_at,
      game_id: pick.game_id,
      current_streak: streakMap[share.user_id] || 0,
      shared: true,
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
  // Process league wins
  const leagueWinData = leagueWins.data || []
  for (const win of leagueWinData) {
    const user = userMap[win.user_id]
    if (!user) continue
    const meta = win.metadata || {}
    const isSurvivorWin = win.type === 'survivor_win'
    const memberCount = isSurvivorWin ? (meta.outlasted || 0) + 1 : (meta.memberCount || 0)
    const format = isSurvivorWin ? 'survivor' : (meta.format || 'pickem')
    // "all of IKB" scope requires 20+ members; squad/highlights always show
    if (isAll && memberCount < 20) continue

    feed.push({
      type: 'league_win',
      id: win.id,
      userId: win.user_id,
      ...buildUserFields(user),
      timestamp: win.created_at,
      league_win: {
        leagueName: meta.leagueName,
        points: meta.points,
        memberCount,
        format,
      },
    })
  }

  // Process head-to-head conflicts
  const h2hData = h2hPicks.data || []
  if (h2hData.length > 0) {
    // Group by game_id
    const byGame = {}
    for (const pick of h2hData) {
      if (!pick.game_id) continue
      if (!byGame[pick.game_id]) byGame[pick.game_id] = []
      byGame[pick.game_id].push(pick)
    }

    const seenH2H = new Set()
    for (const [gameId, picks] of Object.entries(byGame)) {
      // Find opposite-side pairs
      const homePickers = picks.filter((p) => p.picked_team === 'home')
      const awayPickers = picks.filter((p) => p.picked_team === 'away')

      for (const home of homePickers) {
        for (const away of awayPickers) {
          // Ensure at least one is a connection (not both self)
          if (home.user_id === away.user_id) continue
          const pairKey = [home.user_id, away.user_id].sort().join('-') + '-' + gameId
          if (seenH2H.has(pairKey)) continue
          seenH2H.add(pairKey)

          const userA = userMap[home.user_id]
          const userB = userMap[away.user_id]
          if (!userA || !userB) continue

          feed.push({
            type: 'head_to_head',
            id: `h2h-${pairKey}`,
            pickId: home.id,
            userId: home.user_id,
            timestamp: home.updated_at > away.updated_at ? home.updated_at : away.updated_at,
            game: {
              home_team: home.games?.home_team,
              away_team: home.games?.away_team,
              sport_name: home.games?.sports?.name,
            },
            matchup: {
              userA: {
                userId: home.user_id,
                ...buildUserFields(userA),
                picked_team: 'home',
                picked_team_name: home.games?.home_team,
                is_correct: home.is_correct,
                points_earned: home.points_earned,
                risk_points: home.risk_points,
              },
              userB: {
                userId: away.user_id,
                ...buildUserFields(userB),
                picked_team: 'away',
                picked_team_name: away.games?.away_team,
                is_correct: away.is_correct,
                points_earned: away.points_earned,
                risk_points: away.risk_points,
              },
            },
          })
        }
      }
    }
  }

  // Compute cumulative h2h records (squad only — too expensive across all users)
  const h2hItems = feed.filter(f => f.type === 'head_to_head')
  if (h2hItems.length > 0 && !isAll && !isHighlights && !isHotTakes && !isUserHighlights && !isUserHotTakes) {
    const pairSet = new Set()
    const h2hUserIds = new Set()
    for (const item of h2hItems) {
      const a = item.matchup.userA.userId
      const b = item.matchup.userB.userId
      h2hUserIds.add(a)
      h2hUserIds.add(b)
      pairSet.add([a, b].sort().join('-'))
    }

    const { data: allH2hPicks } = await supabase
      .from('picks')
      .select('user_id, game_id, picked_team, is_correct')
      .in('user_id', [...h2hUserIds])
      .eq('status', 'settled')

    if (allH2hPicks?.length) {
      const picksByGame = {}
      for (const p of allH2hPicks) {
        if (!p.game_id) continue
        if (!picksByGame[p.game_id]) picksByGame[p.game_id] = []
        picksByGame[p.game_id].push(p)
      }

      // Tally wins for each pair across all games
      const records = {}
      for (const picks of Object.values(picksByGame)) {
        const home = picks.filter(p => p.picked_team === 'home')
        const away = picks.filter(p => p.picked_team === 'away')
        for (const h of home) {
          for (const a of away) {
            if (h.user_id === a.user_id) continue
            const key = [h.user_id, a.user_id].sort().join('-')
            if (!pairSet.has(key)) continue
            if (!records[key]) records[key] = {}
            if (h.is_correct) {
              records[key][h.user_id] = (records[key][h.user_id] || 0) + 1
            }
            if (a.is_correct) {
              records[key][a.user_id] = (records[key][a.user_id] || 0) + 1
            }
          }
        }
      }

      // Compute streaks per pair: track who won each H2H game in order
      const pairResults = {} // key -> [{winnerId, gameId}] ordered by game time
      for (const [gameId, picks] of Object.entries(picksByGame)) {
        const home = picks.filter(p => p.picked_team === 'home')
        const away = picks.filter(p => p.picked_team === 'away')
        for (const h of home) {
          for (const a of away) {
            if (h.user_id === a.user_id) continue
            const key = [h.user_id, a.user_id].sort().join('-')
            if (!pairSet.has(key)) continue
            // Determine winner of this H2H
            let winnerId = null
            if (h.is_correct && !a.is_correct) winnerId = h.user_id
            else if (a.is_correct && !h.is_correct) winnerId = a.user_id
            if (winnerId) {
              if (!pairResults[key]) pairResults[key] = []
              pairResults[key].push({ winnerId, gameId })
            }
          }
        }
      }

      // Compute current streak per pair
      const pairStreaks = {}
      for (const [key, results] of Object.entries(pairResults)) {
        if (!results.length) continue
        let streak = 1
        const lastWinner = results[results.length - 1].winnerId
        for (let i = results.length - 2; i >= 0; i--) {
          if (results[i].winnerId === lastWinner) streak++
          else break
        }
        pairStreaks[key] = { userId: lastWinner, streak }
      }

      for (const item of h2hItems) {
        const a = item.matchup.userA.userId
        const b = item.matchup.userB.userId
        const key = [a, b].sort().join('-')
        const rec = records[key]
        if (rec) {
          item.matchup.record = {
            userAWins: rec[a] || 0,
            userBWins: rec[b] || 0,
          }
        }
        if (pairStreaks[key]) {
          item.matchup.streak = pairStreaks[key]
        }
      }

      // Quality filter: only show H2H in feed when notable
      // 1. Milestone: total matchups is a multiple of 5
      // 2. Dominance streak: 4+ in a row, only at even numbers (4, 6, 8...)
      const filteredFeed = feed.filter((item) => {
        if (item.type !== 'head_to_head') return true
        const rec = item.matchup.record
        if (!rec) return false
        const total = (rec.userAWins || 0) + (rec.userBWins || 0)
        const streak = item.matchup.streak

        // Milestone: every 5th matchup
        if (total > 0 && total % 5 === 0) return true

        // Dominance streak: 4+ and even
        if (streak && streak.streak >= 4 && streak.streak % 2 === 0) return true

        return false
      })
      feed.length = 0
      feed.push(...filteredFeed)
    }
  }

  // Collect flex target IDs to fetch pick/parlay/prop data for flexes
  const flexPickIds = new Set()
  const flexParlayIds = new Set()
  const flexPropPickIds = new Set()
  for (const take of hotTakes.data || []) {
    if (take.post_type === 'flex') {
      if (take.flex_pick_id) flexPickIds.add(take.flex_pick_id)
      if (take.flex_parlay_id) flexParlayIds.add(take.flex_parlay_id)
      if (take.flex_prop_pick_id) flexPropPickIds.add(take.flex_prop_pick_id)
    }
  }

  const [flexPicksRes, flexParlaysRes, flexPropsRes] = await Promise.all([
    flexPickIds.size > 0
      ? supabase.from('picks').select('id, game_id, picked_team, is_correct, odds_at_pick, points_earned, multiplier, risk_points, status, games(id, home_team, away_team, home_score, away_score, status, sports(key, name))').in('id', [...flexPickIds])
      : Promise.resolve({ data: [] }),
    flexParlayIds.size > 0
      ? supabase.from('parlays').select('id, leg_count, combined_multiplier, points_earned, is_correct, parlay_legs(id, picked_team, odds_at_lock, odds_at_submission, status, games(home_team, away_team, sports(name)))').in('id', [...flexParlayIds])
      : Promise.resolve({ data: [] }),
    flexPropPickIds.size > 0
      ? supabase.from('prop_picks').select('id, picked_side, is_correct, points_earned, player_props(id, player_name, line, market_label, actual_value, games(home_team, away_team, sports(key, name)))').in('id', [...flexPropPickIds])
      : Promise.resolve({ data: [] }),
  ])

  // Fetch ALL PICKS counts for flex pick games
  const flexGameIds = new Set()
  for (const p of flexPicksRes.data || []) if (p.game_id) flexGameIds.add(p.game_id)
  const flexGamePickCounts = {}
  if (flexGameIds.size > 0) {
    const { data: allPicksOnGames } = await supabase
      .from('picks')
      .select('game_id, picked_team')
      .in('game_id', [...flexGameIds])
      .eq('status', 'settled')
    for (const p of allPicksOnGames || []) {
      if (!flexGamePickCounts[p.game_id]) flexGamePickCounts[p.game_id] = { home: 0, away: 0 }
      if (p.picked_team === 'home') flexGamePickCounts[p.game_id].home++
      else if (p.picked_team === 'away') flexGamePickCounts[p.game_id].away++
    }
  }

  const flexPickMap = {}
  for (const p of flexPicksRes.data || []) {
    // Attach pick counts to the flex pick
    p.totalCounts = flexGamePickCounts[p.game_id] || { home: 0, away: 0 }
    flexPickMap[p.id] = p
  }
  const flexParlayMap = {}
  for (const p of flexParlaysRes.data || []) flexParlayMap[p.id] = p
  const flexPropMap = {}
  for (const p of flexPropsRes.data || []) flexPropMap[p.id] = p

  // Build flex dedup sets (to suppress auto feed entries for same items)
  const flexedPickIds = new Set([...flexPickIds])
  const flexedParlayIds = new Set([...flexParlayIds])
  const flexedPropIds = new Set([...flexPropPickIds])

  // Process hot takes
  for (const take of hotTakes.data || []) {
    const user = userMap[take.user_id]
    if (!user) continue
    const isFlex = take.post_type === 'flex'
    const flexData = isFlex ? {
      flex_pick: take.flex_pick_id ? flexPickMap[take.flex_pick_id] : null,
      flex_parlay: take.flex_parlay_id ? flexParlayMap[take.flex_parlay_id] : null,
      flex_prop_pick: take.flex_prop_pick_id ? flexPropMap[take.flex_prop_pick_id] : null,
    } : {}

    // For All of IKB scope, only show flexes if the underlying item meets the auto-threshold
    if (isFlex && isAll) {
      const p = flexData.flex_pick
      const pl = flexData.flex_parlay
      // Prop flexes never qualify for All of IKB (props aren't in auto feed)
      if (flexData.flex_prop_pick) continue
      if (p && (p.odds_at_pick || 0) < 300) continue
      if (pl && ((pl.leg_count || 0) < 4 || (pl.combined_multiplier || 0) < 4)) continue
    }

    feed.push({
      type: 'hot_take',
      id: take.id,
      userId: take.user_id,
      ...buildUserFields(user),
      timestamp: take.created_at,
      hot_take: {
        id: take.id,
        content: take.content,
        team_tags: take.team_tags,
        user_tags: take.user_tags,
        image_url: take.image_url,
        image_urls: take.image_urls || (take.image_url ? [take.image_url] : null),
        video_url: take.video_url,
        post_type: take.post_type || 'post',
        ...flexData,
      },
    })
  }

  // Dedup: remove auto-generated feed entries for picks/parlays/props that have been flexed
  for (let i = feed.length - 1; i >= 0; i--) {
    const item = feed[i]
    if (item.type === 'hot_take') continue
    if ((item.type === 'pick' || item.type === 'underdog_hit' || item.type === 'multiplier_hit' || item.type === 'multiplier_miss') && item.pick?.id && flexedPickIds.has(item.pick.id)) {
      feed.splice(i, 1)
    } else if ((item.type === 'parlay' || item.type === 'bad_beat') && item.parlay?.id && flexedParlayIds.has(item.parlay.id)) {
      feed.splice(i, 1)
    } else if (item.type === 'prop' && item.prop_pick?.id && flexedPropIds.has(item.prop_pick.id)) {
      feed.splice(i, 1)
    }
  }

  // For polls scope, re-sort by recent vote activity (engagement velocity)
  if (isPolls) {
    const pollIds = feed.filter((f) => f.hot_take?.post_type === 'poll').map((f) => f.hot_take.id)
    if (pollIds.length > 0) {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      const { data: recentVotes } = await supabase
        .from('poll_votes')
        .select('hot_take_id')
        .in('hot_take_id', pollIds)
        .gte('created_at', threeDaysAgo)

      const voteCountMap = {}
      for (const v of (recentVotes || [])) {
        voteCountMap[v.hot_take_id] = (voteCountMap[v.hot_take_id] || 0) + 1
      }

      // Sort: most recent votes first, then by creation date
      feed.sort((a, b) => {
        const aVotes = voteCountMap[a.hot_take?.id] || 0
        const bVotes = voteCountMap[b.hot_take?.id] || 0
        if (bVotes !== aVotes) return bVotes - aVotes
        return new Date(b.timestamp) - new Date(a.timestamp)
      })
    }
  }

  // Process hot take reminders
  for (const reminder of hotTakeReminders.data || []) {
    const user = userMap[reminder.reminder_user_id]
    if (!user || !reminder.hot_takes) continue
    const take = reminder.hot_takes

    // Get take author info — may not be in userMap if not in squad
    let takeAuthor = userMap[take.user_id]
    if (!takeAuthor) {
      const { data: authorData } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url, avatar_emoji, title_preference')
        .eq('id', take.user_id)
        .single()
      takeAuthor = authorData
    }

    feed.push({
      type: 'hot_take_reminder',
      id: reminder.id,
      userId: reminder.reminder_user_id,
      ...buildUserFields(user),
      timestamp: reminder.created_at,
      comment: reminder.comment,
      hot_take: {
        id: take.id,
        content: take.content,
        team_tags: take.team_tags,
        user_tags: take.user_tags,
        created_at: take.created_at,
      },
      reminded_user: takeAuthor ? {
        username: takeAuthor.username,
        display_name: takeAuthor.display_name,
        title_preference: takeAuthor.title_preference || null,
      } : null,
    })
  }

  // Process viral hot takes from Source 12 (5+ reminds)
  const viralReminderData = viralHotTakes?.data || []
  if (viralReminderData.length > 0) {
    // Count reminds per hot take
    const remindCounts = {}
    for (const r of viralReminderData) {
      remindCounts[r.hot_take_id] = (remindCounts[r.hot_take_id] || 0) + 1
    }
    // Filter to hot takes with 5+ reminds that aren't already in the feed
    const existingHotTakeIds = new Set(feed.filter((f) => f.type === 'hot_take').map((f) => f.hot_take.id))
    const viralIds = Object.entries(remindCounts)
      .filter(([id, count]) => count >= 5 && !existingHotTakeIds.has(id))
      .map(([id]) => id)

    if (viralIds.length > 0) {
      const { data: viralTakes } = await supabase
        .from('hot_takes')
        .select('id, user_id, content, team_tags, user_tags, image_url, created_at')
        .in('id', viralIds)
        .order('created_at', { ascending: false })
        .limit(10)

      // Fetch user info for viral take authors not already in userMap
      const missingUserIds = (viralTakes || []).map((t) => t.user_id).filter((id) => !userMap[id])
      if (missingUserIds.length > 0) {
        const { data: missingUsers } = await supabase
          .from('users')
          .select('id, username, display_name, avatar_url, avatar_emoji')
          .in('id', [...new Set(missingUserIds)])
        for (const u of missingUsers || []) {
          userMap[u.id] = u
        }
      }

      for (const take of viralTakes || []) {
        const user = userMap[take.user_id]
        if (!user) continue
        if (blockedSet.has(take.user_id)) continue
        feed.push({
          type: 'hot_take',
          id: `viral-${take.id}`,
          userId: take.user_id,
          ...buildUserFields(user),
          timestamp: take.created_at,
          hot_take: {
            id: take.id,
            content: take.content,
            team_tags: take.team_tags,
            user_tags: take.user_tags,
            image_url: take.image_url,
          },
          remindCount: remindCounts[take.id],
          viral: true,
        })
      }
    }
  }

  // Process sweat cards from Source 11 (squad only)
  const sweatShareData = sweatShares?.data || []
  if (sweatShareData.length > 0) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    // Track settled pick IDs from sweat_result to dedup from Source 6
    const sweatResultPickIds = new Set()

    // Group by game_id
    const byGame = {}
    for (const share of sweatShareData) {
      const pick = share.picks
      if (!pick || !pick.games) continue
      const gameId = pick.game_id || pick.games?.id
      if (!gameId) continue
      if (!byGame[gameId]) byGame[gameId] = { game: pick.games, shares: [] }
      byGame[gameId].shares.push({ share, pick })
    }

    for (const [gameId, { game, shares }] of Object.entries(byGame)) {
      const pending = shares.filter(s => s.pick.status !== 'settled')
      const settled = shares.filter(s => s.pick.status === 'settled' && new Date(s.pick.updated_at) >= twentyFourHoursAgo)

      // Sweat card: pending/locked shared picks
      if (pending.length > 0) {
        const sweaters = pending.map(s => {
          const user = userMap[s.share.user_id]
          if (!user) return null
          return {
            userId: s.share.user_id,
            ...buildUserFields(user),
            picked_team: s.pick.picked_team,
            picked_team_name: buildPickedTeamName(s.pick.picked_team, game),
          }
        }).filter(Boolean)

        if (sweaters.length > 0) {
          feed.push({
            type: 'sweat',
            id: `sweat-${gameId}`,
            userId: sweaters[0].userId,
            username: sweaters[0].username,
            display_name: sweaters[0].display_name,
            avatar_url: sweaters[0].avatar_url,
            avatar_emoji: sweaters[0].avatar_emoji,
            timestamp: pending[0].share.created_at,
            game: {
              home_team: game.home_team,
              away_team: game.away_team,
              sport_name: game.sports?.name,
            },
            sweaters,
          })
        }
      }

      // Sweat result card: recently settled shared picks
      if (settled.length > 0) {
        const winners = []
        const losers = []
        for (const s of settled) {
          const user = userMap[s.share.user_id]
          if (!user) continue
          sweatResultPickIds.add(s.pick.id)
          const entry = {
            userId: s.share.user_id,
            ...buildUserFields(user),
            picked_team_name: buildPickedTeamName(s.pick.picked_team, game),
            points_earned: s.pick.points_earned,
            odds_at_pick: s.pick.odds_at_pick,
            pick_id: s.pick.id,
            shared_at: s.share.created_at,
            settled_at: s.pick.updated_at,
          }
          if (s.pick.is_correct) winners.push(entry)
          else losers.push(entry)
        }

        // Extract called shots: winners with odds >= 200 get their own card
        const calledShots = winners.filter(w => w.odds_at_pick >= 200)
        const regularWinners = winners.filter(w => w.odds_at_pick < 200)

        for (const cs of calledShots) {
          feed.push({
            type: 'called_shot',
            id: `called-shot-${cs.pick_id}`,
            userId: cs.userId,
            username: cs.username,
            display_name: cs.display_name,
            avatar_url: cs.avatar_url,
            avatar_emoji: cs.avatar_emoji,
            timestamp: cs.settled_at,
            pick_id: cs.pick_id,
            picked_team_name: cs.picked_team_name,
            odds_at_pick: cs.odds_at_pick,
            points_earned: cs.points_earned,
            shared_at: cs.shared_at,
            settled_at: cs.settled_at,
            game: {
              home_team: game.home_team,
              away_team: game.away_team,
              starts_at: game.starts_at,
              sport_name: game.sports?.name,
            },
          })
        }

        if (regularWinners.length > 0 || losers.length > 0) {
          feed.push({
            type: 'sweat_result',
            id: `sweat-result-${gameId}`,
            userId: (regularWinners[0] || losers[0]).userId,
            username: (regularWinners[0] || losers[0]).username,
            display_name: (regularWinners[0] || losers[0]).display_name,
            avatar_url: (regularWinners[0] || losers[0]).avatar_url,
            avatar_emoji: (regularWinners[0] || losers[0]).avatar_emoji,
            timestamp: settled[0].pick.updated_at,
            game: {
              home_team: game.home_team,
              away_team: game.away_team,
              sport_name: game.sports?.name,
            },
            winners: regularWinners,
            losers,
          })
        }
      }
    }

    // Remove pick share items that are now covered by sweat_result cards
    if (sweatResultPickIds.size > 0) {
      for (let i = feed.length - 1; i >= 0; i--) {
        if (feed[i].type === 'pick' && sweatResultPickIds.has(feed[i].pick?.id)) {
          feed.splice(i, 1)
        }
      }
    }
  }

  // Group duplicate picks: merge items where multiple users picked the same side of the same game
  const GROUPABLE_TYPES = new Set(['underdog_hit', 'multiplier_hit', 'multiplier_miss', 'pick'])
  const groupBuckets = {}
  const ungrouped = []

  for (const item of feed) {
    if (GROUPABLE_TYPES.has(item.type) && item.game_id && item.pick) {
      const key = `${item.type}-${item.game_id}-${item.pick.picked_team}`
      if (!groupBuckets[key]) groupBuckets[key] = []
      groupBuckets[key].push(item)
    } else {
      ungrouped.push(item)
    }
  }

  // Replace feed contents: grouped items become a single merged item, singles stay as-is
  feed.length = 0
  feed.push(...ungrouped)

  for (const items of Object.values(groupBuckets)) {
    if (items.length < 2) {
      feed.push(items[0])
      continue
    }

    // Sort by most recent first
    items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    const first = items[0]

    feed.push({
      ...first,
      id: `grouped-${first.type}-${first.game_id}-${first.pick.picked_team}`,
      grouped: true,
      current_streak: Math.max(...items.map(i => i.current_streak || 0)),
      users: items.map((i) => ({
        userId: i.userId,
        username: i.username,
        display_name: i.display_name,
        avatar_url: i.avatar_url,
        avatar_emoji: i.avatar_emoji,
      })),
      pickIds: items.map((i) => i.pick.id),
      timestamp: first.timestamp, // most recent
    })
  }

  // Daily digest: summarize yesterday's squad activity (first page, squad scope only)
  if (!before && !isAll && !isHighlights && !isHotTakes && !isUserHighlights && !isUserHotTakes) {
    const tz = userTimezone || 'America/New_York'
    // Get today's and yesterday's date strings in the user's timezone
    const now = new Date()
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz })
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: tz })

    // Filter feed items that fall on "yesterday" in the user's timezone
    const yesterdayItems = feed.filter(item => {
      const itemDate = new Date(item.timestamp).toLocaleDateString('en-CA', { timeZone: tz })
      return itemDate === yesterdayStr
    })
    const yesterdayISO = new Date(`${yesterdayStr}T00:00:00`).toISOString()

    if (yesterdayItems.length > 0) {
      let biggestUnderdog = null, bestParlay = null
      const streakItems = []
      const recordItems = []
      const userPoints = {} // userId -> { username, total }

      for (const item of yesterdayItems) {
        if (item.type === 'underdog_hit' && (!biggestUnderdog || item.pick.odds_at_pick > biggestUnderdog.odds)) {
          biggestUnderdog = { username: item.username, team: item.pick.picked_team_name, odds: item.pick.odds_at_pick, points: item.pick.points_earned }
        } else if (item.type === 'parlay' && item.parlay?.is_correct) {
          if (!bestParlay || item.parlay.points_earned > bestParlay.points) {
            bestParlay = { username: item.username, legs: item.parlay.leg_count, points: item.parlay.points_earned }
          }
        } else if (item.type === 'streak') {
          const dupeIdx = streakItems.findIndex(s => s.username === item.username && s.sport === item.streak.sport_name)
          if (dupeIdx >= 0) {
            if (item.streak.streak_length > streakItems[dupeIdx].length) {
              streakItems[dupeIdx].length = item.streak.streak_length
            }
          } else {
            streakItems.push({ username: item.username, length: item.streak.streak_length, sport: item.streak.sport_name })
          }
        } else if (item.type === 'record') {
          recordItems.push({ username: item.username, record: item.record.display_name, value: item.record.new_value })
        }

        // Track points per user for biggest point day
        const pts = item.type === 'pick' || item.type === 'underdog_hit' || item.type === 'multiplier_hit' || item.type === 'multiplier_miss'
          ? item.pick?.points_earned
          : item.type === 'parlay' || item.type === 'bad_beat'
            ? item.parlay?.points_earned
            : null
        if (pts != null && item.userId) {
          if (!userPoints[item.userId]) userPoints[item.userId] = { username: item.username, total: 0 }
          userPoints[item.userId].total += pts
        }
      }

      // Find biggest point day (minimum +20 to be noteworthy)
      let biggestDay = null
      for (const [, data] of Object.entries(userPoints)) {
        if (data.total >= 20 && (!biggestDay || data.total > biggestDay.points)) {
          biggestDay = { username: data.username, points: data.total }
        }
      }

      const hasHighlights = biggestUnderdog || bestParlay || biggestDay || streakItems.length > 0 || recordItems.length > 0
      if (hasHighlights) {
        feed.push({
          type: 'daily_digest',
          id: `digest-${yesterdayISO}`,
          userId: null,
          timestamp: now.toISOString(),
          highlights: {
            biggestUnderdog,
            bestParlay,
            biggestDay,
            streaks: streakItems.slice(0, 3),
            records: recordItems.slice(0, 3),
          },
        })
      }
    }
  }

  // Helper: get comment target key for a feed item
  function getCommentKey(item) {
    if (item.type === 'pick' || item.type === 'underdog_hit' || item.type === 'multiplier_hit' || item.type === 'multiplier_miss') {
      return { key: `pick-${item.pick.id}`, target_type: 'pick', target_id: item.pick.id }
    } else if (item.type === 'parlay' || item.type === 'bad_beat') {
      return { key: `parlay-${item.parlay.id}`, target_type: 'parlay', target_id: item.parlay.id }
    } else if (item.type === 'streak') {
      return { key: `streak_event-${item.streak.id}`, target_type: 'streak_event', target_id: item.streak.id }
    } else if (item.type === 'record') {
      return { key: `record_history-${item.record.id}`, target_type: 'record_history', target_id: item.record.id }
    } else if (item.type === 'hot_take') {
      return { key: `hot_take-${item.hot_take.id}`, target_type: 'hot_take', target_id: item.hot_take.id }
    } else if (item.type === 'called_shot' && item.pick_id) {
      return { key: `pick-${item.pick_id}`, target_type: 'pick', target_id: item.pick_id }
    } else if (item.type === 'head_to_head' && item.id) {
      return { key: `head_to_head-${item.id}`, target_type: 'head_to_head', target_id: item.id }
    } else if (item.type === 'hot_take_reminder') {
      return { key: `hot_take_reminder-${item.id}`, target_type: 'hot_take_reminder', target_id: item.id }
    }
    return null
  }

  // Batch fetch and attach comment counts for a set of feed items
  async function attachCommentCounts(items) {
    const targets = []
    for (const item of items) {
      const t = getCommentKey(item)
      if (t) targets.push(t)
    }
    const commentCountMap = {}
    if (targets.length > 0) {
      const byType = {}
      for (const t of targets) {
        if (!byType[t.target_type]) byType[t.target_type] = []
        byType[t.target_type].push(t.target_id)
      }
      const countQueries = Object.entries(byType).map(([type, ids]) =>
        supabase
          .from('comments')
          .select('target_type, target_id', { count: 'exact', head: false })
          .eq('target_type', type)
          .in('target_id', ids)
      )
      const countResults = await Promise.all(countQueries)
      for (const result of countResults) {
        for (const row of result.data || []) {
          const key = `${row.target_type}-${row.target_id}`
          commentCountMap[key] = (commentCountMap[key] || 0) + 1
        }
      }
    }
    for (const item of items) {
      const t = getCommentKey(item)
      item.commentCount = t ? (commentCountMap[t.key] || 0) : 0
    }
  }

  // Batch fetch and attach reaction counts for feed items (for scoring)
  async function attachReactionCounts(items) {
    const targets = []
    for (const item of items) {
      const t = getCommentKey(item)
      if (t && t.target_type !== 'head_to_head') targets.push(t)
    }
    if (!targets.length) return
    const byType = {}
    for (const t of targets) {
      if (!byType[t.target_type]) byType[t.target_type] = new Set()
      byType[t.target_type].add(t.target_id)
    }
    const countQueries = Object.entries(byType).map(([type, ids]) =>
      supabase
        .from('feed_reactions')
        .select('target_type, target_id')
        .eq('target_type', type)
        .in('target_id', [...ids])
    )
    const reactionCountMap = {}
    const countResults = await Promise.all(countQueries)
    for (const result of countResults) {
      for (const row of result.data || []) {
        const key = `${row.target_type}-${row.target_id}`
        reactionCountMap[key] = (reactionCountMap[key] || 0) + 1
      }
    }
    for (const item of items) {
      const t = getCommentKey(item)
      item.reactionCount = t ? (reactionCountMap[t.key] || 0) : 0
    }
  }

  const PAGE_SIZE = 30

  // Score-based ranking for both feeds
  function getFeedScore(item) {
    let score = 0
    switch (item.type) {
      case 'daily_digest':
        score = 200
        break
      case 'hot_take':
        score = item.hot_take?.video_url ? 120 : item.hot_take?.image_url ? 100 : 80
        // Viral hot takes (5+ reminds) get a significant boost
        if (item.viral) score += 40
        break
      case 'called_shot':
        score = 75
        break
      case 'record':
        score = 70
        break
      case 'underdog_hit':
      case 'parlay':
        score = 65
        break
      case 'multiplier_hit':
        score = 55
        break
      case 'bad_beat':
        score = 50
        break
      case 'sweat_result':
        score = 60
        break
      case 'sweat':
        score = 45
        break
      case 'multiplier_miss':
        score = 30
        break
      case 'pick':
        score = 20
        break
      default:
        score = 15
    }
    // Grouped items get a social proof boost (+10 per extra user, capped at +30)
    if (item.grouped && item.users?.length > 1) {
      score += Math.min((item.users.length - 1) * 10, 30)
    }
    // Engagement boost: +5 per comment, capped at +25
    score += Math.min((item.commentCount || 0) * 5, 25)
    // Reaction boost: +3 per reaction, capped at +15
    score += Math.min((item.reactionCount || 0) * 3, 15)
    // Time decay: priority bonus shrinks over 24h, then items rank purely by recency
    const hoursAgo = (Date.now() - new Date(item.timestamp).getTime()) / (1000 * 60 * 60)
    const decayFactor = Math.max(0, 1 - hoursAgo / 24)
    return score * decayFactor
  }

  // Batch resolve tagged users for hot take items
  const taggedUserIds = new Set()
  for (const item of feed) {
    if (item.hot_take?.user_tags?.length) {
      for (const id of item.hot_take.user_tags) taggedUserIds.add(id)
    }
  }
  if (taggedUserIds.size > 0) {
    const { data: taggedUsers } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, avatar_emoji')
      .in('id', [...taggedUserIds])
    const taggedMap = {}
    for (const u of taggedUsers || []) taggedMap[u.id] = u
    for (const item of feed) {
      if (item.hot_take?.user_tags?.length) {
        item.hot_take.tagged_users = item.hot_take.user_tags.map((id) => taggedMap[id]).filter(Boolean)
      }
    }
  }

  // Fetch comment + reaction counts for all items (needed for scoring)
  await Promise.all([attachCommentCounts(feed), attachReactionCounts(feed)])

  feed.sort((a, b) => {
    const diff = getFeedScore(b) - getFeedScore(a)
    if (diff !== 0) return diff
    return new Date(b.timestamp) - new Date(a.timestamp)
  })

  const page = feed.slice(0, PAGE_SIZE)
  const hasPagination = !isHotTakes && !isUserHotTakes
  const nextCursor = hasPagination && page.length === PAGE_SIZE && feed.length > PAGE_SIZE
    ? page[page.length - 1].timestamp
    : null

  return { items: page, nextCursor }
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

export async function removeConnection(connectionId, userId) {
  const { data: connection } = await supabase
    .from('connections')
    .select('id, user_id_1, user_id_2, status')
    .eq('id', connectionId)
    .single()

  if (!connection) {
    const err = new Error('Connection not found')
    err.status = 404
    throw err
  }

  if (connection.user_id_1 !== userId && connection.user_id_2 !== userId) {
    const err = new Error('Connection not found')
    err.status = 404
    throw err
  }

  if (connection.status !== 'connected') {
    const err = new Error('Can only remove active connections')
    err.status = 400
    throw err
  }

  const { error } = await supabase
    .from('connections')
    .delete()
    .eq('id', connectionId)

  if (error) throw error
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
