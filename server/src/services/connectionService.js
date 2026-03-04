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
    .select('id, username, display_name, avatar_url, avatar_emoji, total_points, tier, updated_at')
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
        avatar_url: user.avatar_url,
        avatar_url: user.avatar_url,
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

export async function getConnectionActivity(userId, before) {
  // Get connected user IDs
  const { data: connections } = await supabase
    .from('connections')
    .select('user_id_1, user_id_2')
    .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
    .eq('status', 'connected')

  if (!connections?.length) return { items: [], nextCursor: null }

  const connectedIds = connections.map((c) =>
    c.user_id_1 === userId ? c.user_id_2 : c.user_id_1
  )

  // Include self + connections for queries
  const allIds = [userId, ...connectedIds]

  // Get user details for mapping (including self for H2H)
  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji, title_preference')
    .in('id', allIds)

  const userMap = {}
  for (const u of users || []) {
    userMap[u.id] = u
  }

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  // Helper to conditionally add cursor filter
  function applyBefore(query, col) {
    return before ? query.lt(col, before) : query
  }

  // Query 10 sources in parallel
  const [notablePicks, settledParlays, streakEvents, tierAchievements, recordsBroken, pickShares, recentComments, h2hPicks, hotTakes, hotTakeReminders] = await Promise.all([
    // Source 1: Notable picks — settled where (correct AND odds >= 200) OR (multiplier >= 3)
    applyBefore(supabase
      .from('picks')
      .select('id, user_id, picked_team, odds_at_pick, status, is_correct, points_earned, multiplier, risk_points, reward_points, updated_at, game_id, games(home_team, away_team, sports(name))')
      .in('user_id', connectedIds)
      .eq('status', 'settled')
      .or('and(is_correct.eq.true,odds_at_pick.gte.200),multiplier.gte.3'), 'updated_at')
      .order('updated_at', { ascending: false })
      .limit(20),

    // Source 2: Settled parlays (won + bad beats only, filtered in processing)
    applyBefore(supabase
      .from('parlays')
      .select('id, user_id, leg_count, combined_multiplier, status, is_correct, points_earned, risk_points, reward_points, updated_at, parlay_legs(picked_team, odds_at_submission, status, games(home_team, away_team, sports(name)))')
      .in('user_id', connectedIds)
      .eq('status', 'settled'), 'updated_at')
      .order('updated_at', { ascending: false })
      .limit(20),

    // Source 3: Streak events (filtered to thresholds in processing)
    applyBefore(supabase
      .from('streak_events')
      .select('id, user_id, streak_length, created_at, sports(key, name)')
      .in('user_id', connectedIds), 'created_at')
      .order('created_at', { ascending: false })
      .limit(20),

    // Source 4: (removed — tier_up cards disabled, no tier_changed_at column to track actual changes)
    Promise.resolve({ data: [] }),

    // Source 5: Record broken
    applyBefore(supabase
      .from('record_history')
      .select('id, record_key, new_holder_id, previous_holder_id, previous_value, new_value, broken_at, records(display_name)')
      .in('new_holder_id', connectedIds), 'broken_at')
      .order('broken_at', { ascending: false })
      .limit(10),

    // Source 6: Pick shares
    applyBefore(supabase
      .from('pick_shares')
      .select('id, pick_id, user_id, created_at, picks(picked_team, odds_at_pick, status, is_correct, points_earned, multiplier, risk_points, reward_points, games(home_team, away_team, sports(name)))')
      .in('user_id', connectedIds), 'created_at')
      .order('created_at', { ascending: false })
      .limit(15),

    // Source 7: Recent comments from connected users
    applyBefore(supabase
      .from('comments')
      .select('id, target_type, target_id, user_id, content, created_at')
      .in('user_id', connectedIds)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()), 'created_at')
      .order('created_at', { ascending: false })
      .limit(15),

    // Source 8: H2H — all settled picks from squad in last 3 days
    applyBefore(supabase
      .from('picks')
      .select('id, user_id, picked_team, game_id, is_correct, odds_at_pick, points_earned, risk_points, multiplier, updated_at, games(home_team, away_team, sports(name))')
      .in('user_id', allIds)
      .eq('status', 'settled')
      .gte('updated_at', threeDaysAgo), 'updated_at')
      .order('updated_at', { ascending: false })
      .limit(100),

    // Source 9: Hot takes
    applyBefore(supabase
      .from('hot_takes')
      .select('id, user_id, content, team_tag, image_url, created_at')
      .in('user_id', allIds), 'created_at')
      .order('created_at', { ascending: false })
      .limit(15),

    // Source 10: Hot take reminders
    applyBefore(supabase
      .from('hot_take_reminders')
      .select('id, reminder_user_id, hot_take_id, created_at, hot_takes(id, user_id, content, team_tag, created_at)')
      .in('reminder_user_id', allIds), 'created_at')
      .order('created_at', { ascending: false })
      .limit(15),
  ])

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
    }
  }

  // Process notable picks — categorize by type
  for (const pick of notablePicks.data || []) {
    const user = userMap[pick.user_id]
    if (!user) continue

    // Determine card type: multiplier check first, then underdog
    let type = 'pick'
    if (pick.multiplier >= 3 && pick.is_correct) {
      type = 'multiplier_hit'
    } else if (pick.multiplier >= 3 && !pick.is_correct) {
      type = 'multiplier_miss'
    } else if (pick.is_correct && pick.odds_at_pick >= 200) {
      type = 'underdog_hit'
    }

    feed.push({
      type,
      id: pick.id,
      userId: pick.user_id,
      ...buildUserFields(user),
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
      // Check for bad beat: 4+ leg parlay with exactly 1 lost leg
      const lostLegs = parlay.parlay_legs?.filter((l) => l.status === 'lost') || []
      if (lostLegs.length === 1 && parlay.leg_count >= 4) {
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

  // Process streak events — filter to thresholds [3, 5, 10, 15, 20, 25...]
  const STREAK_THRESHOLDS = new Set([3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50])
  for (const event of streakEvents.data || []) {
    if (!STREAK_THRESHOLDS.has(event.streak_length)) continue
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

  // Process records broken
  for (const record of recordsBroken.data || []) {
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

  // Process pick shares
  for (const share of pickShares.data || []) {
    const user = userMap[share.user_id]
    if (!user || !share.picks) continue
    const pick = share.picks
    feed.push({
      type: 'pick',
      id: share.pick_id,
      userId: share.user_id,
      ...buildUserFields(user),
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
    const TABLE_MAP = { pick: 'picks', parlay: 'parlays', prop: 'prop_picks', streak_event: 'streak_events', record_history: 'record_history', hot_take: 'hot_takes' }
    const OWNER_COL = { pick: 'user_id', parlay: 'user_id', prop: 'user_id', streak_event: 'user_id', record_history: 'new_holder_id', hot_take: 'user_id' }

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
        ...buildUserFields(user),
        timestamp: comment.created_at,
        comment: {
          content: comment.content,
          target_type: comment.target_type,
          owner_username: ownerUsername,
        },
      })
    }
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

  // Compute cumulative h2h records
  const h2hItems = feed.filter(f => f.type === 'head_to_head')
  if (h2hItems.length > 0) {
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
      }
    }
  }

  // Process hot takes
  for (const take of hotTakes.data || []) {
    const user = userMap[take.user_id]
    if (!user) continue
    feed.push({
      type: 'hot_take',
      id: take.id,
      userId: take.user_id,
      ...buildUserFields(user),
      timestamp: take.created_at,
      hot_take: {
        id: take.id,
        content: take.content,
        team_tag: take.team_tag,
        image_url: take.image_url,
      },
    })
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
        .select('id, username, display_name, avatar_url, avatar_emoji')
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
      hot_take: {
        id: take.id,
        content: take.content,
        team_tag: take.team_tag,
        created_at: take.created_at,
      },
      reminded_user: takeAuthor ? {
        username: takeAuthor.username,
        display_name: takeAuthor.display_name,
      } : null,
    })
  }

  // Sort by timestamp desc, paginate
  const PAGE_SIZE = 30
  feed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  const page = feed.slice(0, PAGE_SIZE)

  // Batch fetch comment counts for feed items that have reaction targets
  const commentTargets = []
  for (const item of page) {
    if (item.type === 'pick' || item.type === 'underdog_hit' || item.type === 'multiplier_hit' || item.type === 'multiplier_miss') {
      commentTargets.push({ target_type: 'pick', target_id: item.pick.id })
    } else if (item.type === 'parlay' || item.type === 'bad_beat') {
      commentTargets.push({ target_type: 'parlay', target_id: item.parlay.id })
    } else if (item.type === 'streak') {
      commentTargets.push({ target_type: 'streak_event', target_id: item.streak.id })
    } else if (item.type === 'record') {
      commentTargets.push({ target_type: 'record_history', target_id: item.record.id })
    } else if (item.type === 'hot_take') {
      commentTargets.push({ target_type: 'hot_take', target_id: item.hot_take.id })
    } else if (item.type === 'head_to_head' && item.pickId) {
      commentTargets.push({ target_type: 'head_to_head', target_id: item.pickId })
    }
  }

  const commentCountMap = {}
  if (commentTargets.length > 0) {
    // Group by target_type for batched queries
    const byType = {}
    for (const t of commentTargets) {
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

    // Build counts from result rows — group manually since we can't GROUP BY in PostgREST
    for (const result of countResults) {
      for (const row of result.data || []) {
        const key = `${row.target_type}-${row.target_id}`
        commentCountMap[key] = (commentCountMap[key] || 0) + 1
      }
    }
  }

  // Attach comment counts to feed items
  for (const item of page) {
    let key = null
    if (item.type === 'pick' || item.type === 'underdog_hit' || item.type === 'multiplier_hit' || item.type === 'multiplier_miss') {
      key = `pick-${item.pick.id}`
    } else if (item.type === 'parlay' || item.type === 'bad_beat') {
      key = `parlay-${item.parlay.id}`
    } else if (item.type === 'streak') {
      key = `streak_event-${item.streak.id}`
    } else if (item.type === 'record') {
      key = `record_history-${item.record.id}`
    } else if (item.type === 'hot_take') {
      key = `hot_take-${item.hot_take.id}`
    } else if (item.type === 'head_to_head' && item.pickId) {
      key = `head_to_head-${item.pickId}`
    }
    item.commentCount = key ? (commentCountMap[key] || 0) : 0
  }

  const nextCursor = page.length === PAGE_SIZE && feed.length > PAGE_SIZE
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
