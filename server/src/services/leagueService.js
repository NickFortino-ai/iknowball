import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createTournament, getBracketStandings } from './bracketService.js'
import { getLeaguePickStandings } from './leaguePickService.js'
import { connectLeagueMembers } from './connectionService.js'

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function getWeekBounds(date) {
  const d = new Date(date)
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: monday, end: sunday }
}

export async function createLeague(userId, data) {
  // Generate unique invite code
  let inviteCode
  for (let i = 0; i < 10; i++) {
    inviteCode = generateInviteCode()
    const { data: existing } = await supabase
      .from('leagues')
      .select('id')
      .eq('invite_code', inviteCode)
      .single()
    if (!existing) break
  }

  // Calculate date range based on duration
  let startsAt = data.starts_at ? new Date(data.starts_at) : new Date()
  let endsAt = data.ends_at ? new Date(data.ends_at) : null

  if (data.duration === 'this_week') {
    const bounds = getWeekBounds(new Date())
    startsAt = bounds.start
    endsAt = bounds.end
  } else if (data.duration === 'full_season') {
    // Set a far-future end date; will be refined later
    endsAt = new Date(startsAt)
    endsAt.setMonth(endsAt.getMonth() + 6)
  } else if (data.duration === 'playoffs_only') {
    endsAt = new Date(startsAt)
    endsAt.setMonth(endsAt.getMonth() + 3)
  }

  const { data: league, error } = await supabase
    .from('leagues')
    .insert({
      name: data.name,
      format: data.format,
      sport: data.sport,
      duration: data.duration,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt?.toISOString() || null,
      invite_code: inviteCode,
      max_members: data.max_members || null,
      commissioner_id: userId,
      settings: data.settings || {},
      use_league_picks: data.format === 'pickem',
    })
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Failed to create league')
    throw error
  }

  // Add commissioner as first member
  await supabase.from('league_members').insert({
    league_id: league.id,
    user_id: userId,
    role: 'commissioner',
    lives_remaining: league.settings?.lives || 1,
  })

  // Generate weeks
  await generateLeagueWeeks(league)

  // Create squares board if format is squares
  if (league.format === 'squares' && league.settings?.game_id) {
    await supabase.from('squares_boards').insert({
      league_id: league.id,
      game_id: league.settings.game_id,
      row_team_name: league.settings.row_team_name || 'Away',
      col_team_name: league.settings.col_team_name || 'Home',
    })
  }

  // Create bracket tournament if format is bracket
  if (league.format === 'bracket' && league.settings?.template_id) {
    await createTournament(league.id, league.settings.template_id, league.settings.locks_at)
  }

  return league
}

export async function generateLeagueWeeks(league) {
  if (!league.starts_at || !league.ends_at) return

  const isDaily = league.settings?.pick_frequency === 'daily'
  const periods = []
  let periodNum = 1
  const current = new Date(league.starts_at)
  const end = new Date(league.ends_at)

  if (isDaily) {
    // Daily mode: one entry per day
    current.setHours(0, 0, 0, 0)

    while (current < end) {
      const dayEnd = new Date(current)
      dayEnd.setHours(23, 59, 59, 999)

      periods.push({
        league_id: league.id,
        week_number: periodNum++,
        starts_at: current.toISOString(),
        ends_at: dayEnd.toISOString(),
      })

      current.setDate(current.getDate() + 1)
    }
  } else {
    // Weekly mode: align to Monday-Sunday
    const day = current.getDay()
    current.setDate(current.getDate() - ((day + 6) % 7))
    current.setHours(0, 0, 0, 0)

    while (current < end) {
      const weekEnd = new Date(current)
      weekEnd.setDate(current.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)

      periods.push({
        league_id: league.id,
        week_number: periodNum++,
        starts_at: current.toISOString(),
        ends_at: weekEnd.toISOString(),
      })

      current.setDate(current.getDate() + 7)
    }
  }

  if (periods.length > 0) {
    const { error } = await supabase.from('league_weeks').insert(periods)
    if (error) {
      logger.error({ error, leagueId: league.id }, 'Failed to generate league weeks')
    }
  }
}

export async function joinLeague(userId, inviteCode) {
  const { data: league, error: leagueError } = await supabase
    .from('leagues')
    .select('*')
    .eq('invite_code', inviteCode.toUpperCase())
    .single()

  if (leagueError || !league) {
    const err = new Error('Invalid invite code')
    err.status = 404
    throw err
  }

  if (league.status !== 'open') {
    const err = new Error('This league is no longer accepting members')
    err.status = 400
    throw err
  }

  // Check max members
  if (league.max_members) {
    const { count } = await supabase
      .from('league_members')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', league.id)

    if (count >= league.max_members) {
      const err = new Error('This league is full')
      err.status = 400
      throw err
    }
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', league.id)
    .eq('user_id', userId)
    .single()

  if (existing) {
    const err = new Error('You are already a member of this league')
    err.status = 400
    throw err
  }

  const { error } = await supabase.from('league_members').insert({
    league_id: league.id,
    user_id: userId,
    role: 'member',
    lives_remaining: league.settings?.lives || 1,
  })

  if (error) {
    logger.error({ error }, 'Failed to join league')
    throw error
  }

  // Auto-connect with existing league members
  try {
    await connectLeagueMembers(userId, league.id)
  } catch (err) {
    logger.error({ err, userId, leagueId: league.id }, 'Failed to auto-connect league members')
  }

  return league
}

export async function getMyLeagues(userId) {
  const { data: memberships, error } = await supabase
    .from('league_members')
    .select('league_id, role')
    .eq('user_id', userId)

  if (error) throw error
  if (!memberships?.length) return []

  const leagueIds = memberships.map((m) => m.league_id)

  const { data: leagues, error: leaguesError } = await supabase
    .from('leagues')
    .select('*')
    .in('id', leagueIds)
    .order('created_at', { ascending: false })

  if (leaguesError) throw leaguesError

  // Get member counts
  const { data: counts } = await supabase
    .from('league_members')
    .select('league_id')
    .in('league_id', leagueIds)

  const countMap = {}
  for (const c of counts || []) {
    countMap[c.league_id] = (countMap[c.league_id] || 0) + 1
  }

  const roleMap = {}
  for (const m of memberships) {
    roleMap[m.league_id] = m.role
  }

  return leagues.map((league) => ({
    ...league,
    member_count: countMap[league.id] || 0,
    my_role: roleMap[league.id],
  }))
}

export async function getLeagueDetails(leagueId, userId) {
  // Verify membership
  const { data: member } = await supabase
    .from('league_members')
    .select('role')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .single()

  if (!member) {
    const err = new Error('You are not a member of this league')
    err.status = 403
    throw err
  }

  const { data: league, error } = await supabase
    .from('leagues')
    .select('*')
    .eq('id', leagueId)
    .single()

  if (error || !league) {
    const err = new Error('League not found')
    err.status = 404
    throw err
  }

  // Get members with user details
  const { data: members } = await supabase
    .from('league_members')
    .select('*, users(id, username, display_name, avatar_emoji, tier, total_points)')
    .eq('league_id', leagueId)
    .order('joined_at', { ascending: true })

  // Get current week
  const now = new Date().toISOString()
  const { data: currentWeek } = await supabase
    .from('league_weeks')
    .select('*')
    .eq('league_id', leagueId)
    .lte('starts_at', now)
    .gte('ends_at', now)
    .single()

  // Check if settings are still editable (commissioner only, pick'em/survivor)
  let settingsEditable = false
  if (member.role === 'commissioner' && (league.format === 'pickem' || league.format === 'survivor')) {
    if (league.status === 'open') {
      settingsEditable = true
    } else {
      const hasLocked = await checkLeagueHasLockedPicks(leagueId, league)
      settingsEditable = !hasLocked
    }
  }

  return {
    ...league,
    my_role: member.role,
    members: members || [],
    current_week: currentWeek || null,
    settings_editable: settingsEditable,
  }
}

async function checkLeagueHasLockedPicks(leagueId, league) {
  if (league.format === 'survivor') {
    const { count } = await supabase
      .from('survivor_picks')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .in('status', ['locked', 'survived', 'eliminated'])
    return count > 0
  }
  if (league.format === 'pickem' && league.use_league_picks) {
    const { count } = await supabase
      .from('league_picks')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .in('status', ['locked', 'settled'])
    return count > 0
  }
  return true // other formats: treat as locked
}

export async function updateLeague(leagueId, userId, data) {
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id, status, format, use_league_picks')
    .eq('id', leagueId)
    .single()

  if (!league) {
    const err = new Error('League not found')
    err.status = 404
    throw err
  }

  if (league.commissioner_id !== userId) {
    const err = new Error('Only the commissioner can update league settings')
    err.status = 403
    throw err
  }

  // commissioner_note can be updated regardless of league status
  const noteOnly = Object.keys(data).every((k) => k === 'commissioner_note')
  const settingsOnly = Object.keys(data).every((k) => ['settings', 'commissioner_note', 'starts_at', 'ends_at', 'duration'].includes(k))

  if (!noteOnly && league.status !== 'open') {
    // For pick'em and survivor, allow settings edits until the first pick locks
    if (settingsOnly && (league.format === 'pickem' || league.format === 'survivor')) {
      const hasLockedPicks = await checkLeagueHasLockedPicks(leagueId, league)
      if (hasLockedPicks) {
        const err = new Error('Cannot update settings — a picked game has already started')
        err.status = 400
        throw err
      }
    } else {
      const err = new Error('Cannot update a league that has already started')
      err.status = 400
      throw err
    }
  }

  const updates = { updated_at: new Date().toISOString() }
  if (data.name !== undefined) updates.name = data.name
  if (data.max_members !== undefined) updates.max_members = data.max_members
  if (data.settings !== undefined) updates.settings = data.settings
  if (data.starts_at !== undefined) updates.starts_at = data.starts_at
  if (data.ends_at !== undefined) updates.ends_at = data.ends_at
  if (data.commissioner_note !== undefined) updates.commissioner_note = data.commissioner_note

  // Handle duration change — recalculate date range
  if (data.duration !== undefined) {
    updates.duration = data.duration
    let startsAt = new Date()
    let endsAt = null

    if (data.duration === 'this_week') {
      const bounds = getWeekBounds(new Date())
      startsAt = bounds.start
      endsAt = bounds.end
    } else if (data.duration === 'full_season') {
      endsAt = new Date(startsAt)
      endsAt.setMonth(endsAt.getMonth() + 6)
    } else if (data.duration === 'playoffs_only') {
      endsAt = new Date(startsAt)
      endsAt.setMonth(endsAt.getMonth() + 3)
    }
    // custom_range: keep existing dates (user edits them separately)

    if (data.duration !== 'custom_range') {
      updates.starts_at = startsAt.toISOString()
      updates.ends_at = endsAt?.toISOString() || null
    }
  }

  const { data: updated, error } = await supabase
    .from('leagues')
    .update(updates)
    .eq('id', leagueId)
    .select()
    .single()

  if (error) throw error

  // Regenerate league weeks if dates changed
  if (updates.starts_at || updates.ends_at || data.duration) {
    // Delete old weeks (only safe before any picks lock)
    await supabase.from('league_weeks').delete().eq('league_id', leagueId)
    await generateLeagueWeeks(updated)
  }

  return updated
}

export async function getLeagueMembers(leagueId, userId) {
  // Verify membership
  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .single()

  if (!member) {
    const err = new Error('You are not a member of this league')
    err.status = 403
    throw err
  }

  const { data, error } = await supabase
    .from('league_members')
    .select('*, users(id, username, display_name, avatar_emoji, tier, total_points)')
    .eq('league_id', leagueId)
    .order('joined_at', { ascending: true })

  if (error) throw error
  return data
}

export async function leaveLeague(leagueId, userId) {
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single()

  if (league?.commissioner_id === userId) {
    const err = new Error('The commissioner cannot leave the league')
    err.status = 400
    throw err
  }

  const { error } = await supabase
    .from('league_members')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function removeMember(leagueId, commissionerId, targetUserId) {
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single()

  if (!league || league.commissioner_id !== commissionerId) {
    const err = new Error('Only the commissioner can remove members')
    err.status = 403
    throw err
  }

  if (commissionerId === targetUserId) {
    const err = new Error('The commissioner cannot be removed')
    err.status = 400
    throw err
  }

  const { error } = await supabase
    .from('league_members')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', targetUserId)

  if (error) throw error
}

export async function getLeagueWeeks(leagueId, userId) {
  // Verify membership
  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .single()

  if (!member) {
    const err = new Error('You are not a member of this league')
    err.status = 403
    throw err
  }

  const { data, error } = await supabase
    .from('league_weeks')
    .select('*')
    .eq('league_id', leagueId)
    .order('week_number', { ascending: true })

  if (error) throw error
  return data
}

export async function getPickemStandings(leagueId) {
  const { data: league } = await supabase
    .from('leagues')
    .select('*')
    .eq('id', leagueId)
    .single()

  if (!league) {
    const err = new Error('League not found')
    err.status = 404
    throw err
  }

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, users(id, username, display_name, avatar_emoji, tier)')
    .eq('league_id', leagueId)

  if (!members?.length) return []

  const userIds = members.map((m) => m.user_id)

  const useSubmissionOdds = league.settings?.lock_odds_at === 'submission'

  // Get picks for these users within the league's date range and sport
  let picksQuery = supabase
    .from('picks')
    .select('user_id, game_id, points_earned, is_correct, reward_at_submission, risk_at_submission, games!inner(starts_at, sports!inner(key))')
    .in('user_id', userIds)
    .eq('status', 'settled')

  if (league.sport !== 'all') {
    picksQuery = picksQuery.eq('games.sports.key', league.sport)
  }
  if (league.starts_at) {
    picksQuery = picksQuery.gte('games.starts_at', league.starts_at)
  }
  if (league.ends_at) {
    picksQuery = picksQuery.lte('games.starts_at', league.ends_at)
  }

  const { data: picks } = await picksQuery

  // Also fetch settled prop picks for these users
  let propPicksQuery = supabase
    .from('prop_picks')
    .select('user_id, points_earned, is_correct, reward_at_submission, risk_at_submission, player_props!inner(game_id, sport_id, games!inner(starts_at, sports!inner(key)))')
    .in('user_id', userIds)
    .eq('status', 'settled')

  if (league.sport !== 'all') {
    propPicksQuery = propPicksQuery.eq('player_props.games.sports.key', league.sport)
  }
  if (league.starts_at) {
    propPicksQuery = propPicksQuery.gte('player_props.games.starts_at', league.starts_at)
  }
  if (league.ends_at) {
    propPicksQuery = propPicksQuery.lte('player_props.games.starts_at', league.ends_at)
  }

  const { data: propPicks } = await propPicksQuery

  // If games_per_week is set, filter to only selected games
  let validGameIds = null
  if (league.settings?.games_per_week) {
    const { data: selections } = await supabase
      .from('pickem_selections')
      .select('user_id, game_id')
      .eq('league_id', leagueId)

    if (selections) {
      validGameIds = {}
      for (const s of selections) {
        if (!validGameIds[s.user_id]) validGameIds[s.user_id] = new Set()
        validGameIds[s.user_id].add(s.game_id)
      }
    }
  }

  // Aggregate by user
  const statsMap = {}
  for (const m of members) {
    statsMap[m.user_id] = {
      user_id: m.user_id,
      user: m.users,
      total_points: 0,
      total_picks: 0,
      correct_picks: 0,
    }
  }

  for (const pick of picks || []) {
    // Skip if games_per_week is set and this game wasn't selected
    if (validGameIds && !validGameIds[pick.user_id]?.has(pick.game_id)) continue

    const s = statsMap[pick.user_id]
    if (!s) continue

    let points = pick.points_earned || 0
    if (useSubmissionOdds && pick.reward_at_submission != null) {
      if (pick.is_correct === true) points = pick.reward_at_submission
      else if (pick.is_correct === false) points = -(pick.risk_at_submission || 0)
      else points = 0
    }

    s.total_points += points
    s.total_picks++
    if (pick.is_correct) s.correct_picks++
  }

  // Add prop pick points to standings
  for (const propPick of propPicks || []) {
    const s = statsMap[propPick.user_id]
    if (!s) continue

    let points = propPick.points_earned || 0
    if (useSubmissionOdds && propPick.reward_at_submission != null) {
      if (propPick.is_correct === true) points = propPick.reward_at_submission
      else if (propPick.is_correct === false) points = -(propPick.risk_at_submission || 0)
      else points = 0
    }

    s.total_points += points
    s.total_picks++
    if (propPick.is_correct) s.correct_picks++
  }

  const standings = Object.values(statsMap)
    .sort((a, b) => b.total_points - a.total_points)
    .map((s, i) => ({ ...s, rank: i + 1 }))

  return standings
}

export async function selectPickemGames(leagueId, userId, weekId, gameIds) {
  const { data: league } = await supabase
    .from('leagues')
    .select('settings')
    .eq('id', leagueId)
    .single()

  if (!league) {
    const err = new Error('League not found')
    err.status = 404
    throw err
  }

  const limit = league.settings?.games_per_week
  if (!limit) {
    const err = new Error('This league does not have a games-per-week limit')
    err.status = 400
    throw err
  }

  if (gameIds.length > limit) {
    const err = new Error(`You can only select ${limit} games per week`)
    err.status = 400
    throw err
  }

  // Clear existing selections for this week
  await supabase
    .from('pickem_selections')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('league_week_id', weekId)

  // Insert new selections
  const rows = gameIds.map((gameId) => ({
    league_id: leagueId,
    user_id: userId,
    league_week_id: weekId,
    game_id: gameId,
  }))

  const { error } = await supabase.from('pickem_selections').insert(rows)
  if (error) throw error

  return rows
}

export async function deleteLeague(leagueId, userId) {
  const { data: league, error: fetchError } = await supabase
    .from('leagues')
    .select('id, commissioner_id, format')
    .eq('id', leagueId)
    .single()

  if (fetchError || !league) {
    const err = new Error('League not found')
    err.status = 404
    throw err
  }

  if (league.commissioner_id !== userId) {
    const err = new Error('Only the commissioner can delete a league')
    err.status = 403
    throw err
  }

  const { error } = await supabase
    .from('leagues')
    .delete()
    .eq('id', leagueId)

  if (error) {
    logger.error({ error, leagueId }, 'Failed to delete league')
    throw error
  }
}

export async function getLeagueStandings(leagueId, userId) {
  // Verify membership
  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .single()

  if (!member) {
    const err = new Error('You are not a member of this league')
    err.status = 403
    throw err
  }

  const { data: league } = await supabase
    .from('leagues')
    .select('format, use_league_picks')
    .eq('id', leagueId)
    .single()

  if (league.format === 'pickem') {
    if (league.use_league_picks) {
      return getLeaguePickStandings(leagueId)
    }
    return getPickemStandings(leagueId)
  }

  if (league.format === 'bracket') {
    return getBracketStandings(leagueId)
  }

  // For survivor and squares, return members with relevant data
  if (league.format === 'survivor') {
    const { data: members } = await supabase
      .from('league_members')
      .select('*, users(id, username, display_name, avatar_emoji, tier)')
      .eq('league_id', leagueId)
      .order('is_alive', { ascending: false })

    return members || []
  }

  return []
}
