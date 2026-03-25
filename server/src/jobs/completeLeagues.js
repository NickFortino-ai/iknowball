import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { getPickemStandings } from '../services/leagueService.js'
import { getLeaguePickStandings } from '../services/leaguePickService.js'
import { getBracketStandings } from '../services/bracketService.js'
import { createNotification } from '../services/notificationService.js'
import { connectAutoConnectMembers } from '../services/connectionService.js'

const CHAMPION_BONUS = 10

async function getLeagueMemberCount(leagueId) {
  const { count, error } = await supabase
    .from('league_members')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId)

  if (error) {
    logger.error({ error, leagueId }, 'Failed to count league members')
    return 1
  }
  return count || 1
}

async function awardUserPoints(userId, league, points, label, type) {
  const { error } = await supabase.rpc('increment_user_points', {
    user_row_id: userId,
    points_delta: points,
  })

  if (error) {
    logger.error({ error, userId, leagueId: league.id }, 'Failed to award league points')
    return
  }

  await supabase.from('bonus_points').insert({
    user_id: userId,
    league_id: league.id,
    type,
    label,
    points,
  })

  if (league.sport && league.sport !== 'all') {
    const { data: sport } = await supabase
      .from('sports')
      .select('id')
      .eq('key', league.sport)
      .single()

    if (sport) {
      await supabase.rpc('update_sport_stats', {
        p_user_id: userId,
        p_sport_id: sport.id,
        p_is_correct: points > 0,
        p_points: Math.abs(points),
      })
    }
  }
}

async function getLeagueMembers(leagueId) {
  const { data } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)
  return data || []
}

async function getUsername(userId) {
  const { data } = await supabase
    .from('users')
    .select('username, display_name')
    .eq('id', userId)
    .single()
  return data?.display_name || data?.username || 'Someone'
}

async function notifyLeagueMembers(league, winnerId, winnerName, format) {
  const members = await getLeagueMembers(league.id)
  const formatLabel = format === 'bracket' ? 'bracket' : 'league'
  for (const member of members) {
    if (member.user_id === winnerId) continue
    await createNotification(member.user_id, 'league_win',
      `${winnerName} won the ${league.name} ${formatLabel}!`,
      { leagueId: league.id, leagueName: league.name, format, isWinner: false })
  }
}

async function awardPickemWinner(league, winnerId) {
  const memberCount = await getLeagueMemberCount(league.id)

  await awardUserPoints(winnerId, league, memberCount,
    `Won ${memberCount}-person league +${memberCount} pts`, 'league_win')

  await createNotification(winnerId, 'league_win',
    `You won the ${league.name} league! +${memberCount} pts`,
    { leagueId: league.id, leagueName: league.name, points: memberCount, memberCount, format: 'pickem', isWinner: true })

  const winnerName = await getUsername(winnerId)
  await notifyLeagueMembers(league, winnerId, winnerName, 'pickem')

  logger.info({ winnerId, leagueId: league.id, bonus: memberCount }, 'Pickem league winner awarded')
}

// Position-based points: N + 1 - 2 * rank (plus +10 bonus for 1st place)
// Used by bracket, fantasy football, and NBA DFS leagues
async function awardPositionBasedPoints(league, standings, formatLabel) {
  const n = standings.length
  if (n === 0) return

  for (const entry of standings) {
    const rank = entry.rank
    const positionPoints = n + 1 - 2 * rank
    const isWinner = rank === 1
    const totalPoints = isWinner ? positionPoints + CHAMPION_BONUS : positionPoints

    let label
    if (isWinner) {
      label = `${formatLabel} 1st of ${n} (+${positionPoints} +${CHAMPION_BONUS} bonus = +${totalPoints})`
    } else if (totalPoints >= 0) {
      label = `${formatLabel} ${rank}${ordinal(rank)} of ${n} +${totalPoints} pts`
    } else {
      label = `${formatLabel} ${rank}${ordinal(rank)} of ${n} ${totalPoints} pts`
    }

    await awardUserPoints(entry.user_id, league, totalPoints, label,
      isWinner ? 'league_win' : 'league_finish')

    if (isWinner) {
      await createNotification(entry.user_id, 'league_win',
        `You won the ${league.name} ${formatLabel.toLowerCase()}! +${totalPoints} pts`,
        { leagueId: league.id, leagueName: league.name, points: totalPoints, memberCount: n, format: league.format, isWinner: true })

      const winnerName = entry.user?.display_name || entry.user?.username || 'Someone'
      await notifyLeagueMembers(league, entry.user_id, winnerName, formatLabel.toLowerCase())
    }

    logger.info({ userId: entry.user_id, leagueId: league.id, rank, totalPoints }, `${formatLabel} standing awarded`)
  }
}

async function awardBracketStandings(league, standings) {
  await awardPositionBasedPoints(league, standings, 'Bracket')
}

// Get fantasy league standings for completion (works for both traditional and salary cap)
async function getFantasyLeagueStandings(league) {
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('format, champion_metric')
    .eq('league_id', league.id)
    .single()

  if (settings?.format === 'salary_cap') {
    // Check if NBA (nba_dfs_nightly_results) or NFL (dfs_weekly_results)
    const isNBA = league.sport === 'basketball_nba'
    const table = isNBA ? 'nba_dfs_nightly_results' : 'dfs_weekly_results'
    const winnerField = isNBA ? 'is_night_winner' : 'is_week_winner'

    const { data: results } = await supabase
      .from(table)
      .select('user_id, total_points, ' + winnerField)
      .eq('league_id', league.id)

    if (!results?.length) return []

    const userMap = {}
    for (const r of results) {
      if (!userMap[r.user_id]) userMap[r.user_id] = { user_id: r.user_id, totalPoints: 0, wins: 0 }
      userMap[r.user_id].totalPoints += Number(r.total_points)
      if (r[winnerField]) userMap[r.user_id].wins++
    }

    const standings = Object.values(userMap)
    if (settings.champion_metric === 'most_wins') {
      standings.sort((a, b) => b.wins - a.wins || b.totalPoints - a.totalPoints)
    } else {
      standings.sort((a, b) => b.totalPoints - a.totalPoints)
    }

    return standings.map((s, i) => ({ user_id: s.user_id, rank: i + 1 }))
  }

  // Traditional fantasy — use matchup W-L records
  const { data: matchups } = await supabase
    .from('fantasy_matchups')
    .select('home_user_id, away_user_id, home_points, away_points, status')
    .eq('league_id', league.id)
    .eq('status', 'completed')

  if (!matchups?.length) return []

  const userMap = {}
  for (const m of matchups) {
    if (!userMap[m.home_user_id]) userMap[m.home_user_id] = { user_id: m.home_user_id, wins: 0, losses: 0, pointsFor: 0 }
    if (!userMap[m.away_user_id]) userMap[m.away_user_id] = { user_id: m.away_user_id, wins: 0, losses: 0, pointsFor: 0 }

    userMap[m.home_user_id].pointsFor += Number(m.home_points)
    userMap[m.away_user_id].pointsFor += Number(m.away_points)

    if (m.home_points > m.away_points) {
      userMap[m.home_user_id].wins++
      userMap[m.away_user_id].losses++
    } else if (m.away_points > m.home_points) {
      userMap[m.away_user_id].wins++
      userMap[m.home_user_id].losses++
    }
  }

  const standings = Object.values(userMap)
  standings.sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor)
  return standings.map((s, i) => ({ user_id: s.user_id, rank: i + 1 }))
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

async function awardLeaguePickPoints(league) {
  const standings = await getLeaguePickStandings(league.id)
  if (!standings?.length) return

  // Award each user their net points as a bonus_points entry
  for (const entry of standings) {
    if (entry.total_points === 0) continue

    await awardUserPoints(entry.user_id, league, entry.total_points,
      `Earned ${entry.total_points > 0 ? '+' : ''}${entry.total_points} pts in ${league.name}`, 'league_pickem_earned')
  }

  // Award winner bonus (member count points)
  const winnerId = standings[0].user_id
  const memberCount = await getLeagueMemberCount(league.id)

  await awardUserPoints(winnerId, league, memberCount,
    `Won ${memberCount}-person league +${memberCount} pts`, 'league_win')

  await createNotification(winnerId, 'league_win',
    `You won the ${league.name} league! +${memberCount} pts`,
    { leagueId: league.id, leagueName: league.name, points: memberCount, memberCount, format: 'pickem', isWinner: true })

  const winnerName = standings[0].user?.display_name || standings[0].user?.username || 'Someone'
  await notifyLeagueMembers(league, winnerId, winnerName, 'pickem')

  logger.info({ winnerId, leagueId: league.id, bonus: memberCount, members: standings.length }, 'League pick points awarded')
}

export async function completeLeagues() {
  const now = new Date().toISOString()

  // Activate open leagues whose start date has passed
  const { data: openLeagues, error: openErr } = await supabase
    .from('leagues')
    .select('id')
    .eq('status', 'open')
    .not('starts_at', 'is', null)
    .lte('starts_at', now)

  if (openErr) {
    logger.error({ error: openErr }, 'Failed to fetch open leagues for activation')
  } else if (openLeagues?.length) {
    for (const league of openLeagues) {
      await supabase
        .from('leagues')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', league.id)
    }
    logger.info({ count: openLeagues.length }, 'Activated open leagues past start date')
  }

  // Find leagues past their end date that haven't been completed
  const { data: leagues, error } = await supabase
    .from('leagues')
    .select('*')
    .in('format', ['pickem', 'bracket', 'fantasy'])
    .neq('status', 'completed')
    .not('ends_at', 'is', null)
    .lte('ends_at', now)

  if (error) {
    logger.error({ error }, 'Failed to fetch leagues for completion')
    return
  }

  if (!leagues?.length) return

  for (const league of leagues) {
    try {
      // Check for unfinished games within the league's date range
      let gamesQuery = supabase
        .from('games')
        .select('id', { count: 'exact', head: true })
        .gte('starts_at', league.starts_at)
        .lte('starts_at', league.ends_at)
        .neq('status', 'final')

      if (league.sport && league.sport !== 'all') {
        const { data: sportRow } = await supabase
          .from('sports')
          .select('id')
          .eq('key', league.sport)
          .single()
        if (sportRow) gamesQuery = gamesQuery.eq('sport_id', sportRow.id)
      }

      const { count: unfinished } = await gamesQuery

      if (unfinished > 0) {
        logger.info({ leagueId: league.id, unfinished }, 'Skipping league completion — unfinished games remain')
        continue
      }

      if (league.format === 'pickem') {
        if (league.use_league_picks) {
          await awardLeaguePickPoints(league)
        } else {
          const standings = await getPickemStandings(league.id)
          if (standings?.length > 0) {
            await awardPickemWinner(league, standings[0].user_id)
          }
        }
      } else if (league.format === 'bracket') {
        const standings = await getBracketStandings(league.id)
        if (standings?.length > 0) {
          await awardBracketStandings(league, standings)
        }
      } else if (league.format === 'fantasy') {
        const standings = await getFantasyLeagueStandings(league)
        if (standings?.length > 0) {
          const { data: settings } = await supabase
            .from('fantasy_settings')
            .select('format')
            .eq('league_id', league.id)
            .single()
          const label = settings?.format === 'salary_cap' ? 'Salary Cap' : 'Fantasy'
          await awardPositionBasedPoints(league, standings, label)
        }
      }

      // Mark league as completed
      await supabase
        .from('leagues')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', league.id)

      // Auto-connect members who opted in
      try {
        await connectAutoConnectMembers(league.id)
      } catch (err) {
        logger.error({ err, leagueId: league.id }, 'Failed to auto-connect league members on completion')
      }

      logger.info({ leagueId: league.id, format: league.format }, 'League completed')
    } catch (err) {
      logger.error({ err, leagueId: league.id }, 'Failed to complete league')
    }
  }
}
