import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { getLeaguePickStandings } from '../services/leaguePickService.js'
import { getBracketStandings } from '../services/bracketService.js'
import { createNotification } from '../services/notificationService.js'
import { fetchAll } from '../utils/fetchAll.js'
import { connectAutoConnectMembers } from '../services/connectionService.js'
import { generateLeagueReport } from '../services/leagueReportService.js'

// Scaled winner bonus based on league size — matches survivor pool structure.
// Used by bracket, NBA DFS, MLB DFS, HR Derby, TD Pass.
function scaledWinnerBonus(memberCount) {
  if (memberCount >= 41) return 110
  if (memberCount >= 31) return 85
  if (memberCount >= 16) return 60
  if (memberCount >= 11) return 40
  if (memberCount >= 6) return 30
  return 20
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

export async function awardUserPoints(userId, league, points, label, type) {
  const { error } = await supabase.rpc('increment_user_points', {
    user_row_id: userId,
    points_delta: points,
  })

  if (error) {
    logger.error({ error, userId, leagueId: league.id }, 'Failed to award league points')
    return
  }

  const { error: bonusError } = await supabase.from('bonus_points').insert({
    user_id: userId,
    league_id: league.id,
    type,
    label,
    points,
  })
  if (bonusError) {
    logger.error({ error: bonusError, userId, leagueId: league.id, type },
      'Failed to log bonus_points entry — points landed via RPC but /my-wins will be missing this row')
  }

  if (league.sport && league.sport !== 'all') {
    const { data: sport } = await supabase
      .from('sports')
      .select('id')
      .eq('key', league.sport)
      .single()

    if (sport) {
      // Use add_sport_points_only so league finishes don't get counted as
      // picks in W/L. Points still flow to the sport's total.
      const { error: sportError } = await supabase.rpc('add_sport_points_only', {
        p_user_id: userId,
        p_sport_id: sport.id,
        p_points: points,
      })
      if (sportError) {
        logger.error({ error: sportError, userId, leagueId: league.id, sport: league.sport },
          'Failed to credit sport-tab leaderboard — global points landed but sport board missed')
      }
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
//
// `effectiveN` lets the caller override the N used in scaling — important for
// formats that don't auto-eject no-participation members (NFL salary cap,
// traditional fantasy, MLB DFS), where standings.length undercounts the real
// league size. Defaults to standings.length when omitted.
async function awardPositionBasedPoints(league, standings, formatLabel, bonusForRank, effectiveN) {
  const n = Math.max(effectiveN || 0, standings.length)
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

  // Traditional fantasy — use matchup W-L records.
  // Paginate: a 20-team league across 18 weeks is fine (~180 rows), but
  // there's no upper bound on the schema and silent truncation would
  // produce wrong playoff seedings.
  const matchups = await fetchAll(
    supabase
      .from('fantasy_matchups')
      .select('home_user_id, away_user_id, home_points, away_points, status')
      .eq('league_id', league.id)
      .eq('status', 'completed')
  )

  if (!matchups.length) return []

  const userMap = {}
  // Head-to-head matrix: h2hWins[a][b] = number of times a beat b
  const h2hWins = {}
  function ensureUser(uid) {
    if (!userMap[uid]) userMap[uid] = { user_id: uid, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 }
    if (!h2hWins[uid]) h2hWins[uid] = {}
  }

  for (const m of matchups) {
    // Playoff bracket slots can be pre-generated with NULL user_ids while
    // waiting on advancement. Skip any completed row that never got a real
    // pairing — otherwise userMap[null] becomes a phantom standings row
    // and the later awardUserPoints call crashes on the increment_user_points
    // RPC's NOT NULL FK on user_id.
    if (!m.home_user_id || !m.away_user_id) continue

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

async function getWNBADFSStandings(league) {
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('champion_metric')
    .eq('league_id', league.id)
    .single()

  const { data: results } = await supabase
    .from('wnba_dfs_nightly_results')
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

async function getIntsStandings(league) {
  const { data: picks } = await supabase
    .from('ints_picks')
    .select('user_id, ints')
    .eq('league_id', league.id)

  if (!picks?.length) return []

  const userMap = {}
  for (const p of picks) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { user_id: p.user_id, totalInts: 0 }
    userMap[p.user_id].totalInts += Number(p.ints) || 0
  }

  const standings = Object.values(userMap)
  standings.sort((a, b) => b.totalInts - a.totalInts)

  const ranked = []
  let i = 0
  while (i < standings.length) {
    let j = i
    while (j < standings.length && standings[j].totalInts === standings[i].totalInts) j++
    const sharedRank = i + 1
    for (let k = i; k < j; k++) {
      ranked.push({ user_id: standings[k].user_id, rank: sharedRank })
    }
    i = j
  }

  return ranked
}

async function getTacklesStandings(league) {
  const { data: picks } = await supabase
    .from('tackles_picks')
    .select('user_id, tackles')
    .eq('league_id', league.id)

  if (!picks?.length) return []

  const userMap = {}
  for (const p of picks) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { user_id: p.user_id, totalTackles: 0 }
    userMap[p.user_id].totalTackles += Number(p.tackles) || 0
  }

  const standings = Object.values(userMap)
  standings.sort((a, b) => b.totalTackles - a.totalTackles)

  const ranked = []
  let i = 0
  while (i < standings.length) {
    let j = i
    while (j < standings.length && standings[j].totalTackles === standings[i].totalTackles) j++
    const sharedRank = i + 1
    for (let k = i; k < j; k++) {
      ranked.push({ user_id: standings[k].user_id, rank: sharedRank })
    }
    i = j
  }

  return ranked
}

async function getReceptionsStandings(league) {
  const { data: picks } = await supabase
    .from('receptions_picks')
    .select('user_id, receptions')
    .eq('league_id', league.id)

  if (!picks?.length) return []

  const userMap = {}
  for (const p of picks) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { user_id: p.user_id, totalReceptions: 0 }
    userMap[p.user_id].totalReceptions += Number(p.receptions) || 0
  }

  const standings = Object.values(userMap)
  standings.sort((a, b) => b.totalReceptions - a.totalReceptions)

  const ranked = []
  let i = 0
  while (i < standings.length) {
    let j = i
    while (j < standings.length && standings[j].totalReceptions === standings[i].totalReceptions) j++
    const sharedRank = i + 1
    for (let k = i; k < j; k++) {
      ranked.push({ user_id: standings[k].user_id, rank: sharedRank })
    }
    i = j
  }

  return ranked
}

async function getSacksStandings(league) {
  const { data: picks } = await supabase
    .from('sacks_picks')
    .select('user_id, sacks')
    .eq('league_id', league.id)

  if (!picks?.length) return []

  const userMap = {}
  for (const p of picks) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { user_id: p.user_id, totalSacks: 0 }
    userMap[p.user_id].totalSacks += Number(p.sacks) || 0
  }

  const standings = Object.values(userMap)
  standings.sort((a, b) => b.totalSacks - a.totalSacks)

  const ranked = []
  let i = 0
  while (i < standings.length) {
    let j = i
    while (j < standings.length && standings[j].totalSacks === standings[i].totalSacks) j++
    const sharedRank = i + 1
    for (let k = i; k < j; k++) {
      ranked.push({ user_id: standings[k].user_id, rank: sharedRank })
    }
    i = j
  }

  return ranked
}

async function getWnbaThreePointStandings(league) {
  const { data: picks } = await supabase
    .from('wnba_three_point_picks')
    .select('user_id, made_threes')
    .eq('league_id', league.id)

  if (!picks?.length) return []

  const userMap = {}
  for (const p of picks) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { user_id: p.user_id, totalThrees: 0 }
    userMap[p.user_id].totalThrees += p.made_threes || 0
  }

  const standings = Object.values(userMap)
  standings.sort((a, b) => b.totalThrees - a.totalThrees)

  const ranked = []
  let i = 0
  while (i < standings.length) {
    let j = i
    while (j < standings.length && standings[j].totalThrees === standings[i].totalThrees) j++
    const sharedRank = i + 1
    for (let k = i; k < j; k++) {
      ranked.push({ user_id: standings[k].user_id, rank: sharedRank })
    }
    i = j
  }
  return ranked
}

async function getThreePointStandings(league) {
  const { data: picks } = await supabase
    .from('three_point_picks')
    .select('user_id, made_threes')
    .eq('league_id', league.id)

  if (!picks?.length) return []

  const userMap = {}
  for (const p of picks) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { user_id: p.user_id, totalThrees: 0 }
    userMap[p.user_id].totalThrees += p.made_threes || 0
  }

  const standings = Object.values(userMap)
  standings.sort((a, b) => b.totalThrees - a.totalThrees)

  const ranked = []
  let i = 0
  while (i < standings.length) {
    let j = i
    while (j < standings.length && standings[j].totalThrees === standings[i].totalThrees) j++
    const sharedRank = i + 1
    for (let k = i; k < j; k++) {
      ranked.push({ user_id: standings[k].user_id, rank: sharedRank })
    }
    i = j
  }

  return ranked
}

async function getStrikeoutsStandings(league) {
  const { data: picks } = await supabase
    .from('strikeouts_picks')
    .select('user_id, strikeouts')
    .eq('league_id', league.id)

  if (!picks?.length) return []

  const userMap = {}
  for (const p of picks) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { user_id: p.user_id, totalStrikeouts: 0 }
    userMap[p.user_id].totalStrikeouts += p.strikeouts || 0
  }

  const standings = Object.values(userMap)
  standings.sort((a, b) => b.totalStrikeouts - a.totalStrikeouts)

  const ranked = []
  let i = 0
  while (i < standings.length) {
    let j = i
    while (j < standings.length && standings[j].totalStrikeouts === standings[i].totalStrikeouts) j++
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
    .select('user_id, home_runs')
    .eq('league_id', league.id)

  if (!picks?.length) return []

  const userMap = {}
  for (const p of picks) {
    if (!userMap[p.user_id]) userMap[p.user_id] = { user_id: p.user_id, totalHRs: 0 }
    userMap[p.user_id].totalHRs += p.home_runs || 0
  }

  const standings = Object.values(userMap)
  standings.sort((a, b) => b.totalHRs - a.totalHRs)

  const ranked = []
  let i = 0
  while (i < standings.length) {
    let j = i
    while (j < standings.length && standings[j].totalHRs === standings[i].totalHRs) j++
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

  // Activate open leagues whose start date has passed. We use two signals:
  //  - leagues.starts_at <= now (the user-picked start)
  //  - earliest league_weeks.starts_at <= now (the first actual period)
  // The second matters for survivor (and any period-based format) where the
  // ET-anchor fix can move Day 1 earlier than leagues.starts_at — without
  // this, Day 1 is live and pickable but the league is still labeled "open"
  // (Members tab, no readiness flag).
  const { data: openByStart } = await supabase
    .from('leagues')
    .select('id, format, sport, joins_locked_at')
    .eq('status', 'open')
    .not('starts_at', 'is', null)
    .lte('starts_at', now)

  // Only survivor and pickem actually consume league_weeks for picks. Daily
  // DFS/contest formats have weekly rows generated as a side-effect of
  // generateLeagueWeeks() but never read them, so a back-anchored "Week 1"
  // shouldn't trigger early activation for those formats. Restrict the
  // league_weeks signal to the formats that actually use it.
  const { data: openWeeks } = await supabase
    .from('league_weeks')
    .select('league_id, leagues!inner(id, format, sport, status)')
    .eq('leagues.status', 'open')
    .in('leagues.format', ['survivor', 'pickem'])
    .lte('starts_at', now)

  const openLeagues = []
  const seen = new Set()
  for (const l of openByStart || []) {
    if (!seen.has(l.id)) { seen.add(l.id); openLeagues.push(l) }
  }
  for (const w of openWeeks || []) {
    const id = w.leagues?.id || w.league_id
    if (!id || seen.has(id)) continue
    seen.add(id)
    openLeagues.push({ id, format: w.leagues?.format, sport: w.leagues?.sport })
  }

  if (openLeagues.length) {
    const toActivate = []
    const nowMs = new Date(now).getTime()
    // Daily contest formats use joins_locked_at as the real "go live"
    // moment — first tip-off of the slate. Until that passes, the
    // league should stay 'open' so users can still join and the card
    // doesn't prematurely flip to active. Survivor and pickem activate
    // off starts_at / league_weeks directly, so they're not gated here.
    const DAILY_OPEN_FORMATS = new Set([
      'nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts',
      'three_point', 'wnba_three_point',
    ])
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
      // Daily contests: defer activation until joins_locked_at (first
      // tip-off). If joins_locked_at isn't set yet, the tightener will
      // populate it from the ESPN scoreboard on its next run and we'll
      // pick this league back up.
      if (DAILY_OPEN_FORMATS.has(league.format)) {
        if (!league.joins_locked_at) continue
        if (new Date(league.joins_locked_at).getTime() > nowMs) continue
      }
      // Traditional fantasy: stay 'open' until the league fills to its
      // designated num_teams (or the commissioner shrinks num_teams to
      // match). starts_at for a fresh fantasy league is a soft
      // creation-time default that doesn't reflect draft-readiness —
      // flipping to 'active' at that moment lies to the UI. Salary cap
      // fantasy has no draft, so 'full' isn't the right gate for it;
      // it falls through to the normal starts_at path.
      if (league.format === 'fantasy') {
        const { data: fs } = await supabase
          .from('fantasy_settings')
          .select('format, num_teams')
          .eq('league_id', league.id)
          .maybeSingle()
        if (fs && fs.format !== 'salary_cap') {
          const { count: memberCount } = await supabase
            .from('league_members')
            .select('id', { count: 'exact', head: true })
            .eq('league_id', league.id)
          const targetCount = fs.num_teams || 10
          if ((memberCount || 0) < targetCount) continue
        }
      }
      // Survivor: stay 'open' until the first real game of period 1
      // kicks off, not just when league_weeks Week/Day 1 nominally
      // opens. league_weeks.starts_at can be days before the first
      // game (Mon anchor for NFL Week 1 → first game Thursday), which
      // is the right window for advance picks but the wrong moment to
      // flip the card to 'active'. For sport='all' the gate is the
      // earliest game across any sport in the period window.
      if (league.format === 'survivor') {
        const { data: week1 } = await supabase
          .from('league_weeks')
          .select('starts_at, ends_at')
          .eq('league_id', league.id)
          .order('week_number', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (week1) {
          let gameQ = supabase
            .from('games')
            .select('starts_at, sports!inner(key)')
            .gte('starts_at', week1.starts_at)
            .lte('starts_at', week1.ends_at)
            .order('starts_at', { ascending: true })
            .limit(1)
          if (league.sport && league.sport !== 'all') {
            gameQ = gameQ.eq('sports.key', league.sport)
          }
          const { data: firstGames } = await gameQ
          const firstGameStart = firstGames?.[0]?.starts_at
          // If a first game exists and hasn't started yet, stay open.
          // If no game found at all (rare — pre-schedule edge case),
          // fall through to the league_weeks.starts_at signal so the
          // league doesn't get stuck open forever.
          if (firstGameStart && new Date(firstGameStart).getTime() > nowMs) continue
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

  // Reverse-flip: daily contest leagues that were prematurely activated
  // under the old logic (or by hand) should drop back to 'open' if their
  // joins_locked_at is still in the future. Critical because 'open'
  // status is what surfaces a league on the landing page + join page —
  // last-minute joiners can't discover an 'active' league.
  {
    const DAILY_OPEN_FORMATS = [
      'nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts',
      'three_point', 'wnba_three_point',
    ]
    const { data: prematurelyActive } = await supabase
      .from('leagues')
      .select('id, format, joins_locked_at')
      .eq('status', 'active')
      .in('format', DAILY_OPEN_FORMATS)
      .not('joins_locked_at', 'is', null)
      .gt('joins_locked_at', now)
    if (prematurelyActive?.length) {
      const ids = prematurelyActive.map((l) => l.id)
      await supabase
        .from('leagues')
        .update({ status: 'open', updated_at: new Date().toISOString() })
        .in('id', ids)
      logger.info({ count: ids.length }, 'Rolled prematurely-active daily contest leagues back to open')
    }
  }

  // Clamp full_season leagues to season end dates (if admin has set them).
  // When playoff_ends_at is set, that's the ceiling (so playoff-extended
  // leagues are honored); otherwise regular_season_ends_at is the ceiling.
  //
  // Only consider the LATEST season_year per sport. Old rows (e.g. last
  // year's playoff_ends_at) are historical — if we applied them, a brand
  // new next-season league with a future ends_at would match the old
  // row's `ends_at > clampTarget` filter and get clamped back into the
  // past, ending the league instantly. Keep one row per sport.
  const { data: allSeasonDates } = await supabase
    .from('season_dates')
    .select('sport_key, season_year, regular_season_ends_at, playoff_ends_at')
    .order('season_year', { ascending: false })

  const latestSeasonDatesPerSport = new Map()
  for (const sd of allSeasonDates || []) {
    if (!latestSeasonDatesPerSport.has(sd.sport_key)) {
      latestSeasonDatesPerSport.set(sd.sport_key, sd)
    }
  }
  const seasonDates = [...latestSeasonDatesPerSport.values()]

  if (seasonDates?.length) {
    const CLAMP_EXCLUDED = ['squares', 'bracket', 'survivor']
    // NFL single-stat contests score only regular-season weeks (weeksPlayed/18
    // proration). Clamp them to regular_season_ends_at even when the admin
    // sets playoff_ends_at, otherwise ends_at drifts into the playoff window
    // and the completion check waits on games these formats never score.
    const NFL_REGULAR_SEASON_ONLY_FORMATS = new Set([
      'sacks', 'ints', 'tackles', 'receptions', 'td_pass',
    ])
    for (const sd of seasonDates) {
      // See admin.js POST /season-dates for the design notes — same logic.
      // playoff_ends_at SET → sweep all formats. NOT set → only full_season.
      // starts_at gate prevents stale rows from killing offseason leagues.
      const clampTarget = sd.playoff_ends_at || sd.regular_season_ends_at
      const isPlayoffClamp = !!sd.playoff_ends_at
      let overdueQuery = supabase
        .from('leagues')
        .select('id, format')
        .eq('sport', sd.sport_key)
        .neq('status', 'completed')
        .gt('ends_at', clampTarget)
        .lte('starts_at', clampTarget)
      if (!isPlayoffClamp) {
        overdueQuery = overdueQuery.eq('duration', 'full_season')
      }
      const { data: overdue } = await overdueQuery

      if (!overdue?.length) continue
      for (const league of overdue) {
        if (CLAMP_EXCLUDED.includes(league.format)) continue
        // Formats that only run through the regular season — dfs_weekly_results
        // and *_picks tables never score playoff games, so pushing ends_at into
        // the playoff window would leave them sitting unfinished.
        const isNflRegularSeasonOnly = NFL_REGULAR_SEASON_ONLY_FORMATS.has(league.format)
        let leagueClampTarget = clampTarget
        // Traditional fantasy with playoffs — skip
        if (league.format === 'fantasy') {
          const { data: settings } = await supabase
            .from('fantasy_settings')
            .select('format, playoff_teams')
            .eq('league_id', league.id)
            .single()
          if (settings?.format !== 'salary_cap') continue
          leagueClampTarget = sd.regular_season_ends_at
        } else if (isNflRegularSeasonOnly) {
          leagueClampTarget = sd.regular_season_ends_at
        }
        await supabase
          .from('leagues')
          .update({ ends_at: leagueClampTarget, updated_at: new Date().toISOString() })
          .eq('id', league.id)
        logger.info({ leagueId: league.id, sportKey: sd.sport_key, endsAt: leagueClampTarget, mode: sd.playoff_ends_at ? 'playoff' : 'regular' }, 'Clamped league end date')
      }
    }

    // Coverage gap safety net: the main clamp above uses `ends_at > clampTarget`
    // to identify overdue leagues, where clampTarget = playoff_ends_at when
    // playoffs are configured. Regular-season-only leagues sitting between
    // regular_season_ends_at and playoff_ends_at slip through that filter,
    // but should still be clamped to regular season end.
    for (const sd of seasonDates) {
      if (!sd.regular_season_ends_at) continue
      const gapFormats = ['fantasy', ...NFL_REGULAR_SEASON_ONLY_FORMATS]
      const { data: overdueGap } = await supabase
        .from('leagues')
        .select('id, format')
        .eq('sport', sd.sport_key)
        .in('format', gapFormats)
        .neq('status', 'completed')
        .gt('ends_at', sd.regular_season_ends_at)
        .lte('starts_at', sd.regular_season_ends_at)
      if (!overdueGap?.length) continue
      for (const league of overdueGap) {
        if (league.format === 'fantasy') {
          const { data: settings } = await supabase
            .from('fantasy_settings')
            .select('format')
            .eq('league_id', league.id)
            .single()
          if (settings?.format !== 'salary_cap') continue
        }
        await supabase
          .from('leagues')
          .update({ ends_at: sd.regular_season_ends_at, updated_at: new Date().toISOString() })
          .eq('id', league.id)
        logger.info({ leagueId: league.id, sportKey: sd.sport_key, endsAt: sd.regular_season_ends_at, format: league.format }, 'Clamped regular-season-only league end date (gap sweep)')
      }
    }
  }

  // Find non-bracket leagues that may be ready to complete. End date is
  // stored as next-day 10:00 UTC (= 3 AM PT next day), so a strict
  // `ends_at <= now` gate forces completion (and APNs fan-out) to fire
  // sometime between 3 AM and the next cron tick — not a humane hour.
  //
  // Instead, allow early completion as soon as the league's last scheduled
  // game has actually finalized. The per-league guardrail below requires
  // (a) the games are synced into our games table, (b) the latest one has
  // started, and (c) none are still unfinished — collectively preventing
  // the bug that killed the previous 24h-lookahead attempt (count=0 misread
  // as "done" when games hadn't been synced yet).
  //
  // The 14-day ceiling bounds the query while comfortably covering daily
  // contests, weekly NFL contests, and salary-cap fantasy near season end.
  const lookaheadIso = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: nonBracketLeagues, error } = await supabase
    .from('leagues')
    .select('*')
    .in('format', ['pickem', 'fantasy', 'nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point', 'sacks', 'ints', 'tackles', 'receptions', 'td_pass'])
    .neq('status', 'completed')
    .not('ends_at', 'is', null)
    .lte('ends_at', lookaheadIso)

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
        // Non-bracket leagues complete on the "last game in the window has
        // finalized" signal, with the league's own ends_at as a safety net.
        //
        // Two paths:
        //  - Past official end (now >= ends_at): just verify no games are
        //    still unfinished (handles postponements drifting past end-date).
        //  - Early completion (now < ends_at): the league's natural calendar
        //    end hasn't arrived yet, but if every scheduled game has played
        //    and finalized, complete now — and fire the APNs at the actual
        //    end-of-slate hour instead of 3 AM PT.
        let sportId = null
        if (league.sport && league.sport !== 'all') {
          const { data: sportRow } = await supabase
            .from('sports')
            .select('id')
            .eq('key', league.sport)
            .single()
          if (sportRow) sportId = sportRow.id
        }

        // Pull the games in the league's window once and inspect them
        // locally — we need both the unfinished count AND the latest
        // scheduled start to apply the early-completion guardrail.
        let rangeQuery = supabase
          .from('games')
          .select('starts_at, status')
          .gte('starts_at', league.starts_at)
          .lte('starts_at', league.ends_at)
        if (sportId) rangeQuery = rangeQuery.eq('sport_id', sportId)
        const { data: rangeGames, error: rangeErr } = await rangeQuery
        if (rangeErr) {
          logger.error({ err: rangeErr, leagueId: league.id }, 'Failed to fetch range games for completion check')
          continue
        }

        // Treat postponed games as effectively done — they'll never finalize
        // on this date, and their picks can't settle. Without this, a single
        // rained-out MLB game blocks the entire league from completing.
        const unfinished = (rangeGames || []).filter(
          (g) => g.status !== 'final' && g.status !== 'postponed',
        ).length
        if (unfinished > 0) {
          logger.info({ leagueId: league.id, unfinished }, 'Skipping league completion — unfinished games remain')
          continue
        }

        // Early-completion guardrail. The previous 24h-lookahead attempt
        // failed because count=0 was misread as "all games done" when in
        // reality games hadn't been synced yet. Two checks together prevent
        // that: (a) at least one game must exist in the range, (b) the
        // latest scheduled game must already have started. If both hold and
        // no game is unfinished, the slate is genuinely over.
        const nowMs = Date.now()
        const endsAtMs = new Date(league.ends_at).getTime()
        if (nowMs < endsAtMs) {
          if (!rangeGames?.length) {
            logger.info({ leagueId: league.id }, 'Skipping early completion — no games yet synced for league window')
            continue
          }
          const latestStartMs = Math.max(
            ...rangeGames.map((g) => new Date(g.starts_at).getTime()),
          )
          if (latestStartMs > nowMs) {
            logger.info({ leagueId: league.id, latestStartMs, nowMs }, 'Skipping early completion — latest scheduled game has not started')
            continue
          }
          logger.info({ leagueId: league.id, endsAtMs, nowMs }, 'Early completion — all games finalized before official end')
        }
      }

      // Atomic claim: flip status from 'active' to 'completed' BEFORE the
      // format-specific scoring runs. Concurrent completeLeagues calls (the
      // 15-min cron + the inline background call from POST /admin/season-dates)
      // could otherwise both see status='active', both run awardPositionBasedPoints,
      // both insert bonus_points rows, both call increment_user_points → double-credit.
      // The conditional `.eq('status', 'active')` ensures only one process wins.
      const { data: claimed, error: claimErr } = await supabase
        .from('leagues')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', league.id)
        .eq('status', 'active')
        .select('id')

      if (claimErr) {
        logger.error({ err: claimErr, leagueId: league.id }, 'Failed to claim league for completion')
        continue
      }
      if (!claimed?.length) {
        logger.info({ leagueId: league.id }, 'Skipping league completion — already claimed by another process')
        continue
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
        const memberCount = await getLeagueMemberCount(league.id)
        const standings = await getFantasyLeagueStandings(league)
        if (standings?.length > 0) {
          const { data: settings } = await supabase
            .from('fantasy_settings')
            .select('format, season_type')
            .eq('league_id', league.id)
            .single()
          const isTraditional = league.format === 'fantasy' && settings?.format !== 'salary_cap'
          const isSalaryCap = league.format === 'fantasy' && settings?.format === 'salary_cap'
          const isNbaDfs = league.format === 'nba_dfs'
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
          if (isNbaDfs) {
            // Prorate the scaled winner bonus by nights actually played
            // (versus a full ~180-night NBA regular season). Short leagues
            // get a small slice of the bonus; full-season leagues get all of it.
            const { data: nightRows } = await supabase
              .from('nba_dfs_nightly_results')
              .select('game_date')
              .eq('league_id', league.id)
            const nightsPlayed = new Set((nightRows || []).map((r) => r.game_date)).size
            const fraction = Math.min(1, nightsPlayed / 180)
            bonusFn = (rank, n) => rank === 1 ? Math.round(scaledWinnerBonus(n) * fraction) : 0
          }
          await awardPositionBasedPoints(league, standings, label, bonusFn, memberCount)
        }
      } else if (league.format === 'mlb_dfs') {
        const memberCount = await getLeagueMemberCount(league.id)
        const standings = await getMLBDFSStandings(league)
        if (standings?.length > 0) {
          // Prorate winner bonus by nights played vs ~180-night MLB regular season
          const { data: nightRows } = await supabase
            .from('mlb_dfs_nightly_results')
            .select('game_date')
            .eq('league_id', league.id)
          const nightsPlayed = new Set((nightRows || []).map((r) => r.game_date)).size
          const fraction = Math.min(1, nightsPlayed / 180)
          const bonusFn = (rank, n) => rank === 1 ? Math.round(scaledWinnerBonus(n) * fraction) : 0
          await awardPositionBasedPoints(league, standings, 'MLB DFS', bonusFn, memberCount)
        }
      } else if (league.format === 'wnba_dfs') {
        const memberCount = await getLeagueMemberCount(league.id)
        const standings = await getWNBADFSStandings(league)
        if (standings?.length > 0) {
          // Prorate winner bonus by nights played vs ~120-night WNBA regular season
          const { data: nightRows } = await supabase
            .from('wnba_dfs_nightly_results')
            .select('game_date')
            .eq('league_id', league.id)
          const nightsPlayed = new Set((nightRows || []).map((r) => r.game_date)).size
          const fraction = Math.min(1, nightsPlayed / 120)
          const bonusFn = (rank, n) => rank === 1 ? Math.round(scaledWinnerBonus(n) * fraction) : 0
          await awardPositionBasedPoints(league, standings, 'WNBA DFS', bonusFn, memberCount)
        }
      } else if (league.format === 'hr_derby') {
        const memberCount = await getLeagueMemberCount(league.id)
        const standings = await getHRDerbyStandings(league)
        if (standings?.length > 0) {
          // Prorate winner bonus by unique pick nights vs ~180-night MLB regular
          // season — matches MLB DFS so a full-season HR Derby pays a full
          // bonus and a short one pays a small slice.
          const { data: pickRows } = await supabase
            .from('hr_derby_picks')
            .select('game_date')
            .eq('league_id', league.id)
          const nightsPlayed = new Set((pickRows || []).map((r) => r.game_date)).size
          const fraction = Math.min(1, nightsPlayed / 180)
          const bonusFn = (rank, n) => rank === 1 ? Math.round(scaledWinnerBonus(n) * fraction) : 0
          await awardPositionBasedPoints(league, standings, 'HR Derby', bonusFn, memberCount)
        }
      } else if (league.format === 'strikeouts') {
        const memberCount = await getLeagueMemberCount(league.id)
        const standings = await getStrikeoutsStandings(league)
        if (standings?.length > 0) {
          const { data: pickRows } = await supabase
            .from('strikeouts_picks')
            .select('game_date')
            .eq('league_id', league.id)
          const nightsPlayed = new Set((pickRows || []).map((r) => r.game_date)).size
          const fraction = Math.min(1, nightsPlayed / 180)
          const bonusFn = (rank, n) => rank === 1 ? Math.round(scaledWinnerBonus(n) * fraction) : 0
          await awardPositionBasedPoints(league, standings, 'Strikeouts Contest', bonusFn, memberCount)
        }
      } else if (league.format === 'three_point') {
        const memberCount = await getLeagueMemberCount(league.id)
        const standings = await getThreePointStandings(league)
        if (standings?.length > 0) {
          const { data: pickRows } = await supabase
            .from('three_point_picks')
            .select('game_date')
            .eq('league_id', league.id)
          const nightsPlayed = new Set((pickRows || []).map((r) => r.game_date)).size
          const fraction = Math.min(1, nightsPlayed / 180)
          const bonusFn = (rank, n) => rank === 1 ? Math.round(scaledWinnerBonus(n) * fraction) : 0
          await awardPositionBasedPoints(league, standings, 'NBA 3-Point Contest', bonusFn, memberCount)
        }
      } else if (league.format === 'wnba_three_point') {
        const memberCount = await getLeagueMemberCount(league.id)
        const standings = await getWnbaThreePointStandings(league)
        if (standings?.length > 0) {
          const { data: pickRows } = await supabase
            .from('wnba_three_point_picks')
            .select('game_date')
            .eq('league_id', league.id)
          const nightsPlayed = new Set((pickRows || []).map((r) => r.game_date)).size
          const fraction = Math.min(1, nightsPlayed / 120)
          const bonusFn = (rank, n) => rank === 1 ? Math.round(scaledWinnerBonus(n) * fraction) : 0
          await awardPositionBasedPoints(league, standings, 'WNBA 3-Point Contest', bonusFn, memberCount)
        }
      } else if (league.format === 'sacks') {
        const memberCount = await getLeagueMemberCount(league.id)
        const standings = await getSacksStandings(league)
        if (standings?.length > 0) {
          // Prorate winner bonus by NFL weeks played (out of 18-week regular season)
          const { data: pickRows } = await supabase
            .from('sacks_picks')
            .select('week')
            .eq('league_id', league.id)
          const weeksPlayed = new Set((pickRows || []).map((r) => r.week)).size
          const fraction = Math.min(1, weeksPlayed / 18)
          const bonusFn = (rank, n) => rank === 1 ? Math.round(scaledWinnerBonus(n) * fraction) : 0
          await awardPositionBasedPoints(league, standings, 'Sacks Contest', bonusFn, memberCount)
        }
      } else if (league.format === 'ints') {
        const memberCount = await getLeagueMemberCount(league.id)
        const standings = await getIntsStandings(league)
        if (standings?.length > 0) {
          const { data: pickRows } = await supabase
            .from('ints_picks')
            .select('week')
            .eq('league_id', league.id)
          const weeksPlayed = new Set((pickRows || []).map((r) => r.week)).size
          const fraction = Math.min(1, weeksPlayed / 18)
          const bonusFn = (rank, n) => rank === 1 ? Math.round(scaledWinnerBonus(n) * fraction) : 0
          await awardPositionBasedPoints(league, standings, 'Interceptions Contest', bonusFn, memberCount)
        }
      } else if (league.format === 'tackles') {
        const memberCount = await getLeagueMemberCount(league.id)
        const standings = await getTacklesStandings(league)
        if (standings?.length > 0) {
          const { data: pickRows } = await supabase
            .from('tackles_picks')
            .select('week')
            .eq('league_id', league.id)
          const weeksPlayed = new Set((pickRows || []).map((r) => r.week)).size
          const fraction = Math.min(1, weeksPlayed / 18)
          const bonusFn = (rank, n) => rank === 1 ? Math.round(scaledWinnerBonus(n) * fraction) : 0
          await awardPositionBasedPoints(league, standings, 'Tackles Contest', bonusFn, memberCount)
        }
      } else if (league.format === 'receptions') {
        const memberCount = await getLeagueMemberCount(league.id)
        const standings = await getReceptionsStandings(league)
        if (standings?.length > 0) {
          const { data: pickRows } = await supabase
            .from('receptions_picks')
            .select('week')
            .eq('league_id', league.id)
          const weeksPlayed = new Set((pickRows || []).map((r) => r.week)).size
          const fraction = Math.min(1, weeksPlayed / 18)
          const bonusFn = (rank, n) => rank === 1 ? Math.round(scaledWinnerBonus(n) * fraction) : 0
          await awardPositionBasedPoints(league, standings, 'Receptions Contest', bonusFn, memberCount)
        }
      } else if (league.format === 'td_pass') {
        const memberCount = await getLeagueMemberCount(league.id)
        const standings = await getTdPassStandings(league)
        if (standings?.length > 0) {
          // Prorate winner bonus by NFL weeks played (out of 18-week regular season)
          const { data: pickRows } = await supabase
            .from('td_pass_picks')
            .select('week')
            .eq('league_id', league.id)
          const weeksPlayed = new Set((pickRows || []).map((r) => r.week)).size
          const fraction = Math.min(1, weeksPlayed / 18)
          const bonusFn = (rank, n) => rank === 1 ? Math.round(scaledWinnerBonus(n) * fraction) : 0
          await awardPositionBasedPoints(league, standings, 'TD Pass', bonusFn, memberCount)
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
      let generateReport = ['nba_dfs', 'wnba_dfs', 'mlb_dfs'].includes(league.format)
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
