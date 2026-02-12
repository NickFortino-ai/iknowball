import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

export async function scoreCompletedGame(gameId, winner, sportId) {
  // Get all locked picks for this game
  const { data: picks, error } = await supabase
    .from('picks')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'locked')

  if (error) {
    logger.error({ error, gameId }, 'Failed to fetch picks for scoring')
    return
  }

  if (!picks?.length) {
    logger.info({ gameId }, 'No locked picks to score')
    return
  }

  for (const pick of picks) {
    let isCorrect = null
    let pointsEarned = 0

    if (winner === null) {
      // Push (tie) — no points gained or lost
      isCorrect = null
      pointsEarned = 0
    } else if (pick.picked_team === winner) {
      isCorrect = true
      pointsEarned = pick.reward_points || 0
    } else {
      isCorrect = false
      pointsEarned = -(pick.risk_points || 0)
    }

    // Update pick
    const { error: pickError } = await supabase
      .from('picks')
      .update({
        status: 'settled',
        is_correct: isCorrect,
        points_earned: pointsEarned,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pick.id)

    if (pickError) {
      logger.error({ pickError, pickId: pick.id }, 'Failed to settle pick')
      continue
    }

    // Update user total points (skip for pushes)
    if (pointsEarned !== 0) {
      const { error: pointsError } = await supabase
        .rpc('increment_user_points', {
          user_row_id: pick.user_id,
          points_delta: pointsEarned,
        })

      if (pointsError) {
        logger.error({ pointsError, userId: pick.user_id }, 'Failed to update user points')
      }
    }

    // Update sport stats (skip for pushes)
    if (isCorrect !== null) {
      const { error: statsError } = await supabase
        .rpc('update_sport_stats', {
          p_user_id: pick.user_id,
          p_sport_id: sportId,
          p_is_correct: isCorrect,
          p_points: pointsEarned,
        })

      if (statsError) {
        logger.error({ statsError, userId: pick.user_id }, 'Failed to update sport stats')
      }
    }
  }

  logger.info({ gameId, picksScored: picks.length, winner }, 'Game picks scored')
}
