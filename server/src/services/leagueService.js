import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createTournament, getBracketStandings } from './bracketService.js'
import { getLeaguePickStandings } from './leaguePickService.js'

// REGULAR-season end dates by sport. Full-season leagues end AFTER the
// last day of the regular season's games (NO playoffs). Returns a Date
// at 10 AM UTC the day AFTER the last game day, so all West Coast night
// games on the final day finish before the league closes.
function regularSeasonEnd(sportKey, startsAt) {
  if (!sportKey) return null
  // [month0, day] of the last regular-season game day
  const endMd = {
    basketball_nba: [3, 12],         // Apr 12
    americanfootball_nfl: [0, 5],    // Jan 5
    baseball_mlb: [8, 29],           // Sep 29
    basketball_ncaab: [2, 8],        // Mar 8
    basketball_wncaab: [2, 8],
    americanfootball_ncaaf: [11, 7], // Dec 7
    basketball_wnba: [8, 14],        // Sep 14
    icehockey_nhl: [3, 18],          // Apr 18
    soccer_usa_mls: [9, 18],         // Oct 18
  }[sportKey]
  if (!endMd) return null
  const start = startsAt ? new Date(startsAt) : new Date()
  let year = start.getUTCFullYear()
  // Build end-of-last-day-plus-one in UTC, matching parseEndDate convention
  let candidate = new Date(Date.UTC(year, endMd[0], endMd[1] + 1, 10, 0, 0))
  if (candidate < start) {
    candidate = new Date(Date.UTC(year + 1, endMd[0], endMd[1] + 1, 10, 0, 0))
  }
  return candidate
}

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
  const day = d.getUTCDay()
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7))
  monday.setUTCHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  sunday.setUTCHours(23, 59, 59, 999)
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
  // Append T12:00:00 to date-only strings to avoid UTC midnight → previous day shift
  function parseDate(str) {
    if (!str) return null
    if (str.length === 10) return new Date(str + 'T12:00:00') // date-only: YYYY-MM-DD
    return new Date(str)
  }

  // End dates use end-of-sports-day: next day 10:00 UTC (6 AM ET)
  // so all US evening/West Coast games on the selected date are included
  function parseEndDate(str) {
    if (!str) return null
    if (str.length === 10) {
      const d = new Date(str + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + 1)
      d.setUTCHours(10, 0, 0, 0)
      return d
    }
    return new Date(str)
  }

  let startsAt = data.starts_at ? parseDate(data.starts_at) : new Date()
  let endsAt = data.ends_at ? parseEndDate(data.ends_at) : null

  if (data.duration === 'this_week') {
    const bounds = getWeekBounds(new Date())
    // starts_at stays as now (not Monday), so league stays open for invites
    endsAt = bounds.end
  } else if (data.duration === 'full_season') {
    // Sport-aware regular-season end. Falls back to +6mo for unknown sports.
    endsAt = endsAt || regularSeasonEnd(data.sport, startsAt) || (() => {
      const d = new Date(startsAt)
      d.setMonth(d.getMonth() + 6)
      return d
    })()
  } else if (data.duration === 'playoffs_only') {
    endsAt = new Date(startsAt)
    endsAt.setMonth(endsAt.getMonth() + 3)
  }

  // For custom ranges, keep noon UTC (safe for all US timezones)
  // No setHours — parseDate already gives noon which won't shift dates

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
      visibility: data.visibility || 'closed',
      joins_locked_at: data.joins_locked_at
        ? (['nba_dfs', 'mlb_dfs', 'hr_derby'].includes(data.format) && data.joins_locked_at.length === 10
          // For DFS formats, date-only string → end of sports day (next day 10 AM UTC / 6 AM ET)
          ? (() => { const d = new Date(data.joins_locked_at + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(10, 0, 0, 0); return d.toISOString() })()
          : data.joins_locked_at)
        : null,
      backdrop_image: data.backdrop_image || null,
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

  // Create fantasy settings if format is fantasy
  if (league.format === 'fantasy' || league.format === 'nba_dfs') {
    const { createFantasySettings } = await import('./fantasyService.js')
    await createFantasySettings(league.id, data.fantasy_settings || {})
  }

  // Guard: traditional fantasy is only creatable BEFORE the season opener
  // kicks off. Once the first Week 1 game has started, only Salary Cap is
  // available — late-start traditional leagues are weird and the draft
  // can't really happen anyway.
  if (league.format === 'fantasy' && data.fantasy_settings?.format !== 'salary_cap') {
    try {
      const { getSeasonOpenerKickoff } = await import('./tdPassService.js')
      const opener = await getSeasonOpenerKickoff()
      if (opener && new Date(opener).getTime() <= Date.now()) {
        await supabase.from('leagues').delete().eq('id', league.id)
        const err = new Error('Traditional fantasy can only be created before the NFL season opens. Use Salary Cap instead.')
        err.status = 400
        throw err
      }
    } catch (err) {
      if (err.status) throw err
      logger.warn({ err }, 'Could not verify season opener for traditional fantasy lock')
    }
  }

  // TD Pass: lock joins at the start of the very last NFL game of the
  // current week, so users can join right up until the final kickoff
  // (typically MNF, or the MNF doubleheader nightcap).
  if (league.format === 'td_pass') {
    try {
      const { getCurrentWeekLastKickoff } = await import('./tdPassService.js')
      const lastKickoff = await getCurrentWeekLastKickoff()
      if (lastKickoff) {
        await supabase
          .from('leagues')
          .update({ joins_locked_at: lastKickoff })
          .eq('id', league.id)
        league.joins_locked_at = lastKickoff
      }
    } catch (err) {
      logger.error({ err, leagueId: league.id }, 'Failed to set td_pass joins_locked_at')
    }
  }

  return league
}

export async function generateLeagueWeeks(league) {
  if (!league.starts_at) return

  const isDaily = league.settings?.pick_frequency === 'daily'
  const periods = []
  let periodNum = 1
  const current = new Date(league.starts_at)
  // Survivor "last one standing" leagues have no ends_at — generate enough
  // periods to cover the foreseeable horizon (1 year). extendLeagueWeeks
  // tops them up if a league runs longer.
  const end = league.ends_at
    ? new Date(league.ends_at)
    : new Date(new Date(league.starts_at).getTime() + 365 * 24 * 60 * 60 * 1000)

  if (isDaily) {
    // Daily mode: one entry per day
    // Use 10:00 UTC to 09:59 UTC boundaries (6 AM ET to 5:59 AM ET)
    // so US evening games land on the correct calendar date
    current.setUTCHours(10, 0, 0, 0)

    while (current < end) {
      const dayEnd = new Date(current)
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)
      dayEnd.setUTCHours(9, 59, 59, 999)

      periods.push({
        league_id: league.id,
        week_number: periodNum++,
        starts_at: current.toISOString(),
        ends_at: dayEnd.toISOString(),
      })

      current.setUTCDate(current.getUTCDate() + 1)
    }
  } else {
    // Weekly mode: Monday 10:00 UTC to next Monday 09:59 UTC
    const day = current.getUTCDay()
    current.setUTCDate(current.getUTCDate() - ((day + 6) % 7))
    current.setUTCHours(10, 0, 0, 0)

    while (current < end) {
      const weekEnd = new Date(current)
      weekEnd.setUTCDate(current.getUTCDate() + 7)
      weekEnd.setUTCHours(9, 59, 59, 999)

      periods.push({
        league_id: league.id,
        week_number: periodNum++,
        starts_at: current.toISOString(),
        ends_at: weekEnd.toISOString(),
      })

      current.setUTCDate(current.getUTCDate() + 7)
    }
  }

  if (periods.length > 0) {
    const { error } = await supabase.from('league_weeks').insert(periods)
    if (error) {
      logger.error({ error, leagueId: league.id }, 'Failed to generate league weeks')
    }
  }
}

async function extendLeagueWeeks(league) {
  if (!league.starts_at || !league.ends_at) return

  // Get existing weeks to find where to start appending
  const { data: existingWeeks } = await supabase
    .from('league_weeks')
    .select('*')
    .eq('league_id', league.id)
    .order('week_number', { ascending: false })
    .limit(1)

  const lastWeek = existingWeeks?.[0]
  if (!lastWeek) {
    // No existing weeks, generate from scratch
    await generateLeagueWeeks(league)
    return
  }

  const isDaily = league.settings?.pick_frequency === 'daily'
  const end = new Date(league.ends_at)
  const periods = []
  let periodNum = lastWeek.week_number + 1
  const current = new Date(lastWeek.ends_at)
  // Move past the last week's end
  current.setUTCMilliseconds(current.getUTCMilliseconds() + 1)

  if (isDaily) {
    current.setUTCHours(10, 0, 0, 0)
    while (current < end) {
      const dayEnd = new Date(current)
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)
      dayEnd.setUTCHours(9, 59, 59, 999)

      periods.push({
        league_id: league.id,
        week_number: periodNum++,
        starts_at: current.toISOString(),
        ends_at: dayEnd.toISOString(),
      })

      current.setUTCDate(current.getUTCDate() + 1)
    }
  } else {
    // Align to next Monday 10:00 UTC
    const day = current.getUTCDay()
    const daysToMonday = (8 - day) % 7 || 7
    current.setUTCDate(current.getUTCDate() + daysToMonday)
    current.setUTCHours(10, 0, 0, 0)

    while (current < end) {
      const weekEnd = new Date(current)
      weekEnd.setUTCDate(current.getUTCDate() + 7)
      weekEnd.setUTCHours(9, 59, 59, 999)

      periods.push({
        league_id: league.id,
        week_number: periodNum++,
        starts_at: current.toISOString(),
        ends_at: weekEnd.toISOString(),
      })

      current.setUTCDate(current.getUTCDate() + 7)
    }
  }

  if (periods.length > 0) {
    const { error } = await supabase.from('league_weeks').insert(periods)
    if (error) {
      logger.error({ error, leagueId: league.id }, 'Failed to extend league weeks')
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

  if (league.status === 'completed') {
    const err = new Error('This league is no longer accepting members')
    err.status = 400
    throw err
  }

  // For survivor/pickem, allow joining if league hasn't started yet or any period still has time left
  if (['survivor', 'pickem'].includes(league.format)) {
    // If league starts in the future, always allow joining
    const startsInFuture = league.starts_at && new Date(league.starts_at) > new Date()
    if (!startsInFuture) {
      const { count } = await supabase
        .from('league_weeks')
        .select('id', { count: 'exact', head: true })
        .eq('league_id', league.id)
        .gt('ends_at', new Date().toISOString())

      if (!count) {
        const err = new Error('This league is no longer accepting new members')
        err.status = 400
        throw err
      }
    }
  } else if (league.format === 'bracket') {
    // Bracket leagues allow joining until the bracket locks
    const { data: tournament } = await supabase
      .from('bracket_tournaments')
      .select('locks_at, status')
      .eq('league_id', league.id)
      .single()

    if (tournament && new Date(tournament.locks_at) <= new Date()) {
      const err = new Error('This bracket is locked and no longer accepting entries')
      err.status = 400
      throw err
    }
  } else if (['nba_dfs', 'mlb_dfs', 'hr_derby'].includes(league.format)) {
    // DFS formats use joins_locked_at (first tip-off) instead of starts_at
    if (league.joins_locked_at && new Date(league.joins_locked_at) <= new Date()) {
      const err = new Error('This league is locked — games have started')
      err.status = 400
      throw err
    }
  } else if (league.format === 'fantasy') {
    // Fantasy leagues: allow joining until draft starts
    const { data: fs } = await supabase
      .from('fantasy_settings')
      .select('draft_status')
      .eq('league_id', league.id)
      .maybeSingle()
    if (fs && fs.draft_status !== 'pending') {
      const err = new Error('This league\'s draft has already started')
      err.status = 400
      throw err
    }
  } else if (league.starts_at && new Date(league.starts_at) <= new Date()) {
    const err = new Error('This league has already started')
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

  // Clean up any pending invitations for this user in this league
  await supabase
    .from('league_invitations')
    .delete()
    .eq('league_id', league.id)
    .eq('recipient_id', userId)
    .eq('status', 'pending')

  return league
}

export async function getMyLeagues(userId, userTz) {
  const { data: memberships, error } = await supabase
    .from('league_members')
    .select('league_id, role, display_order')
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
  const orderMap = {}
  for (const m of memberships) {
    roleMap[m.league_id] = m.role
    orderMap[m.league_id] = m.display_order
  }

  // Pull draft_date + draft_status for fantasy leagues so the My Leagues
  // cards can show a live "Draft starts in N days" countdown until the
  // draft completes.
  const fantasyLeagueIds = (leagues || [])
    .filter((l) => l.format === 'fantasy')
    .map((l) => l.id)
  const fantasyMeta = {}
  if (fantasyLeagueIds.length) {
    const { data: fs } = await supabase
      .from('fantasy_settings')
      .select('league_id, draft_date, draft_status')
      .in('league_id', fantasyLeagueIds)
    for (const row of fs || []) {
      fantasyMeta[row.league_id] = { draft_date: row.draft_date, draft_status: row.draft_status }
    }
  }

  const result = leagues.map((league) => ({
    ...league,
    member_count: countMap[league.id] || 0,
    my_role: roleMap[league.id],
    display_order: orderMap[league.id] ?? null,
    draft_date: fantasyMeta[league.id]?.draft_date || null,
    draft_status: fantasyMeta[league.id]?.draft_status || null,
  }))

  // Compute per-league readiness (green/yellow/red corner clip)
  try {
    const { computeLeagueReadiness } = await import('./readinessService.js')
    const readinessMap = await computeLeagueReadiness(userId, result, userTz)
    for (const l of result) {
      const r = readinessMap.get(l.id)
      l.readiness = r?.state || null
      l.readiness_detail = r?.detail || null
    }
  } catch (err) {
    logger.error({ err }, 'Failed to attach league readiness')
  }

  // Sort by display_order (nulls last), then created_at desc
  result.sort((a, b) => {
    if (a.display_order != null && b.display_order != null) return a.display_order - b.display_order
    if (a.display_order != null) return -1
    if (b.display_order != null) return 1
    return new Date(b.created_at) - new Date(a.created_at)
  })

  return result
}

export async function getLeagueDetails(leagueId, userId) {
  // Verify membership
  const { data: member } = await supabase
    .from('league_members')
    .select('role, auto_connect')
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
    .select('*, users(id, username, display_name, avatar_url, avatar_emoji, tier, total_points)')
    .eq('league_id', leagueId)
    .order('joined_at', { ascending: true })

  // Get pending invitations, excluding users who already joined
  const memberUserIds = new Set((members || []).map((m) => m.users?.id).filter(Boolean))
  const { data: rawPendingInvitations } = await supabase
    .from('league_invitations')
    .select('id, status, created_at, user:invited_user_id(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  const pendingInvitations = (rawPendingInvitations || []).filter((inv) => !memberUserIds.has(inv.user?.id))

  // Get current week (active period that covers now)
  const now = new Date().toISOString()
  const { data: currentWeek } = await supabase
    .from('league_weeks')
    .select('*')
    .eq('league_id', leagueId)
    .lte('starts_at', now)
    .gte('ends_at', now)
    .maybeSingle()

  // Fallback: if no active period, get the next upcoming one
  let activeWeek = currentWeek
  if (!activeWeek) {
    const { data: nextWeek } = await supabase
      .from('league_weeks')
      .select('*')
      .eq('league_id', leagueId)
      .gt('starts_at', now)
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    activeWeek = nextWeek
  }

  // Commissioner can always see settings editor (backdrop, narrative, etc.)
  // has_locked_picks tells the frontend which settings to disable
  let settingsEditable = false
  let hasLockedPicks = false
  if (member.role === 'commissioner') {
    settingsEditable = true
    if (league.status !== 'open') {
      hasLockedPicks = await checkLeagueHasLockedPicks(leagueId, league)
    }
  }

  // Check if all league mates are already in user's squad
  const otherMemberIds = (members || []).map(m => m.user_id).filter(id => id !== userId)
  let allConnected = false
  if (otherMemberIds.length > 0) {
    const { count } = await supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .or(`and(user_id_1.eq.${userId},user_id_2.in.(${otherMemberIds.join(',')})),and(user_id_2.eq.${userId},user_id_1.in.(${otherMemberIds.join(',')}))`)
      .eq('status', 'connected')
    allConnected = count >= otherMemberIds.length
  } else {
    allConnected = true
  }

  // Get champion data for completed leagues
  let champion = null
  if (league.status === 'completed' && league.format !== 'squares') {
    const { data: winBonus } = await supabase
      .from('bonus_points')
      .select('user_id, points, label, users(id, username, display_name, avatar_url, avatar_emoji)')
      .eq('league_id', leagueId)
      .in('type', ['league_win', 'survivor_win'])
      .order('points', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (winBonus?.users) {
      champion = {
        user: winBonus.users,
        points: winBonus.points,
        label: winBonus.label,
      }
    }
  }

  return {
    ...league,
    my_role: member.role,
    my_auto_connect: member.auto_connect ?? true,
    all_members_connected: allConnected,
    members: members || [],
    pending_invitations: pendingInvitations || [],
    current_week: activeWeek || null,
    settings_editable: settingsEditable,
    has_locked_picks: hasLockedPicks,
    champion,
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
  if (league.format === 'pickem') {
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
    .select('commissioner_id, status, format, settings, starts_at')
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

  // commissioner_note and visibility can always be updated
  const alwaysAllowed = ['commissioner_note', 'visibility', 'joins_locked_at', 'backdrop_image', 'backdrop_y']
  const noteOnly = Object.keys(data).every((k) => alwaysAllowed.includes(k))
  const settingsOnly = Object.keys(data).every((k) => ['settings', 'commissioner_note', 'starts_at', 'ends_at', 'duration', 'name', 'max_members', 'visibility', 'joins_locked_at'].includes(k))

  if (!noteOnly && league.status !== 'open') {
    if (settingsOnly && (league.format === 'pickem' || league.format === 'survivor')) {
      const hasLockedPicks = await checkLeagueHasLockedPicks(leagueId, league)
      if (hasLockedPicks) {
        // Per-setting validation: block only dangerous changes
        const dangerousSettings = ['pick_frequency', 'lives']
        if (data.settings) {
          const currentSettings = league.settings || {}
          for (const key of dangerousSettings) {
            if (data.settings[key] !== undefined && data.settings[key] !== (currentSettings[key] ?? (key === 'lives' ? 1 : 'weekly'))) {
              const err = new Error(`Cannot change ${key === 'lives' ? 'lives' : 'pick frequency'} after picks have locked`)
              err.status = 400
              throw err
            }
          }
        }
        // Block starts_at changes after picks lock
        if (data.starts_at !== undefined) {
          const err = new Error('Cannot change start date after picks have locked')
          err.status = 400
          throw err
        }
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
  if (data.ends_at !== undefined) {
    // Parse end date to end-of-sports-day if date-only string
    if (typeof data.ends_at === 'string' && data.ends_at.length === 10) {
      const d = new Date(data.ends_at + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + 1)
      d.setUTCHours(10, 0, 0, 0)
      updates.ends_at = d.toISOString()
    } else {
      updates.ends_at = data.ends_at
    }
  }
  if (data.commissioner_note !== undefined) updates.commissioner_note = data.commissioner_note
  if (data.visibility !== undefined) updates.visibility = data.visibility
  if (data.joins_locked_at !== undefined) updates.joins_locked_at = data.joins_locked_at
  if (data.backdrop_image !== undefined) updates.backdrop_image = data.backdrop_image
  if (data.backdrop_y !== undefined) updates.backdrop_y = data.backdrop_y

  // Handle duration change — recalculate date range
  // When picks are locked, preserve existing starts_at (only extend ends_at)
  if (data.duration !== undefined) {
    updates.duration = data.duration
    const hasLockedPicks = await checkLeagueHasLockedPicks(leagueId, league)
    let startsAt = hasLockedPicks ? new Date(league.starts_at) : new Date()
    let endsAt = null

    if (data.duration === 'this_week') {
      const bounds = getWeekBounds(new Date())
      if (!hasLockedPicks) startsAt = bounds.start
      endsAt = bounds.end
    } else if (data.duration === 'full_season') {
      endsAt = regularSeasonEnd(league.sport, startsAt) || (() => {
        const d = new Date(startsAt)
        d.setMonth(d.getMonth() + 6)
        return d
      })()
    } else if (data.duration === 'playoffs_only') {
      endsAt = new Date(startsAt)
      endsAt.setMonth(endsAt.getMonth() + 3)
    }
    // custom_range: keep existing dates (user edits them separately)

    if (data.duration !== 'custom_range') {
      if (!hasLockedPicks) updates.starts_at = startsAt.toISOString()
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
    const hasLockedPicks = await checkLeagueHasLockedPicks(leagueId, league)
    if (hasLockedPicks) {
      // Don't delete existing weeks — would cascade-delete picks
      // Instead, extend with new weeks after the last existing one
      await extendLeagueWeeks(updated)
    } else {
      await supabase.from('league_weeks').delete().eq('league_id', leagueId)
      await generateLeagueWeeks(updated)
    }
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
    .select('*, users(id, username, display_name, avatar_url, avatar_emoji, tier, total_points)')
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
    .select('user_id, users(id, username, display_name, avatar_url, avatar_emoji, tier, total_points)')
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
    .select('id, name, commissioner_id, format')
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

  // Get members to notify (exclude commissioner)
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)
    .neq('user_id', userId)

  const { error } = await supabase
    .from('leagues')
    .delete()
    .eq('id', leagueId)

  if (error) {
    logger.error({ error, leagueId }, 'Failed to delete league')
    throw error
  }

  // Notify members after deletion
  if (members?.length) {
    const { createNotification } = await import('./notificationService.js')
    for (const m of members) {
      await createNotification(m.user_id, 'league_deleted',
        `The league "${league.name}" has been deleted by the commissioner.`)
    }
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
    .select('format')
    .eq('id', leagueId)
    .single()

  if (league.format === 'pickem') {
    return getLeaguePickStandings(leagueId)
  }

  if (league.format === 'bracket') {
    return getBracketStandings(leagueId)
  }

  // For survivor and squares, return members with relevant data
  if (league.format === 'survivor') {
    const { data: members } = await supabase
      .from('league_members')
      .select('*, users(id, username, display_name, avatar_url, avatar_emoji, tier, total_points)')
      .eq('league_id', leagueId)
      .order('is_alive', { ascending: false })

    return members || []
  }

  return []
}
