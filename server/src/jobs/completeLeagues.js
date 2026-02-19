import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { getPickemStandings } from '../services/leagueService.js'
import { getBracketStandings } from '../services/bracketService.js'

const BRACKET_WIN_BONUS = 10

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

async function awardLeagueWinner(league, winnerId) {
  // Pick'em: +1 point per league member; Bracket: flat +10
  const bonus = league.format === 'pickem'
    ? await getLeagueMemberCount(league.id)
    : BRACKET_WIN_BONUS

  // Award global points
  const { error } = await supabase.rpc('increment_user_points', {
    user_row_id: winnerId,
    points_delta: bonus,
  })

  if (error) {
    logger.error({ error, winnerId, leagueId: league.id }, 'Failed to award league winner bonus')
    return
  }

  // Record bonus_points entry for pick history
  await supabase.from('bonus_points').insert({
    user_id: winnerId,
    league_id: league.id,
    type: 'league_win',
    label: league.format === 'pickem'
      ? `Won ${bonus}-person league +${bonus} pts`
      : `League Winner +${bonus} points`,
    points: bonus,
  })

  // Award sport stats
  if (league.sport && league.sport !== 'all') {
    const { data: sport } = await supabase
      .from('sports')
      .select('id')
      .eq('key', league.sport)
      .single()

    if (sport) {
      await supabase.rpc('update_sport_stats', {
        p_user_id: winnerId,
        p_sport_id: sport.id,
        p_is_correct: true,
        p_points: bonus,
      })
    }
  }

  logger.info({ winnerId, leagueId: league.id, format: league.format, bonus }, 'League winner awarded')
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
      let winnerId = null

      if (league.format === 'pickem') {
        const standings = await getPickemStandings(league.id)
        if (standings?.length > 0) {
          winnerId = standings[0].user_id
        }
      } else if (league.format === 'bracket') {
        const standings = await getBracketStandings(league.id)
        if (standings?.length > 0) {
          winnerId = standings[0].user_id
        }
      }

      if (winnerId) {
        await awardLeagueWinner(league, winnerId)
      }

      // Mark league as completed
      await supabase
        .from('leagues')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', league.id)

      logger.info({ leagueId: league.id, format: league.format, winnerId }, 'League completed')
    } catch (err) {
      logger.error({ err, leagueId: league.id }, 'Failed to complete league')
    }
  }
}
