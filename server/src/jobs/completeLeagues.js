import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { getLeaguePickStandings } from '../services/leaguePickService.js'
import { getBracketStandings } from '../services/bracketService.js'
import { createNotification } from '../services/notificationService.js'
import { connectAutoConnectMembers } from '../services/connectionService.js'
import { generateLeagueReport } from '../services/leagueReportService.js'

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

// Position-based points: N + 1 - 2 * rank (plus +10 bonus for 1st place)
// Used by bracket, fantasy football, NBA DFS, MLB DFS, and HR Derby leagues
// Handles ties: users sharing a rank split the points for the positions they span
async function awardPositionBasedPoints(league, standings, formatLabel) {
  const n = standings.length
  if (n === 0) return

  // Group by shared rank to handle ties
  const rankGroups = {}
  for (const entry of standings) {
    if (!rankGroups[entry.rank]) rankGroups[entry.rank] = []
    rankGroups[entry.rank].push(entry)
  }

  for (const [rankStr, group] of Object.entries(rankGroups)) {
    const rank = parseInt(rankStr)
    const groupSize = group.length

    // For ties, average the position points across the tied positions
    // e.g. tied for 2nd-3rd in 8-player: avg of (8+1-4)=5 and (8+1-6)=3 → 4 each
    let sumPositionPoints = 0
    for (let offset = 0; offset < groupSize; offset++) {
      sumPositionPoints += n + 1 - 2 * (rank + offset)
    }
    const avgPositionPoints = Math.round(sumPositionPoints / groupSize)

    const isWinner = rank === 1
    // Split champion bonus among tied winners
    const championBonus = isWinner ? Math.round(CHAMPION_BONUS / groupSize) : 0
    const totalPoints = avgPositionPoints + championBonus

    for (const entry of group) {
      const tiedLabel = groupSize > 1 ? `T-${rank}${ordinal(rank)}` : `${rank}${ordinal(rank)}`

      let label
      if (isWinner && groupSize === 1) {
        label = `${formatLabel} 1st of ${n} (+${avgPositionPoints} +${CHAMPION_BONUS} bonus = +${totalPoints})`
      } else if (isWinner) {
        label = `${formatLabel} ${tiedLabel} of ${n} (+${avgPositionPoints} +${championBonus} bonus = +${totalPoints})`
      } else if (totalPoints >= 0) {
        label = `${formatLabel} ${tiedLabel} of ${n} +${totalPoints} pts`
      } else {
        label = `${formatLabel} ${tiedLabel} of ${n} ${totalPoints} pts`
      }

      await awardUserPoints(entry.user_id, league, totalPoints, label,
        isWinner ? 'league_win' : 'league_finish')

      if (isWinner) {
        await createNotification(entry.user_id, 'league_win',
          `You ${groupSize > 1 ? 'tied for first in' : 'won'} the ${league.name} ${formatLabel.toLowerCase()}! +${totalPoints} pts`,
          { leagueId: league.id, leagueName: league.name, points: totalPoints, memberCount: n, format: league.format, isWinner: true })

        const winnerName = entry.user?.display_name || entry.user?.username || 'Someone'
        await notifyLeagueMembers(league, entry.user_id, winnerName, formatLabel.toLowerCase())
      }

      logger.info({ userId: entry.user_id, leagueId: league.id, rank, totalPoints, tied: groupSize > 1 }, `${formatLabel} standing awarded`)
    }
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

  if (settings?.format === 'salary_cap' || settings?.format === 'hr_derby') {
    // Determine which results table to use
    const isNBA = league.sport === 'basketball_nba'
    const isMLB = league.sport === 'baseball_mlb'
    const table = league.format === 'mlb_dfs' ? 'mlb_dfs_nightly_results'
      : isNBA ? 'nba_dfs_nightly_results' : 'dfs_weekly_results'
    const winnerField = (isNBA || isMLB) ? 'is_night_winner' : 'is_week_winner'

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

    // Handle ties — users with same wins (or points) get averaged rank
    const ranked = []
    let i = 0
    while (i < standings.length) {
      let j = i
      // Find group of tied users
      while (j < standings.length &&
        (settings.champion_metric === 'most_wins'
          ? standings[j].wins === standings[i].wins && standings[j].totalPoints === standings[i].totalPoints
          : standings[j].totalPoints === standings[i].totalPoints)) {
        j++
      }
      // Average rank for tied group: e.g. tied for 1st-2nd → both get rank 1.5 → round to shared rank
      const sharedRank = i + 1
      for (let k = i; k < j; k++) {
        ranked.push({ user_id: standings[k].user_id, rank: sharedRank })
      }
      i = j
    }

    return ranked
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

async function getMLBDFSStandings(league) {
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('champion_metric')
    .eq('league_id', league.id)
    .single()

  const { data: results } = await supabase
    .from('mlb_dfs_nightly_results')
    .select('user_id, total_points, is_night_winner')
    .eq('league_id', league.id)

  if (!results?.length) return []

  const userMap = {}
  for (const r of results) {
    if (!userMap[r.user_id]) userMap[r.user_id] = { user_id: r.user_id, totalPoints: 0, wins: 0 }
    userMap[r.user_id].totalPoints += Number(r.total_points)
    if (r.is_night_winner) userMap[r.user_id].wins++
  }

  const standings = Object.values(userMap)
  if (settings?.champion_metric === 'most_wins') {
    standings.sort((a, b) => b.wins - a.wins || b.totalPoints - a.totalPoints)
  } else {
    standings.sort((a, b) => b.totalPoints - a.totalPoints)
  }

  // Handle ties
  const ranked = []
  let i = 0
  while (i < standings.length) {
    let j = i
    while (j < standings.length &&
      (settings?.champion_metric === 'most_wins'
        ? standings[j].wins === standings[i].wins && standings[j].totalPoints === standings[i].totalPoints
        : standings[j].totalPoints === standings[i].totalPoints)) {
      j++
    }
    const sharedRank = i + 1
    for (let k = i; k < j; k++) {
      ranked.push({ user_id: standings[k].user_id, rank: sharedRank })
    }
    i = j
  }

  return ranked
}

async function getHRDerbyStandings(league) {
  const { data: picks } = await supabase
    .from('hr_derby_picks')
    .select('user_id, home_runs, hr_distance_total')
    .eq('league_id', league.id)

  if (!picks?.length) return []

  const userMap = {}
  for (const p of picks) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { user_id: p.user_id, totalHRs: 0, totalDistance: 0 }
    userMap[p.user_id].totalHRs += p.home_runs || 0
    userMap[p.user_id].totalDistance += p.hr_distance_total || 0
  }

  const standings = Object.values(userMap)
  // Sort by HRs, tiebreaker by distance
  standings.sort((a, b) => b.totalHRs - a.totalHRs || b.totalDistance - a.totalDistance)

  // Handle ties (same HRs AND same distance)
  const ranked = []
  let i = 0
  while (i < standings.length) {
    let j = i
    while (j < standings.length &&
      standings[j].totalHRs === standings[i].totalHRs &&
      standings[j].totalDistance === standings[i].totalDistance) {
      j++
    }
    const sharedRank = i + 1
    for (let k = i; k < j; k++) {
      ranked.push({ user_id: standings[k].user_id, rank: sharedRank })
    }
    i = j
  }

  return ranked
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
    .in('format', ['pickem', 'bracket', 'fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby'])
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
      // Bracket leagues: complete when championship total score is set (admin signal)
      if (league.format === 'bracket') {
        const { data: tournament } = await supabase
          .from('bracket_tournaments')
          .select('championship_total_score')
          .eq('league_id', league.id)
          .single()

        if (tournament?.championship_total_score == null) {
          logger.info({ leagueId: league.id }, 'Skipping bracket completion — championship score not set')
          continue
        }
      } else {
        // Non-bracket leagues: check for unfinished games within the league's date range
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
      }

      if (league.format === 'pickem') {
        await awardLeaguePickPoints(league)
      } else if (league.format === 'bracket') {
        const standings = await getBracketStandings(league.id)
        if (standings?.length > 0) {
          await awardBracketStandings(league, standings)
        }
      } else if (league.format === 'fantasy' || league.format === 'nba_dfs') {
        const standings = await getFantasyLeagueStandings(league)
        if (standings?.length > 0) {
          const { data: settings } = await supabase
            .from('fantasy_settings')
            .select('format')
            .eq('league_id', league.id)
            .single()
          const label = league.format === 'nba_dfs' ? 'NBA DFS'
            : settings?.format === 'salary_cap' ? 'Salary Cap' : 'Fantasy'
          await awardPositionBasedPoints(league, standings, label)
        }
      } else if (league.format === 'mlb_dfs') {
        const standings = await getMLBDFSStandings(league)
        if (standings?.length > 0) {
          await awardPositionBasedPoints(league, standings, 'MLB DFS')
        }
      } else if (league.format === 'hr_derby') {
        const standings = await getHRDerbyStandings(league)
        if (standings?.length > 0) {
          await awardPositionBasedPoints(league, standings, 'HR Derby')
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

      // Generate DFS league activity report
      if (['nba_dfs', 'mlb_dfs'].includes(league.format)) {
        try {
          const report = await generateLeagueReport(league)
          if (report) {
            const { data: reportMembers } = await supabase
              .from('league_members')
              .select('user_id')
              .eq('league_id', league.id)
            for (const m of reportMembers || []) {
              await createNotification(m.user_id, 'league_report',
                `Your season report for ${league.name} is ready!`,
                { leagueId: league.id })
            }
            logger.info({ leagueId: league.id }, 'League activity report generated')
          }
        } catch (err) {
          logger.error({ err, leagueId: league.id }, 'Failed to generate league report')
        }
      }

      logger.info({ leagueId: league.id, format: league.format }, 'League completed')
    } catch (err) {
      logger.error({ err, leagueId: league.id }, 'Failed to complete league')
    }
  }
}
