import { supabase } from '../config/supabase.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { getTier } from '../config/constants.js'
import { getPronouns } from '../utils/pronouns.js'

/**
 * Collect weekly performance data for all users who made picks
 * in the given Monday–Sunday window.
 */
export async function collectWeeklyData(weekStart, weekEnd) {
  const startISO = weekStart.toISOString()
  const endISO = weekEnd.toISOString()

  // 1. Settled picks in the date range
  const { data: picks } = await supabase
    .from('picks')
    .select('user_id, points_earned, is_correct, odds_at_pick, reward_points, games(home_team, away_team)')
    .eq('status', 'settled')
    .not('points_earned', 'is', null)
    .gte('updated_at', startISO)
    .lte('updated_at', endISO)

  // 2. Settled parlays
  const { data: parlays } = await supabase
    .from('parlays')
    .select('user_id, points_earned, is_correct, leg_count')
    .eq('status', 'settled')
    .not('points_earned', 'is', null)
    .gte('updated_at', startISO)
    .lte('updated_at', endISO)

  // 3. Settled prop picks
  const { data: propPicks } = await supabase
    .from('prop_picks')
    .select('user_id, points_earned, is_correct')
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
        total_picks: 0,
      }
    }
    return userMap[userId]
  }

  // Aggregate picks
  for (const p of picks || []) {
    const u = getUser(p.user_id)
    u.total_picks++
    u.picks_points += p.points_earned
    if (p.is_correct === true) {
      u.picks_wins++
      // Track biggest underdog hit (positive odds = underdog)
      if (p.odds_at_pick > 0 && p.reward_points > u.biggest_underdog_reward) {
        u.biggest_underdog_odds = p.odds_at_pick
        u.biggest_underdog_reward = p.reward_points
        u.biggest_underdog_game = p.games
          ? `${p.games.away_team} @ ${p.games.home_team}`
          : null
      }
    } else if (p.is_correct === false) {
      u.picks_losses++
    } else {
      u.picks_pushes++
    }
  }

  // Aggregate parlays
  for (const p of parlays || []) {
    const u = getUser(p.user_id)
    u.total_picks++
    u.parlays_total++
    u.parlays_points += p.points_earned
    if (p.is_correct === true) u.parlays_won++
  }

  // Aggregate prop picks
  for (const p of propPicks || []) {
    const u = getUser(p.user_id)
    u.total_picks++
    u.props_points += p.points_earned
    if (p.is_correct === true) u.props_wins++
    else if (p.is_correct === false) u.props_losses++
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

    return {
      user_id: u.user_id,
      username: info.username || 'Unknown',
      display_name: info.display_name || info.username || 'Unknown',
      title_preference: info.title_preference || null,
      tier: currentTier,
      weekly_points: weeklyPoints,
      record: { wins: totalWins, losses: allLosses, pushes: u.picks_pushes },
      biggest_underdog: u.biggest_underdog_reward > 0
        ? { odds: u.biggest_underdog_odds, reward: u.biggest_underdog_reward, game: u.biggest_underdog_game }
        : null,
      parlays: { total: u.parlays_total, won: u.parlays_won, points: u.parlays_points },
      current_streak: streak,
      rank_change: rankChange,
      tier_change: tierChange,
      total_picks: u.total_picks,
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

  return { top5, allUsers: enriched, pickOfWeekUser, biggestFallUser, longestStreakUser }
}

/**
 * Call Claude API to generate the weekly headlines narrative.
 */
export async function generateRecapContent(weeklyData, weekStart, weekEnd) {
  const { top5, pickOfWeekUser, biggestFallUser, longestStreakUser } = weeklyData

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
        current_streak: u.current_streak,
        total_picks: u.total_picks,
      }
    }),
    pickOfWeek: pickOfWeekUser ? {
      name: pickOfWeekUser.display_name,
      username: pickOfWeekUser.username,
      pronouns: `${getPronouns(pickOfWeekUser.title_preference).subject}/${getPronouns(pickOfWeekUser.title_preference).object}/${getPronouns(pickOfWeekUser.title_preference).possessive}`,
      odds: `+${pickOfWeekUser.biggest_underdog.odds}`,
      reward: pickOfWeekUser.biggest_underdog.reward,
      game: pickOfWeekUser.biggest_underdog.game,
    } : null,
    biggestFall: biggestFallUser ? {
      name: biggestFallUser.display_name,
      username: biggestFallUser.username,
      pronouns: `${getPronouns(biggestFallUser.title_preference).subject}/${getPronouns(biggestFallUser.title_preference).object}/${getPronouns(biggestFallUser.title_preference).possessive}`,
      weekly_points: biggestFallUser.weekly_points,
      record: `${biggestFallUser.record.wins}-${biggestFallUser.record.losses}`,
    } : null,
    longestStreak: longestStreakUser ? {
      name: longestStreakUser.display_name,
      username: longestStreakUser.username,
      pronouns: `${getPronouns(longestStreakUser.title_preference).subject}/${getPronouns(longestStreakUser.title_preference).object}/${getPronouns(longestStreakUser.title_preference).possessive}`,
      streak: longestStreakUser.current_streak.length,
      sport: longestStreakUser.current_streak.sport,
    } : null,
  }

  const prompt = `You are the voice of I KNOW BALL, a sports prediction app. Write a weekly headlines recap for the top 5 users this week. For each user, write a 1-2 sentence narrative that's fun, competitive, and highlights their boldest picks, biggest wins, or interesting patterns. Be conversational with a little trash talk energy. Also include: Pick of the Week (biggest underdog hit), Biggest Fall (user who lost the most points), and Longest Active Streak. Make it feel like something users would want to screenshot and share.

Use each user's specified pronouns (provided in their data as "pronouns": "he/him/his", "she/her/her", or "they/them/their") when referring to them in third person.

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
      model: 'claude-sonnet-4-20250514',
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
 * Get the most recent weekly recap from the database.
 */
export async function getLatestRecap() {
  const { data, error } = await supabase
    .from('weekly_recaps')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.error({ error }, 'Failed to fetch latest recap')
    return null
  }

  return data
}
