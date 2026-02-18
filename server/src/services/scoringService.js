import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from './notificationService.js'
import { BASE_RISK_POINTS } from '../config/constants.js'

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
        logger.error({ pointsError, userId: pick.user_id, pickId: pick.id }, 'Failed to update user points, reverting pick to locked')
        await supabase
          .from('picks')
          .update({ status: 'locked', is_correct: null, points_earned: null, updated_at: new Date().toISOString() })
          .eq('id', pick.id)
        continue
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

      // Record streak events for correct picks
      if (isCorrect === true) {
        try {
          const { data: updatedStats } = await supabase
            .from('user_sport_stats')
            .select('current_streak')
            .eq('user_id', pick.user_id)
            .eq('sport_id', sportId)
            .single()

          const streak = updatedStats?.current_streak || 0

          if (streak >= 5) {
            await supabase.from('streak_events').insert({
              user_id: pick.user_id,
              sport_id: sportId,
              streak_length: streak,
            })

            // Notify on milestone streaks (5, 10, 15...)
            if (streak % 5 === 0) {
              await createNotification(
                pick.user_id,
                'streak_milestone',
                `You're on a ${streak}-game win streak!`,
                { streak, sportId }
              )
            }
          }
        } catch (err) {
          logger.error({ err, userId: pick.user_id }, 'Failed to record streak event')
        }
      }
    }
  }

  logger.info({ gameId, picksScored: picks.length, winner }, 'Game picks scored')
}

export async function scoreParlayLegs(gameId, winner) {
  // Find all locked parlay legs for this game
  const { data: legs, error } = await supabase
    .from('parlay_legs')
    .select('*, parlays(id, user_id, risk_points)')
    .eq('game_id', gameId)
    .eq('status', 'locked')

  if (error) {
    logger.error({ error, gameId }, 'Failed to fetch parlay legs for scoring')
    return
  }

  if (!legs?.length) return

  // Determine outcome for each leg
  for (const leg of legs) {
    let legStatus
    if (winner === null) {
      legStatus = 'push'
    } else if (leg.picked_team === winner) {
      legStatus = 'won'
    } else {
      legStatus = 'lost'
    }

    await supabase
      .from('parlay_legs')
      .update({ status: legStatus, updated_at: new Date().toISOString() })
      .eq('id', leg.id)
  }

  // Try to settle each affected parlay
  const parlayIds = [...new Set(legs.map((l) => l.parlay_id))]
  for (const parlayId of parlayIds) {
    await trySettleParlay(parlayId)
  }

  logger.info({ gameId, legsScored: legs.length, winner }, 'Parlay legs scored')
}

async function trySettleParlay(parlayId) {
  const { data: parlay } = await supabase
    .from('parlays')
    .select('id, user_id, risk_points, status')
    .eq('id', parlayId)
    .single()

  if (!parlay || parlay.status === 'settled') return

  const { data: legs } = await supabase
    .from('parlay_legs')
    .select('status, multiplier_at_lock')
    .eq('parlay_id', parlayId)

  if (!legs?.length) return

  const hasLost = legs.some((l) => l.status === 'lost')
  const hasPendingOrLocked = legs.some((l) => l.status === 'pending' || l.status === 'locked')

  // If any leg lost, settle immediately as lost
  if (hasLost) {
    const pointsEarned = -parlay.risk_points
    const { error: updateError } = await supabase
      .from('parlays')
      .update({
        status: 'settled',
        is_correct: false,
        points_earned: pointsEarned,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parlayId)

    if (updateError) {
      logger.error({ updateError, parlayId }, 'Failed to settle losing parlay')
      return
    }

    const { error: pointsError } = await supabase
      .rpc('increment_user_points', {
        user_row_id: parlay.user_id,
        points_delta: pointsEarned,
      })

    if (pointsError) {
      logger.error({ pointsError, parlayId }, 'Failed to update points for parlay, reverting to locked')
      await supabase
        .from('parlays')
        .update({ status: 'locked', is_correct: null, points_earned: null, updated_at: new Date().toISOString() })
        .eq('id', parlayId)
      return
    }

    await createNotification(
      parlay.user_id,
      'parlay_result',
      `Your ${legs.length}-leg parlay lost (${pointsEarned} pts)`,
      { parlayId }
    )
    return
  }

  // If there are still pending/locked legs, don't settle yet
  if (hasPendingOrLocked) return

  // All legs resolved — check if all pushes or some wins
  const wonLegs = legs.filter((l) => l.status === 'won')

  if (wonLegs.length === 0) {
    // All pushes — no points change
    await supabase
      .from('parlays')
      .update({
        status: 'settled',
        is_correct: null,
        points_earned: 0,
        combined_multiplier: 1,
        reward_points: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parlayId)
    return
  }

  // At least one won — recalculate multiplier from won legs only
  let combinedMultiplier = 1
  for (const leg of wonLegs) {
    combinedMultiplier *= (leg.multiplier_at_lock || 2)
  }

  const rewardPoints = Math.max(1, Math.round(BASE_RISK_POINTS * (combinedMultiplier - 1)))
  const pointsEarned = rewardPoints

  const { error: updateError } = await supabase
    .from('parlays')
    .update({
      status: 'settled',
      is_correct: true,
      combined_multiplier: combinedMultiplier,
      reward_points: rewardPoints,
      points_earned: pointsEarned,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parlayId)

  if (updateError) {
    logger.error({ updateError, parlayId }, 'Failed to settle winning parlay')
    return
  }

  const { error: pointsError } = await supabase
    .rpc('increment_user_points', {
      user_row_id: parlay.user_id,
      points_delta: pointsEarned,
    })

  if (pointsError) {
    logger.error({ pointsError, parlayId }, 'Failed to update points for parlay, reverting to locked')
    await supabase
      .from('parlays')
      .update({ status: 'locked', is_correct: null, points_earned: null, combined_multiplier: null, reward_points: null, updated_at: new Date().toISOString() })
      .eq('id', parlayId)
    return
  }

  await createNotification(
    parlay.user_id,
    'parlay_result',
    `Your ${legs.length}-leg parlay won! (+${pointsEarned} pts)`,
    { parlayId }
  )
}

export async function recalculateAllUserPoints() {
  // Sum points_earned from all three settled pick tables per user
  const { data: pickTotals } = await supabase
    .from('picks')
    .select('user_id, points_earned')
    .eq('status', 'settled')
    .not('points_earned', 'is', null)

  const { data: parlayTotals } = await supabase
    .from('parlays')
    .select('user_id, points_earned')
    .eq('status', 'settled')
    .not('points_earned', 'is', null)

  const { data: propTotals } = await supabase
    .from('prop_picks')
    .select('user_id, points_earned')
    .eq('status', 'settled')
    .not('points_earned', 'is', null)

  // Aggregate per user
  const userPoints = {}
  for (const row of [...(pickTotals || []), ...(parlayTotals || []), ...(propTotals || [])]) {
    userPoints[row.user_id] = (userPoints[row.user_id] || 0) + row.points_earned
  }

  // Get current stored totals
  const { data: users } = await supabase
    .from('users')
    .select('id, total_points')

  const results = []
  for (const user of (users || [])) {
    const correctTotal = userPoints[user.id] || 0
    if (correctTotal !== user.total_points) {
      const delta = correctTotal - user.total_points
      const { error } = await supabase
        .rpc('increment_user_points', {
          user_row_id: user.id,
          points_delta: delta,
        })

      if (error) {
        logger.error({ error, userId: user.id }, 'Failed to recalculate user points')
      } else {
        results.push({
          userId: user.id,
          was: user.total_points,
          now: correctTotal,
          delta,
        })
        logger.info({ userId: user.id, was: user.total_points, now: correctTotal }, 'Recalculated user points')
      }
    }
  }

  // Recalculate user_sport_stats totals
  const { data: sportPicks } = await supabase
    .from('picks')
    .select('user_id, points_earned, is_correct, games!inner(sport_id)')
    .eq('status', 'settled')
    .not('is_correct', 'is', null)

  const sportStats = {}
  for (const pick of (sportPicks || [])) {
    const key = `${pick.user_id}:${pick.games.sport_id}`
    if (!sportStats[key]) {
      sportStats[key] = { user_id: pick.user_id, sport_id: pick.games.sport_id, total_picks: 0, correct_picks: 0, total_points: 0 }
    }
    sportStats[key].total_picks++
    if (pick.is_correct) sportStats[key].correct_picks++
    sportStats[key].total_points += pick.points_earned || 0
  }

  for (const stat of Object.values(sportStats)) {
    await supabase
      .from('user_sport_stats')
      .upsert({
        user_id: stat.user_id,
        sport_id: stat.sport_id,
        total_picks: stat.total_picks,
        correct_picks: stat.correct_picks,
        total_points: stat.total_points,
      }, { onConflict: 'user_id,sport_id' })
  }

  return results
}
