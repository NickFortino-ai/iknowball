import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { getPickemStandings } from '../services/leagueService.js'
import { getBracketStandings } from '../services/bracketService.js'

const BRACKET_WINNER_BONUS = 10

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

async function awardPickemWinner(league, winnerId) {
  const memberCount = await getLeagueMemberCount(league.id)

  await awardUserPoints(winnerId, league, memberCount,
    `Won ${memberCount}-person league +${memberCount} pts`, 'league_win')

  logger.info({ winnerId, leagueId: league.id, bonus: memberCount }, 'Pickem league winner awarded')
}

// Bracket: every participant earns/loses points based on finishing position
// Formula: N + 1 - 2 * rank (plus +10 bonus for 1st place)
async function awardBracketStandings(league, standings) {
  const n = standings.length
  if (n === 0) return

  for (const entry of standings) {
    const rank = entry.rank
    const positionPoints = n + 1 - 2 * rank
    const isWinner = rank === 1
    const totalPoints = isWinner ? positionPoints + BRACKET_WINNER_BONUS : positionPoints

    let label
    if (isWinner) {
      label = `Bracket 1st of ${n} (+${positionPoints} +${BRACKET_WINNER_BONUS} bonus = +${totalPoints})`
    } else if (totalPoints >= 0) {
      label = `Bracket ${rank}${ordinal(rank)} of ${n} +${totalPoints} pts`
    } else {
      label = `Bracket ${rank}${ordinal(rank)} of ${n} ${totalPoints} pts`
    }

    await awardUserPoints(entry.user_id, league, totalPoints, label,
      isWinner ? 'league_win' : 'bracket_finish')

    logger.info({ userId: entry.user_id, leagueId: league.id, rank, totalPoints }, 'Bracket standing awarded')
  }
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

export async function completeLeagues() {
  const now = new Date().toISOString()

  // Find leagues past their end date that haven't been completed
  const { data: leagues, error } = await supabase
    .from('leagues')
    .select('*')
    .in('format', ['pickem', 'bracket'])
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
      if (league.format === 'pickem') {
        const standings = await getPickemStandings(league.id)
        if (standings?.length > 0) {
          await awardPickemWinner(league, standings[0].user_id)
        }
      } else if (league.format === 'bracket') {
        const standings = await getBracketStandings(league.id)
        if (standings?.length > 0) {
          await awardBracketStandings(league, standings)
        }
      }

      // Mark league as completed
      await supabase
        .from('leagues')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', league.id)

      logger.info({ leagueId: league.id, format: league.format }, 'League completed')
    } catch (err) {
      logger.error({ err, leagueId: league.id }, 'Failed to complete league')
    }
  }
}
