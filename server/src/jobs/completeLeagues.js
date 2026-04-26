import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { getLeaguePickStandings } from '../services/leaguePickService.js'
import { getBracketStandings } from '../services/bracketService.js'
import { createNotification } from '../services/notificationService.js'
import { connectAutoConnectMembers } from '../services/connectionService.js'
import { generateLeagueReport } from '../services/leagueReportService.js'

// Scaled winner bonus based on league size — matches survivor pool structure.
// Used by bracket, NBA DFS, MLB DFS, HR Derby, TD Pass.
function scaledWinnerBonus(memberCount) {
  if (memberCount >= 41) return 100
  if (memberCount >= 31) return 75
  if (memberCount >= 16) return 50
  if (memberCount >= 11) return 30
  if (memberCount >= 6) return 20
  return 10
}

function scaledBonusForRank(rank, n) {
  if (rank !== 1) return 0
  return scaledWinnerBonus(n)
}

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
      // Use add_sport_points_only so league finishes don't get counted as
      // picks in W/L. Points still flow to the sport's total.
      await supabase.rpc('add_sport_points_only', {
        p_user_id: userId,
        p_sport_id: sport.id,
        p_points: points,
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

// Position-based points: N + 1 - 2 * rank (plus a bonus for top finishers)
// Used by bracket, fantasy football, NBA DFS, MLB DFS, and HR Derby leagues
// Handles ties: users sharing a rank split the points for the positions they span
//
// `bonusForRank` is an optional fn (rank, n) → bonus pts; defaults to
// CHAMPION_BONUS for 1st only. Traditional fantasy passes a custom function
// that scales 1st/2nd/3rd bonuses with league size.
async function awardPositionBasedPoints(league, standings, formatLabel, bonusForRank) {
  const n = standings.length
  if (n === 0) return

  const computeBonus = bonusForRank || scaledBonusForRank

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

    // Sum the per-position bonuses across the tied span and split among the
    // tied users — same averaging approach as the position points themselves
    // so a 3-way tie for 1st in a fantasy league correctly splits the
    // 1st/2nd/3rd bonuses three ways.
    let sumBonus = 0
    for (let offset = 0; offset < groupSize; offset++) {
      sumBonus += computeBonus(rank + offset, n)
    }
    const finishBonus = Math.round(sumBonus / groupSize)
    const isWinner = rank === 1
    const totalPoints = avgPositionPoints + finishBonus

    for (const entry of group) {
      const tiedLabel = groupSize > 1 ? `T-${rank}${ordinal(rank)}` : `${rank}${ordinal(rank)}`

      let label
      if (isWinner && groupSize === 1) {
        label = `${formatLabel} 1st of ${n} (+${avgPositionPoints} +${finishBonus} bonus = +${totalPoints})`
      } else if (isWinner) {
        label = `${formatLabel} ${tiedLabel} of ${n} (+${avgPositionPoints} +${finishBonus} bonus = +${totalPoints})`
      } else if (finishBonus > 0) {
        label = `${formatLabel} ${tiedLabel} of ${n} (+${avgPositionPoints} +${finishBonus} bonus = +${totalPoints})`
      } else if (totalPoints >= 0) {
        label = `${formatLabel} ${tiedLabel} of ${n} +${totalPoints} pts`
      } else {
        label = `${formatLabel} ${tiedLabel} of ${n} ${totalPoints} pts`
      }

      await awardUserPoints(entry.user_id, league, totalPoints, label,
        isWinner ? 'league_win' : 'league_finish')

      if (isWinner) {
        await createNotification(entry.user_id, 'league_win',
          `You ${groupSize > 1 ? 'tied for first in' : 'won'} the ${league.name} ${formatLabel}! +${totalPoints} pts`,
          { leagueId: league.id, leagueName: league.name, points: totalPoints, memberCount: n, format: league.format, isWinner: true })

        const winnerName = await getUsername(entry.user_id)
        await notifyLeagueMembers(league, entry.user_id, winnerName, formatLabel)
      } else {
        // Notify non-winners of their global score impact
        const pointsLabel = totalPoints >= 0 ? `+${totalPoints}` : `${totalPoints}`
        await createNotification(entry.user_id, 'league_win',
          `${league.name} is complete. You finished ${tiedLabel} of ${n} (${pointsLabel} pts to your global score).`,
          { leagueId: league.id, leagueName: league.name, points: totalPoints, memberCount: n, format: league.format, isWinner: false })
      }

      logger.info({ userId: entry.user_id, leagueId: league.id, rank, totalPoints, tied: groupSize > 1 }, `${formatLabel} standing awarded`)
    }
  }
}

async function awardBracketStandings(league, standings) {
  await awardPositionBasedPoints(league, standings, 'Bracket')
}

// Traditional fantasy football scales the top-3 bonus by league size — winning
// a deep league against serious managers is a real achievement and the global
// payout reflects that. Position points (n+1-2*rank) are still applied on top
// of these.
// 2nd place is always 40% of 1st, 3rd is always 20% of 1st — keeps the
// payout shape consistent across league sizes.
const TRADITIONAL_FANTASY_BONUSES = {
  6:  { 1: 50,  2: 20, 3: 10 },
  8:  { 1: 75,  2: 30, 3: 15 },
  10: { 1: 90,  2: 36, 3: 18 },
  12: { 1: 120, 2: 48, 3: 24 },
  14: { 1: 165, 2: 66, 3: 33 },
  16: { 1: 195, 2: 78, 3: 39 },
  20: { 1: 225, 2: 90, 3: 45 },
}
export function getTraditionalFantasyBonus(rank, n) {
  if (rank > 3) return 0
  // Exact match for the standard sizes
  if (TRADITIONAL_FANTASY_BONUSES[n]) return TRADITIONAL_FANTASY_BONUSES[n][rank]
  // For non-standard team counts, snap to the closest configured size
  const sizes = Object.keys(TRADITIONAL_FANTASY_BONUSES).map(Number)
  const closest = sizes.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a))
  return TRADITIONAL_FANTASY_BONUSES[closest][rank]
}

// Salary cap fantasy bonus — three modes:
//
//   single_week:    winner-only bonus of (n + 1), so total = position pts
//                   (n − 1) + bonus = members × 2. Everyone else earns
//                   only the position points (bottom half goes negative).
//   full_season:    Hand-tuned table (below) — kept slightly under traditional
//                   at every size; 20-team caps at 150 / 60 / 30.
//   mid_season:     same table values, prorated by weeksPlayed / 18.
const SALARY_CAP_FULL_SEASON_BONUSES = {
  6:  { 1: 35,  2: 14, 3: 7 },
  8:  { 1: 60,  2: 24, 3: 12 },
  10: { 1: 75,  2: 30, 3: 15 },
  12: { 1: 90,  2: 36, 3: 18 },
  14: { 1: 105, 2: 42, 3: 21 },
  16: { 1: 120, 2: 48, 3: 24 },
  20: { 1: 150, 2: 60, 3: 30 },
}
function getSalaryCapFullSeasonBonus(rank, n) {
  if (rank > 3) return 0
  if (SALARY_CAP_FULL_SEASON_BONUSES[n]) return SALARY_CAP_FULL_SEASON_BONUSES[n][rank]
  const sizes = Object.keys(SALARY_CAP_FULL_SEASON_BONUSES).map(Number)
  const closest = sizes.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a))
  return SALARY_CAP_FULL_SEASON_BONUSES[closest][rank]
}
function getSalaryCapBonus(rank, n, ctx) {
  const { isSingleWeek, isFullSeasonRun, weeksPlayed } = ctx
  if (isSingleWeek) {
    // Winner total = members × 2 (position pts + bonus). No bonus for others.
    return rank === 1 ? n + 1 : 0
  }
  if (rank > 3) return 0
  if (isFullSeasonRun) {
    return getSalaryCapFullSeasonBonus(rank, n)
  }
  // Mid-season league — prorate by how much of the regular season they ran
  const weeks = Math.max(1, weeksPlayed || 1)
  return Math.round(getSalaryCapFullSeasonBonus(rank, n) * (weeks / 18))
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
  // Head-to-head matrix: h2hWins[a][b] = number of times a beat b
  const h2hWins = {}
  function ensureUser(uid) {
    if (!userMap[uid]) userMap[uid] = { user_id: uid, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }
    if (!h2hWins[uid]) h2hWins[uid] = {}
  }

  for (const m of matchups) {
    ensureUser(m.home_user_id)
    ensureUser(m.away_user_id)

    userMap[m.home_user_id].pointsFor += Number(m.home_points)
    userMap[m.away_user_id].pointsFor += Number(m.away_points)
    userMap[m.home_user_id].pointsAgainst += Number(m.away_points)
    userMap[m.away_user_id].pointsAgainst += Number(m.home_points)

    if (m.home_points > m.away_points) {
      userMap[m.home_user_id].wins++
      userMap[m.away_user_id].losses++
      h2hWins[m.home_user_id][m.away_user_id] = (h2hWins[m.home_user_id][m.away_user_id] || 0) + 1
    } else if (m.away_points > m.home_points) {
      userMap[m.away_user_id].wins++
      userMap[m.home_user_id].losses++
      h2hWins[m.away_user_id][m.home_user_id] = (h2hWins[m.away_user_id][m.home_user_id] || 0) + 1
    }
  }

  const standings = Object.values(userMap)
  // Tiebreakers in order:
  //   1. Wins (desc)
  //   2. Head-to-head record between tied teams (desc)
  //   3. Points-for (desc)
  //   4. Points-against (asc)
  standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    const aBeatB = h2hWins[a.user_id]?.[b.user_id] || 0
    const bBeatA = h2hWins[b.user_id]?.[a.user_id] || 0
    if (aBeatB !== bBeatA) return bBeatA - aBeatB
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor
    return a.pointsAgainst - b.pointsAgainst
  })
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
  const memberCount = await getLeagueMemberCount(league.id)

  for (const entry of standings) {
    if (entry.total_points === 0) continue

    await awardUserPoints(entry.user_id, league, entry.total_points,
      `Earned ${entry.total_points > 0 ? '+' : ''}${entry.total_points} pts in ${league.name}`, 'league_pickem_earned')
  }

  // Award winner bonus (member count points)
  const winnerId = standings[0].user_id

  await awardUserPoints(winnerId, league, memberCount,
    `Won ${memberCount}-person league +${memberCount} pts`, 'league_win')

  const totalWinnerPoints = (standings[0].total_points || 0) + memberCount
  await createNotification(winnerId, 'league_win',
    `You won the ${league.name} league! +${totalWinnerPoints} pts to your global score.`,
    { leagueId: league.id, leagueName: league.name, points: totalWinnerPoints, memberCount, format: 'pickem', isWinner: true })

  // Notify non-winners of their points
  for (const entry of standings) {
    if (entry.user_id === winnerId) continue
    if (entry.total_points === 0) continue
    const pointsLabel = entry.total_points > 0 ? `+${entry.total_points}` : `${entry.total_points}`
    await createNotification(entry.user_id, 'league_win',
      `${league.name} is complete. You earned ${pointsLabel} pts to your global score.`,
      { leagueId: league.id, leagueName: league.name, points: entry.total_points, memberCount, format: 'pickem', isWinner: false })
  }

  const winnerName = await getUsername(standings[0].user_id)
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

async function getTdPassStandings(league) {
  const { data: picks } = await supabase
    .from('td_pass_picks')
    .select('user_id, td_count')
    .eq('league_id', league.id)
  if (!picks?.length) return []

  const userMap = {}
  for (const p of picks) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { user_id: p.user_id, totalTds: 0 }
    userMap[p.user_id].totalTds += p.td_count || 0
  }
  const standings = Object.values(userMap)
  standings.sort((a, b) => b.totalTds - a.totalTds)

  // Group ties (same totalTds → shared rank). awardPositionBasedPoints
  // already splits the champion bonus among tied users.
  const ranked = []
  let i = 0
  while (i < standings.length) {
    let j = i
    while (j < standings.length && standings[j].totalTds === standings[i].totalTds) j++
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
    .select('id, format')
    .eq('status', 'open')
    .not('starts_at', 'is', null)
    .lte('starts_at', now)

  if (openErr) {
    logger.error({ error: openErr }, 'Failed to fetch open leagues for activation')
  } else if (openLeagues?.length) {
    const toActivate = []
    for (const league of openLeagues) {
      // Bracket leagues stay open until their lock time passes
      if (league.format === 'bracket') {
        const { data: tourney } = await supabase
          .from('bracket_tournaments')
          .select('locks_at')
          .eq('league_id', league.id)
          .single()
        if (tourney?.locks_at && new Date(tourney.locks_at) > new Date(now)) {
          continue // lock time hasn't passed yet — stay open
        }
      }
      toActivate.push(league.id)
    }
    if (toActivate.length) {
      for (const id of toActivate) {
        await supabase
          .from('leagues')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', id)
      }
      logger.info({ count: toActivate.length }, 'Activated open leagues past start date')
    }
  }

  // Clamp full_season leagues to season end dates (if admin has set them)
  const { data: seasonDates } = await supabase
    .from('season_dates')
    .select('sport_key, regular_season_ends_at')

  if (seasonDates?.length) {
    const CLAMP_EXCLUDED = ['squares', 'bracket', 'survivor']
    for (const sd of seasonDates) {
      const { data: overdue } = await supabase
        .from('leagues')
        .select('id, format')
        .eq('sport', sd.sport_key)
        .eq('duration', 'full_season')
        .neq('status', 'completed')
        .gt('ends_at', sd.regular_season_ends_at)

      if (!overdue?.length) continue
      for (const league of overdue) {
        if (CLAMP_EXCLUDED.includes(league.format)) continue
        // Traditional fantasy with playoffs — skip
        if (league.format === 'fantasy') {
          const { data: settings } = await supabase
            .from('fantasy_settings')
            .select('format, playoff_teams')
            .eq('league_id', league.id)
            .single()
          if (settings?.format !== 'salary_cap') continue
        }
        await supabase
          .from('leagues')
          .update({ ends_at: sd.regular_season_ends_at, updated_at: new Date().toISOString() })
          .eq('id', league.id)
        logger.info({ leagueId: league.id, sportKey: sd.sport_key, endsAt: sd.regular_season_ends_at }, 'Clamped league end date to season end')
      }
    }
  }

  // Find non-bracket leagues that are either past their end date OR approaching
  // it within 24h (so we can complete early if all games are already final).
  const earlyWindow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const { data: nonBracketLeagues, error } = await supabase
    .from('leagues')
    .select('*')
    .in('format', ['pickem', 'fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby', 'td_pass'])
    .neq('status', 'completed')
    .not('ends_at', 'is', null)
    .lte('ends_at', earlyWindow)

  if (error) {
    logger.error({ error }, 'Failed to fetch leagues for completion')
    return
  }

  // Bracket leagues complete on championship-score signal, not on ends_at,
  // so fetch them all regardless of ends_at and rely on the per-league check below.
  const { data: bracketLeagues, error: bracketErr } = await supabase
    .from('leagues')
    .select('*')
    .eq('format', 'bracket')
    .neq('status', 'completed')

  if (bracketErr) {
    logger.error({ error: bracketErr }, 'Failed to fetch bracket leagues for completion')
  }

  const leagues = [...(nonBracketLeagues || []), ...(bracketLeagues || [])]

  if (!leagues.length) return

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
        const isPastEndDate = new Date(league.ends_at) <= new Date(now)

        // Non-bracket leagues: check for unfinished games within the league's date range
        let sportId = null
        if (league.sport && league.sport !== 'all') {
          const { data: sportRow } = await supabase
            .from('sports')
            .select('id')
            .eq('key', league.sport)
            .single()
          if (sportRow) sportId = sportRow.id
        }

        let unfinishedQuery = supabase
          .from('games')
          .select('id', { count: 'exact', head: true })
          .gte('starts_at', league.starts_at)
          .lte('starts_at', league.ends_at)
          .neq('status', 'final')
        if (sportId) unfinishedQuery = unfinishedQuery.eq('sport_id', sportId)
        const { count: unfinished } = await unfinishedQuery

        if (unfinished > 0) {
          logger.info({ leagueId: league.id, unfinished }, 'Skipping league completion — unfinished games remain')
          continue
        }

        // Early completion: if ends_at hasn't passed yet, only complete if there
        // are actual final games in the range (avoid closing on an empty range)
        if (!isPastEndDate) {
          let totalQuery = supabase
            .from('games')
            .select('id', { count: 'exact', head: true })
            .gte('starts_at', league.starts_at)
            .lte('starts_at', league.ends_at)
          if (sportId) totalQuery = totalQuery.eq('sport_id', sportId)
          const { count: totalGames } = await totalQuery

          if (!totalGames || totalGames === 0) {
            logger.info({ leagueId: league.id }, 'Skipping early completion — no games in range yet')
            continue
          }
          logger.info({ leagueId: league.id, totalGames }, 'Early completion — all games final before ends_at')
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
        // Traditional fantasy with playoffs: skip auto-completion here —
        // championship game triggers finalizeFantasyChampion() in fantasyService
        const { data: fSettings } = await supabase
          .from('fantasy_settings')
          .select('format, playoff_teams')
          .eq('league_id', league.id)
          .single()
        if (fSettings?.format !== 'salary_cap' && (fSettings?.playoff_teams || 0) > 0) {
          logger.info({ leagueId: league.id }, 'Traditional fantasy with playoffs — skipping auto-completion (handled by playoff bracket)')
          continue
        }
        const standings = await getFantasyLeagueStandings(league)
        if (standings?.length > 0) {
          const { data: settings } = await supabase
            .from('fantasy_settings')
            .select('format, season_type')
            .eq('league_id', league.id)
            .single()
          const isTraditional = league.format === 'fantasy' && settings?.format !== 'salary_cap'
          const isSalaryCap = league.format === 'fantasy' && settings?.format === 'salary_cap'
          const label = league.format === 'nba_dfs' ? 'NBA DFS'
            : settings?.format === 'salary_cap' ? 'Salary Cap' : 'Fantasy'

          let bonusFn = isTraditional ? getTraditionalFantasyBonus : undefined
          if (isSalaryCap) {
            // Look at completed weekly results to figure out which mode
            // applies (single-week / full-season run / mid-season run).
            const { data: weekRows } = await supabase
              .from('dfs_weekly_results')
              .select('nfl_week')
              .eq('league_id', league.id)
            const weekSet = new Set((weekRows || []).map((w) => w.nfl_week))
            const weeksPlayed = weekSet.size
            const minWeek = weekSet.size ? Math.min(...weekSet) : null
            const isSingleWeek = settings?.season_type === 'single_week'
            const isFullSeasonRun = !isSingleWeek && minWeek === 1 && weeksPlayed >= 17
            bonusFn = (rank, n) => getSalaryCapBonus(rank, n, { isSingleWeek, isFullSeasonRun, weeksPlayed })
          }
          await awardPositionBasedPoints(league, standings, label, bonusFn)
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
      } else if (league.format === 'td_pass') {
        const standings = await getTdPassStandings(league)
        if (standings?.length > 0) {
          await awardPositionBasedPoints(league, standings, 'TD Pass')
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

      // Generate league activity report for DFS, salary cap, and traditional fantasy
      let generateReport = ['nba_dfs', 'mlb_dfs'].includes(league.format)
      if (!generateReport && league.format === 'fantasy') {
        generateReport = true
      }
      if (generateReport) {
        try {
          const report = await generateLeagueReport(league)
          if (report) {
            const { data: reportMembers } = await supabase
              .from('league_members')
              .select('user_id')
              .eq('league_id', league.id)
            for (const m of reportMembers || []) {
              await createNotification(m.user_id, 'league_report',
                `Your league report for ${league.name} is ready!`,
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
