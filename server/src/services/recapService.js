import { supabase } from '../config/supabase.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { getTier } from '../config/constants.js'
import { getPronouns } from '../utils/pronouns.js'
import { getAllCrownHolders } from './leaderboardService.js'

/**
 * Collect weekly performance data for all users who made picks
 * in the given Monday–Sunday window.
 */
export async function collectWeeklyData(weekStart, weekEnd) {
  const startISO = weekStart.toISOString()
  const endISO = weekEnd.toISOString()

  // 1. Settled picks in the date range (with timestamp + sport for daily breakdown)
  const { data: picks } = await supabase
    .from('picks')
    .select('user_id, points_earned, is_correct, odds_at_pick, reward_points, risk_points, picked_team, updated_at, games(home_team, away_team, home_score, away_score, sports(name))')
    .eq('status', 'settled')
    .not('points_earned', 'is', null)
    .gte('updated_at', startISO)
    .lte('updated_at', endISO)

  // 2. Settled parlays
  const { data: parlays } = await supabase
    .from('parlays')
    .select('user_id, points_earned, is_correct, leg_count, risk_points, reward_points, combined_multiplier, updated_at')
    .eq('status', 'settled')
    .not('points_earned', 'is', null)
    .gte('updated_at', startISO)
    .lte('updated_at', endISO)

  // 3. Settled prop picks (with details for highlights)
  const { data: propPicks } = await supabase
    .from('prop_picks')
    .select('user_id, points_earned, is_correct, picked_side, odds_at_pick, updated_at, player_props(player_name, market_label, line, actual_value, sport_id, sports(name))')
    .eq('status', 'settled')
    .not('points_earned', 'is', null)
    .gte('updated_at', startISO)
    .lte('updated_at', endISO)

  // 4. Settled futures picks
  const { data: futuresPicks } = await supabase
    .from('futures_picks')
    .select('user_id, points_earned, is_correct')
    .eq('status', 'settled')
    .not('points_earned', 'is', null)
    .gte('updated_at', startISO)
    .lte('updated_at', endISO)

  // 5. Current streaks per user (max across all sports)
  const { data: allStats } = await supabase
    .from('user_sport_stats')
    .select('user_id, current_streak, sports(name)')

  // 6. All users for rank calculation
  const { data: allUsers } = await supabase
    .from('users')
    .select('id, username, display_name, total_points, tier, title_preference')
    .order('total_points', { ascending: false })

  // Build per-user aggregation
  const userMap = {}
  function getUser(userId) {
    if (!userMap[userId]) {
      userMap[userId] = {
        user_id: userId,
        picks_wins: 0,
        picks_losses: 0,
        picks_pushes: 0,
        picks_points: 0,
        parlays_total: 0,
        parlays_won: 0,
        parlays_points: 0,
        props_wins: 0,
        props_losses: 0,
        props_points: 0,
        futures_wins: 0,
        futures_losses: 0,
        futures_points: 0,
        biggest_underdog_odds: 0,
        biggest_underdog_reward: 0,
        biggest_underdog_game: null,
        biggest_underdog_picked: null,
        pick_details: [],
        parlay_details: [],
        prop_details: [],
        daily: {}, // 'Mon' → { wins, losses, points }
        total_picks: 0,
      }
    }
    return userMap[userId]
  }

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  function dayBucket(u, ts) {
    const d = new Date(ts)
    // Use Pacific time so the day boundary feels natural to users
    const pacificDate = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    const key = DAY_NAMES[pacificDate.getDay()]
    if (!u.daily[key]) u.daily[key] = { wins: 0, losses: 0, points: 0 }
    return u.daily[key]
  }

  // Aggregate picks
  for (const p of picks || []) {
    const u = getUser(p.user_id)
    u.total_picks++
    u.picks_points += p.points_earned
    const pickedTeam = p.picked_team === 'home' ? p.games?.home_team : p.games?.away_team
    u.pick_details.push({
      picked_team: pickedTeam,
      game: p.games ? `${p.games.away_team} @ ${p.games.home_team}` : null,
      final_score: p.games && p.games.away_score != null && p.games.home_score != null
        ? `${p.games.away_score}-${p.games.home_score}` : null,
      sport: p.games?.sports?.name || null,
      odds: p.odds_at_pick,
      points_earned: p.points_earned,
      is_correct: p.is_correct,
    })
    if (p.is_correct === true) {
      u.picks_wins++
      // Track biggest underdog hit (positive odds = underdog)
      if (p.odds_at_pick > 0 && p.reward_points > u.biggest_underdog_reward) {
        u.biggest_underdog_odds = p.odds_at_pick
        u.biggest_underdog_reward = p.reward_points
        u.biggest_underdog_game = p.games
          ? `${p.games.away_team} @ ${p.games.home_team}`
          : null
        u.biggest_underdog_picked = p.picked_team === 'home'
          ? p.games?.home_team
          : p.games?.away_team
      }
    } else if (p.is_correct === false) {
      u.picks_losses++
    } else {
      u.picks_pushes++
    }
    // Daily breakdown
    if (p.updated_at) {
      const bucket = dayBucket(u, p.updated_at)
      bucket.points += p.points_earned
      if (p.is_correct === true) bucket.wins++
      else if (p.is_correct === false) bucket.losses++
    }
  }

  // Aggregate parlays
  for (const p of parlays || []) {
    const u = getUser(p.user_id)
    u.total_picks++
    u.parlays_total++
    u.parlays_points += p.points_earned
    if (p.is_correct === true) u.parlays_won++
    u.parlay_details.push({
      leg_count: p.leg_count,
      multiplier: p.combined_multiplier,
      risk: p.risk_points,
      reward: p.reward_points,
      points_earned: p.points_earned,
      is_correct: p.is_correct,
    })
    if (p.updated_at) {
      const bucket = dayBucket(u, p.updated_at)
      bucket.points += p.points_earned
      if (p.is_correct === true) bucket.wins++
      else if (p.is_correct === false) bucket.losses++
    }
  }

  // Aggregate prop picks
  for (const p of propPicks || []) {
    const u = getUser(p.user_id)
    u.total_picks++
    u.props_points += p.points_earned
    if (p.is_correct === true) u.props_wins++
    else if (p.is_correct === false) u.props_losses++
    u.prop_details.push({
      player: p.player_props?.player_name || null,
      market: p.player_props?.market_label || null,
      line: p.player_props?.line ?? null,
      side: p.picked_side,
      actual: p.player_props?.actual_value ?? null,
      sport: p.player_props?.sports?.name || null,
      odds: p.odds_at_pick,
      points_earned: p.points_earned,
      is_correct: p.is_correct,
    })
    if (p.updated_at) {
      const bucket = dayBucket(u, p.updated_at)
      bucket.points += p.points_earned
      if (p.is_correct === true) bucket.wins++
      else if (p.is_correct === false) bucket.losses++
    }
  }

  // Aggregate futures picks
  for (const p of futuresPicks || []) {
    const u = getUser(p.user_id)
    u.total_picks++
    u.futures_points += p.points_earned
    if (p.is_correct === true) u.futures_wins++
    else if (p.is_correct === false) u.futures_losses++
  }

  // Build streak map (max streak per user)
  const streakMap = {}
  for (const s of allStats || []) {
    if (!streakMap[s.user_id] || s.current_streak > streakMap[s.user_id].length) {
      streakMap[s.user_id] = { length: s.current_streak, sport: s.sports?.name || 'Unknown' }
    }
  }

  // Build user info map and rank arrays
  const userInfoMap = {}
  const currentRanks = {}
  for (let i = 0; i < (allUsers || []).length; i++) {
    const u = allUsers[i]
    userInfoMap[u.id] = u
    currentRanks[u.id] = i + 1
  }

  // Filter to users with at least 1 pick this week
  const activeUsers = Object.values(userMap).filter((u) => u.total_picks >= 1)

  // Calculate weekly totals, rank change, tier change per active user
  const enriched = activeUsers.map((u) => {
    const info = userInfoMap[u.user_id] || {}
    const weeklyPoints =
      u.picks_points + u.parlays_points + u.props_points + u.futures_points
    const totalWins = u.picks_wins + u.parlays_won + u.props_wins + u.futures_wins
    const totalLosses = u.picks_losses + u.props_losses + u.futures_losses
    // Parlays that lost count as losses too
    const parlayLosses = u.parlays_total - u.parlays_won
    const allLosses = totalLosses + parlayLosses

    // Rank change: compute hypothetical old rank
    const oldPoints = (info.total_points || 0) - weeklyPoints
    const currentTier = info.tier || getTier(info.total_points || 0).name
    const oldTier = getTier(oldPoints).name
    const tierChange = currentTier !== oldTier ? { from: oldTier, to: currentTier } : null

    // Old rank: sort all users by (total_points - weeklyPoints for this user, unchanged for others)
    // Simplified: count how many users had more points than this user would have had
    let oldRank = 1
    for (const other of allUsers || []) {
      const otherOldPoints = other.id === u.user_id ? oldPoints : other.total_points
      if (otherOldPoints > oldPoints && other.id !== u.user_id) oldRank++
    }
    const rankChange = oldRank - (currentRanks[u.user_id] || oldRank)

    const streak = streakMap[u.user_id] || { length: 0, sport: null }

    // Notable picks: best single pick, worst single pick, biggest underdog hit
    const sortedPicks = [...u.pick_details].sort((a, b) => b.points_earned - a.points_earned)
    const bestPick = sortedPicks[0] && sortedPicks[0].points_earned > 0 ? sortedPicks[0] : null
    const worstPick = sortedPicks.length && sortedPicks[sortedPicks.length - 1].points_earned < 0
      ? sortedPicks[sortedPicks.length - 1] : null
    const underdogHits = u.pick_details.filter((p) => p.is_correct && p.odds > 0)
      .sort((a, b) => b.odds - a.odds)
    const biggestUpset = underdogHits[0] || null
    const notablePicks = [bestPick, worstPick, biggestUpset].filter(Boolean)
    // Dedup by game+picked_team
    const seenKeys = new Set()
    const dedupedPicks = notablePicks.filter((p) => {
      const k = `${p.game}|${p.picked_team}|${p.points_earned}`
      if (seenKeys.has(k)) return false
      seenKeys.add(k)
      return true
    })

    // Notable parlay: biggest winning parlay
    const wonParlays = u.parlay_details.filter((p) => p.is_correct).sort((a, b) => b.points_earned - a.points_earned)
    const notableParlay = wonParlays[0] || null

    // Big parlay milestone: any winning parlay with 4+ legs
    const bigParlays = u.parlay_details.filter((p) => p.is_correct && p.leg_count >= 4)

    // Notable props: best prop hit + worst prop miss
    const sortedProps = [...u.prop_details].sort((a, b) => b.points_earned - a.points_earned)
    const bestProp = sortedProps[0] && sortedProps[0].points_earned > 0 ? sortedProps[0] : null
    const worstProp = sortedProps.length && sortedProps[sortedProps.length - 1].points_earned < 0
      ? sortedProps[sortedProps.length - 1] : null
    const notableProps = [bestProp, worstProp].filter(Boolean)

    // Daily breakdown — chronological Mon→Sun
    const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const dailyArray = DAY_ORDER
      .filter((d) => u.daily[d] && (u.daily[d].wins + u.daily[d].losses > 0))
      .map((d) => ({ day: d, wins: u.daily[d].wins, losses: u.daily[d].losses, points: u.daily[d].points }))

    return {
      user_id: u.user_id,
      username: info.username || 'Unknown',
      display_name: info.display_name || info.username || 'Unknown',
      title_preference: info.title_preference || null,
      tier: currentTier,
      weekly_points: weeklyPoints,
      record: { wins: totalWins, losses: allLosses, pushes: u.picks_pushes },
      biggest_underdog: u.biggest_underdog_reward > 0
        ? { odds: u.biggest_underdog_odds, reward: u.biggest_underdog_reward, game: u.biggest_underdog_game, picked_team: u.biggest_underdog_picked }
        : null,
      parlays: { total: u.parlays_total, won: u.parlays_won, points: u.parlays_points },
      current_streak: streak,
      rank_change: rankChange,
      tier_change: tierChange,
      total_picks: u.total_picks,
      notable_picks: dedupedPicks,
      notable_parlay: notableParlay,
      big_parlays: bigParlays,
      notable_props: notableProps,
      daily_breakdown: dailyArray,
      props_record: { wins: u.props_wins, losses: u.props_losses, points: u.props_points },
    }
  })

  // Sort by weekly points descending
  enriched.sort((a, b) => b.weekly_points - a.weekly_points)

  const top5 = enriched.slice(0, 5)

  // Pick of the Week: biggest single underdog hit across ALL users
  let pickOfWeekUser = null
  let bestUnderdogReward = 0
  for (const u of enriched) {
    if (u.biggest_underdog && u.biggest_underdog.reward > bestUnderdogReward) {
      bestUnderdogReward = u.biggest_underdog.reward
      pickOfWeekUser = u
    }
  }

  // Biggest Fall: user with most negative weekly points
  let biggestFallUser = null
  let worstPoints = 0
  for (const u of enriched) {
    if (u.weekly_points < worstPoints) {
      worstPoints = u.weekly_points
      biggestFallUser = u
    }
  }

  // Longest Active Streak: user with highest current streak
  let longestStreakUser = null
  let longestStreak = 0
  for (const u of enriched) {
    if (u.current_streak.length > longestStreak) {
      longestStreak = u.current_streak.length
      longestStreakUser = u
    }
  }

  // --- Records broken this week ---
  const recordsBroken = []

  // Longest streak: check if the all-time best was updated this week
  const { data: streakRecord } = await supabase
    .from('user_sport_stats')
    .select('user_id, best_streak, sports(name), users(display_name, username)')
    .order('best_streak', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (streakRecord && streakRecord.best_streak > 0) {
    // Check if any user_sport_stats row with the top best_streak was updated this week
    const { data: recentStreak } = await supabase
      .from('user_sport_stats')
      .select('user_id, best_streak, sports(name), users(display_name, username)')
      .eq('best_streak', streakRecord.best_streak)
      .gte('updated_at', startISO)
      .lte('updated_at', endISO)
      .limit(1)
      .maybeSingle()

    if (recentStreak) {
      recordsBroken.push({
        record: 'Longest Streak',
        holder_name: recentStreak.users?.display_name || recentStreak.users?.username || 'Unknown',
        holder_username: recentStreak.users?.username || 'Unknown',
        detail: `${recentStreak.best_streak} (${recentStreak.sports?.name || 'Unknown'})`,
      })
    }
  }

  // Biggest parlay win: check if the all-time biggest was settled this week
  const { data: parlayRecord } = await supabase
    .from('parlays')
    .select('user_id, reward_points, risk_points, users(display_name, username)')
    .eq('is_correct', true).eq('status', 'settled')
    .order('reward_points', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (parlayRecord && parlayRecord.reward_points > 0) {
    const { data: recentParlay } = await supabase
      .from('parlays')
      .select('user_id, reward_points, risk_points, users(display_name, username)')
      .eq('is_correct', true).eq('status', 'settled')
      .eq('reward_points', parlayRecord.reward_points)
      .gte('updated_at', startISO)
      .lte('updated_at', endISO)
      .limit(1)
      .maybeSingle()

    if (recentParlay) {
      recordsBroken.push({
        record: 'Biggest Parlay',
        holder_name: recentParlay.users?.display_name || recentParlay.users?.username || 'Unknown',
        holder_username: recentParlay.users?.username || 'Unknown',
        detail: `${recentParlay.risk_points} → ${recentParlay.reward_points}`,
      })
    }
  }

  // Biggest underdog win: check if the all-time biggest was settled this week
  const { data: underdogRecord } = await supabase
    .from('picks')
    .select('user_id, reward_points, risk_points, odds_at_pick, users(display_name, username)')
    .eq('is_correct', true).eq('status', 'settled').gt('odds_at_pick', 0)
    .order('reward_points', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (underdogRecord && underdogRecord.reward_points > 0) {
    const { data: recentUnderdog } = await supabase
      .from('picks')
      .select('user_id, reward_points, risk_points, odds_at_pick, users(display_name, username)')
      .eq('is_correct', true).eq('status', 'settled').gt('odds_at_pick', 0)
      .eq('reward_points', underdogRecord.reward_points)
      .gte('updated_at', startISO)
      .lte('updated_at', endISO)
      .limit(1)
      .maybeSingle()

    if (recentUnderdog) {
      recordsBroken.push({
        record: 'Biggest Underdog Win',
        holder_name: recentUnderdog.users?.display_name || recentUnderdog.users?.username || 'Unknown',
        holder_username: recentUnderdog.users?.username || 'Unknown',
        detail: `${recentUnderdog.risk_points} → ${recentUnderdog.reward_points} (+${recentUnderdog.odds_at_pick})`,
      })
    }
  }

  // --- Crown changes ---
  const currentCrownHolders = await getAllCrownHolders()

  // Get previous week's crown_holders from last recap
  const { data: prevRecap } = await supabase
    .from('weekly_recaps')
    .select('crown_holders')
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  const previousCrowns = prevRecap?.crown_holders || {}
  const crownChanges = []

  for (const [crown, holder] of Object.entries(currentCrownHolders)) {
    const prevHolderId = previousCrowns[crown]?.id
    if (prevHolderId && prevHolderId !== holder.id) {
      crownChanges.push({
        crown,
        new_holder: holder.display_name || holder.username,
        previous_holder: previousCrowns[crown].display_name || previousCrowns[crown].username || 'Unknown',
      })
    }
  }

  // --- Big league winners (leagues with 10+ members completed this week) ---
  const bigLeagueWinners = []
  const { data: winNotifs } = await supabase
    .from('notifications')
    .select('user_id, metadata, created_at')
    .eq('type', 'league_win')
    .gte('created_at', startISO)
    .lte('created_at', endISO)

  const seenLeagueIds = new Set()
  for (const n of winNotifs || []) {
    const md = n.metadata || {}
    if (md.isWinner !== true) continue
    if (!md.memberCount || md.memberCount < 10) continue
    if (seenLeagueIds.has(md.leagueId)) continue
    seenLeagueIds.add(md.leagueId)

    const info = userInfoMap[n.user_id] || {}
    const enrichedUser = enriched.find((e) => e.user_id === n.user_id)
    const p = getPronouns(info.title_preference)
    bigLeagueWinners.push({
      user_id: n.user_id,
      name: info.display_name || info.username || 'Unknown',
      username: info.username || 'Unknown',
      pronouns: `${p.subject}/${p.object}/${p.possessive}`,
      league_name: md.leagueName || 'Unknown League',
      league_format: md.format || null,
      member_count: md.memberCount,
      points_awarded: md.points ?? null,
      notable_picks: enrichedUser?.notable_picks || [],
      notable_parlay: enrichedUser?.notable_parlay || null,
      weekly_record: enrichedUser ? `${enrichedUser.record.wins}-${enrichedUser.record.losses}` : null,
      weekly_points: enrichedUser?.weekly_points ?? null,
    })
  }

  // --- Survivor advancements: who survived a round this week ---
  const { data: survivorWins } = await supabase
    .from('survivor_picks')
    .select('user_id, team_name, league_id, leagues(name)')
    .eq('status', 'survived')
    .gte('updated_at', startISO)
    .lte('updated_at', endISO)

  const survivorAdvancementsMap = {}
  for (const sp of survivorWins || []) {
    if (!sp.user_id) continue
    if (!survivorAdvancementsMap[sp.user_id]) survivorAdvancementsMap[sp.user_id] = []
    survivorAdvancementsMap[sp.user_id].push({
      league: sp.leagues?.name || 'Unknown League',
      team: sp.team_name,
    })
  }
  const survivorAdvancements = Object.entries(survivorAdvancementsMap).map(([userId, picks]) => {
    const info = userInfoMap[userId] || {}
    return {
      name: info.display_name || info.username || 'Unknown',
      username: info.username || 'Unknown',
      survived_count: picks.length,
      picks,
    }
  }).slice(0, 20)

  // --- All league wins this week (not just 10+ member ones) ---
  const allLeagueWins = []
  const seenAllLeagueIds = new Set()
  for (const n of winNotifs || []) {
    const md = n.metadata || {}
    if (md.isWinner !== true) continue
    if (seenAllLeagueIds.has(md.leagueId)) continue
    seenAllLeagueIds.add(md.leagueId)
    const info = userInfoMap[n.user_id] || {}
    allLeagueWins.push({
      name: info.display_name || info.username || 'Unknown',
      username: info.username || 'Unknown',
      league_name: md.leagueName || 'Unknown League',
      league_format: md.format || null,
      member_count: md.memberCount || null,
      points_awarded: md.points ?? null,
    })
  }

  // --- Big parlay milestones (4+ leg winning parlays from any user) ---
  const bigParlayMilestones = []
  for (const u of enriched) {
    if (u.big_parlays?.length) {
      for (const bp of u.big_parlays) {
        bigParlayMilestones.push({
          name: u.display_name,
          username: u.username,
          leg_count: bp.leg_count,
          multiplier: bp.multiplier,
          risk: bp.risk,
          reward: bp.reward,
        })
      }
    }
  }
  bigParlayMilestones.sort((a, b) => (b.reward || 0) - (a.reward || 0))

  // --- Squares wins this week ---
  const { data: squaresWins } = await supabase
    .from('bonus_points')
    .select('user_id, points, label, leagues(name)')
    .eq('type', 'squares_quarter_win')
    .gte('created_at', startISO)
    .lte('created_at', endISO)

  const squaresWinsList = (squaresWins || []).map((sw) => {
    const info = userInfoMap[sw.user_id] || {}
    return {
      name: info.display_name || info.username || 'Unknown',
      username: info.username || 'Unknown',
      league: sw.leagues?.name || 'Unknown League',
      label: sw.label,
      points: sw.points,
    }
  })

  // --- Streak changes: users whose best_streak was updated this week (extended OR broken) ---
  const { data: streakChanges } = await supabase
    .from('user_sport_stats')
    .select('user_id, current_streak, best_streak, sports(name), users(display_name, username)')
    .gte('updated_at', startISO)
    .lte('updated_at', endISO)
    .gte('best_streak', 5)
    .order('best_streak', { ascending: false })
    .limit(20)

  const streakHighlights = (streakChanges || []).map((s) => ({
    name: s.users?.display_name || s.users?.username || 'Unknown',
    username: s.users?.username || 'Unknown',
    sport: s.sports?.name || 'Unknown',
    current_streak: s.current_streak,
    best_streak: s.best_streak,
  }))

  return {
    top5,
    allUsers: enriched,
    pickOfWeekUser,
    biggestFallUser,
    longestStreakUser,
    recordsBroken,
    crownChanges,
    currentCrownHolders,
    bigLeagueWinners,
    allLeagueWins,
    survivorAdvancements,
    bigParlayMilestones,
    squaresWinsList,
    streakHighlights,
  }
}

/**
 * Call Claude API to generate the weekly headlines narrative.
 */
export async function generateRecapContent(weeklyData, weekStart, weekEnd) {
  const {
    top5, allUsers, pickOfWeekUser, biggestFallUser, longestStreakUser,
    recordsBroken, crownChanges, bigLeagueWinners, allLeagueWins,
    survivorAdvancements, bigParlayMilestones, squaresWinsList, streakHighlights,
  } = weeklyData
  const top5Ids = new Set(top5.map((u) => u.user_id))

  const dataPayload = {
    dateRange: `${weekStart} to ${weekEnd}`,
    top5: top5.map((u, i) => {
      const p = getPronouns(u.title_preference)
      return {
        rank: i + 1,
        name: u.display_name,
        username: u.username,
        pronouns: `${p.subject}/${p.object}/${p.possessive}`,
        record: `${u.record.wins}-${u.record.losses}`,
        weekly_points: u.weekly_points,
        tier: u.tier,
        rank_change: u.rank_change,
        tier_change: u.tier_change,
        biggest_underdog: u.biggest_underdog,
        parlays: u.parlays,
        props_record: u.props_record,
        current_streak: u.current_streak,
        total_picks: u.total_picks,
        notable_picks: u.notable_picks,
        notable_parlay: u.notable_parlay,
        notable_props: u.notable_props,
        daily_breakdown: u.daily_breakdown,
      }
    }),
    pickOfWeek: pickOfWeekUser ? {
      name: pickOfWeekUser.display_name,
      username: pickOfWeekUser.username,
      pronouns: `${getPronouns(pickOfWeekUser.title_preference).subject}/${getPronouns(pickOfWeekUser.title_preference).object}/${getPronouns(pickOfWeekUser.title_preference).possessive}`,
      odds: `+${pickOfWeekUser.biggest_underdog.odds}`,
      reward: pickOfWeekUser.biggest_underdog.reward,
      game: pickOfWeekUser.biggest_underdog.game,
      picked_team: pickOfWeekUser.biggest_underdog.picked_team,
      notable_picks: pickOfWeekUser.notable_picks,
      notable_parlay: pickOfWeekUser.notable_parlay,
    } : null,
    biggestFall: biggestFallUser ? {
      name: biggestFallUser.display_name,
      username: biggestFallUser.username,
      pronouns: `${getPronouns(biggestFallUser.title_preference).subject}/${getPronouns(biggestFallUser.title_preference).object}/${getPronouns(biggestFallUser.title_preference).possessive}`,
      weekly_points: biggestFallUser.weekly_points,
      record: `${biggestFallUser.record.wins}-${biggestFallUser.record.losses}`,
      notable_picks: biggestFallUser.notable_picks,
      notable_parlay: biggestFallUser.notable_parlay,
    } : null,
    longestStreak: longestStreakUser ? {
      name: longestStreakUser.display_name,
      username: longestStreakUser.username,
      pronouns: `${getPronouns(longestStreakUser.title_preference).subject}/${getPronouns(longestStreakUser.title_preference).object}/${getPronouns(longestStreakUser.title_preference).possessive}`,
      streak: longestStreakUser.current_streak.length,
      sport: longestStreakUser.current_streak.sport,
      notable_picks: longestStreakUser.notable_picks,
      notable_parlay: longestStreakUser.notable_parlay,
    } : null,
    honorableMentions: (allUsers || [])
      .filter((u) => u.total_picks >= 10 && !top5Ids.has(u.user_id))
      .map((u) => {
        const p = getPronouns(u.title_preference)
        return {
          name: u.display_name,
          username: u.username,
          pronouns: `${p.subject}/${p.object}/${p.possessive}`,
          record: `${u.record.wins}-${u.record.losses}`,
          weekly_points: u.weekly_points,
          tier: u.tier,
          rank_change: u.rank_change,
          total_picks: u.total_picks,
          current_streak: u.current_streak,
          notable_picks: u.notable_picks,
          notable_parlay: u.notable_parlay,
          notable_props: u.notable_props,
          daily_breakdown: u.daily_breakdown,
        }
      }),
    recordsBroken: recordsBroken || [],
    crownChanges: crownChanges || [],
    bigLeagueWinners: bigLeagueWinners || [],
    allLeagueWins: allLeagueWins || [],
    survivorAdvancements: survivorAdvancements || [],
    bigParlayMilestones: bigParlayMilestones || [],
    squaresWins: squaresWinsList || [],
    streakHighlights: streakHighlights || [],
  }

  const prompt = `You are the voice of I KNOW BALL, a sports prediction app. Write a weekly headlines recap for the top 5 users this week. For each user, write a 1-2 sentence narrative that's fun, competitive, and conversational with a little trash talk energy. Also include: Pick of the Week (biggest underdog hit), Biggest Fall (user who lost the most points), and Longest Active Streak.

ACCURACY RULES — THESE ARE NON-NEGOTIABLE:
1. Only state facts that are explicitly present in the JSON data payload below. Do NOT invent, infer, or embellish.
2. Do NOT mention any specific game, team, score, opponent, player, or matchup unless it appears verbatim in the data. Game/team/sport info lives inside "notable_picks", "notable_parlay", and "biggest_underdog" — nothing else.
3. You MAY cite a user's notable_picks (best hit, worst miss, biggest upset) and notable_parlay verbatim. Use the "picked_team", "game", "sport", "odds", and "points_earned" fields exactly as they appear. Do not guess the opponent or score.
4. If a user has no notable_picks or notable_parlay entries, keep their narrative general — talk about their record, weekly points, rank movement, tier change, or streak. Do not invent specifics.
5. Do NOT invent sports, leagues, or weeks (e.g. "their Week 8 NFL run"). The only sport you can name is what's in "current_streak.sport" or implied by the underdog game.
6. When mentioning a user's underdog pick, ALWAYS use the "picked_team" field verbatim. Do NOT guess the team from the matchup or odds.
7. Numbers (points, records, odds, streaks) must match the payload exactly.
8. Use each user's specified pronouns (from their "pronouns" field) in third person.

If you're tempted to write something specific and you can't point to the exact field in the data, rewrite it more generally. A boring-but-accurate line is always better than a fun-but-wrong one.

Use this exact format:

## RANKINGS
### 1. {display_name} ({record}) | {+/-points} pts
{narrative}

### 2. {display_name} ({record}) | {+/-points} pts
{narrative}

(continue for all 5)

## AWARDS
**Pick of the Week**: {user} — {description}
**Biggest Fall**: {user} — {description}
**Longest Active Streak**: {user} — {description}

The "honorableMentions" array contains users who made 10+ picks this week but didn't crack the top 5. You don't need to write a full section for them, but if any of them had a particularly noteworthy notable_pick, notable_parlay, or notable_prop, you may weave a brief mention into the AWARDS section or a short "HONORABLE MENTIONS" section (optional). Same accuracy rules apply.

Additional data fields you may use (only when non-empty, only verbatim):
- "daily_breakdown" on top5 users — chronological day-by-day record + points (Mon/Tue/.../Sun). Great for "she went 8-1 Tuesday but cratered Sunday" narratives.
- "notable_props" on each user — best prop hit and worst prop miss, with player_name, market_label, line, side, actual value, and points_earned.
- "props_record" — overall props W/L for the week.
- "survivorAdvancements" — users who survived a survivor round this week (with team picked + league name).
- "bigParlayMilestones" — winning parlays with 4+ legs from any user.
- "squaresWins" — squares quarter wins this week.
- "allLeagueWins" — every league win this week (not just 10+ member ones). Use these if you want to spotlight smaller league victories briefly.
- "streakHighlights" — users with current_streak >= 5 or whose best_streak was updated this week.

If the "bigLeagueWinners" array is non-empty, add a "## BIG LEAGUE WINNERS" section. For each entry, write 1-2 sentences highlighting the user, the league they won (use "league_name" verbatim), the member count, and how they won it — you may cite their notable_picks / notable_parlay / weekly_record / weekly_points to add color. Same accuracy rules apply: only cite fields present in the entry.

If any all-time records were broken this week (provided in recordsBroken), add a "RECORDS BROKEN" section and highlight them prominently. If any crowns (leaderboard #1 spots) changed hands this week (provided in crownChanges), add a "CROWN WATCH" section mentioning the new holder and who they dethroned. Only include these sections if the arrays are non-empty.

Here is the data:
${JSON.stringify(dataPayload, null, 2)}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Claude API error ${response.status}: ${body}`)
  }

  const result = await response.json()
  return result.content[0].text
}

/**
 * Get all weekly recaps, ordered newest first.
 * Admins see all recaps; regular users only see recaps past their visible_after time.
 */
export async function getRecapArchive({ isAdmin = false } = {}) {
  let query = supabase
    .from('weekly_recaps')
    .select('id, week_start, week_end, recap_content, crown_holders, visible_after, created_at')
    .order('week_start', { ascending: false })

  if (!isAdmin) {
    const now = new Date().toISOString()
    query = query.or(`visible_after.is.null,visible_after.lte.${now}`)
  }

  const { data, error } = await query

  if (error) {
    logger.error({ error }, 'Failed to fetch recap archive')
    throw error
  }

  return data || []
}

/**
 * Update the recap_content of an existing weekly recap.
 */
export async function updateRecapContent(recapId, recapContent) {
  const { data, error } = await supabase
    .from('weekly_recaps')
    .update({ recap_content: recapContent })
    .eq('id', recapId)
    .select()
    .single()

  if (error) {
    logger.error({ error, recapId }, 'Failed to update recap content')
    throw error
  }

  return data
}

/**
 * Get the most recent weekly recap from the database.
 * Admins see all recaps; regular users only see recaps past their visible_after time.
 */
export async function getLatestRecap({ isAdmin = false } = {}) {
  let query = supabase
    .from('weekly_recaps')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)

  if (!isAdmin) {
    const now = new Date().toISOString()
    query = query.or(`visible_after.is.null,visible_after.lte.${now}`)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    logger.error({ error }, 'Failed to fetch latest recap')
    return null
  }

  if (!data) return null

  // Extract display names from rankings in content and attach avatar data
  const nameMatches = (data.recap_content || '').match(/^### \d+\.\s+(.+?)\s+\(/gm) || []
  const names = nameMatches.map((m) => m.replace(/^### \d+\.\s+/, '').replace(/\s+\($/, ''))

  if (names.length > 0) {
    // Look up by display_name OR username since recaps may use either
    const { data: users } = await supabase
      .from('users')
      .select('id, display_name, username, avatar_url, avatar_emoji')
      .or(names.map((n) => `display_name.eq.${n},username.eq.${n}`).join(','))

    if (users?.length) {
      const avatarMap = {}
      for (const u of users) {
        // Map by whichever name appears in the recap
        for (const name of names) {
          if (u.display_name === name || u.username === name) {
            avatarMap[name] = { id: u.id, avatar_url: u.avatar_url, avatar_emoji: u.avatar_emoji, username: u.username }
          }
        }
      }
      data.user_avatars = avatarMap
    }
  }

  return data
}
