import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { calculateRiskPoints, calculateRewardPoints } from '../utils/scoring.js'

export async function submitPick(userId, gameId, pickedTeam, multiplier = 1) {
  // Verify game exists and hasn't started
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, status, starts_at, home_odds, away_odds')
    .eq('id', gameId)
    .single()

  if (gameError || !game) {
    const err = new Error('Game not found')
    err.status = 404
    throw err
  }

  if (game.status !== 'upcoming') {
    const err = new Error('Game has already started — picks are locked')
    err.status = 400
    throw err
  }

  if (new Date(game.starts_at) <= new Date()) {
    const err = new Error('Game has already started — picks are locked')
    err.status = 400
    throw err
  }

  // Validate multiplier budget
  if (multiplier > 1) {
    await validateMultiplierBudget(userId, gameId, multiplier, game, pickedTeam)
  }

  // Snapshot odds at submission time
  const odds = pickedTeam === 'home' ? game.home_odds : game.away_odds
  const oddsAtSubmission = odds || null
  const baseRisk = odds ? calculateRiskPoints(odds) : null
  const baseReward = odds ? calculateRewardPoints(odds) : null
  const riskAtSubmission = baseRisk ? baseRisk * multiplier : null
  const rewardAtSubmission = baseReward ? baseReward * multiplier : null

  // Upsert pick (user can change pick before lock)
  const { data, error } = await supabase
    .from('picks')
    .upsert(
      {
        user_id: userId,
        game_id: gameId,
        picked_team: pickedTeam,
        status: 'pending',
        multiplier,
        updated_at: new Date().toISOString(),
        odds_at_submission: oddsAtSubmission,
        risk_at_submission: riskAtSubmission,
        reward_at_submission: rewardAtSubmission,
      },
      { onConflict: 'user_id,game_id' }
    )
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Failed to submit pick')
    throw error
  }

  return data
}

async function validateMultiplierBudget(userId, excludeGameId, multiplier, game, pickedTeam) {
  // Get user's total_points
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('total_points')
    .eq('id', userId)
    .single()

  if (userError || !user) {
    const err = new Error('User not found')
    err.status = 404
    throw err
  }

  if (user.total_points < 20) {
    const err = new Error('You need at least 20 points to use multipliers')
    err.status = 400
    throw err
  }

  // Calculate extra cost of this pick
  const odds = pickedTeam === 'home' ? game.home_odds : game.away_odds
  const baseRisk = odds ? calculateRiskPoints(odds) : 0
  const extraCost = baseRisk * (multiplier - 1)

  // Sum extra costs from other pending multiplied picks (excluding current game)
  const { data: otherPicks, error: picksError } = await supabase
    .from('picks')
    .select('risk_at_submission, multiplier')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gt('multiplier', 1)
    .neq('game_id', excludeGameId)

  if (picksError) {
    logger.error({ error: picksError }, 'Failed to check multiplier budget')
    throw picksError
  }

  const usedBudget = (otherPicks || []).reduce((sum, p) => {
    // risk_at_submission already includes multiplier, so base = risk / multiplier
    const base = p.risk_at_submission / p.multiplier
    return sum + base * (p.multiplier - 1)
  }, 0)

  if (usedBudget + extraCost > user.total_points) {
    const err = new Error('Not enough points budget for this multiplier')
    err.status = 400
    throw err
  }
}

export async function updatePickMultiplier(userId, gameId, multiplier) {
  // Fetch the pending pick
  const { data: pick, error: pickError } = await supabase
    .from('picks')
    .select('*, games(id, home_odds, away_odds)')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .eq('status', 'pending')
    .single()

  if (pickError || !pick) {
    const err = new Error('Pending pick not found')
    err.status = 404
    throw err
  }

  const game = pick.games

  // Validate budget if multiplier > 1
  if (multiplier > 1) {
    await validateMultiplierBudget(userId, gameId, multiplier, game, pick.picked_team)
  }

  // Recalculate risk/reward with new multiplier
  const odds = pick.picked_team === 'home' ? game.home_odds : game.away_odds
  const baseRisk = odds ? calculateRiskPoints(odds) : null
  const baseReward = odds ? calculateRewardPoints(odds) : null
  const riskAtSubmission = baseRisk ? baseRisk * multiplier : null
  const rewardAtSubmission = baseReward ? baseReward * multiplier : null

  const { data, error } = await supabase
    .from('picks')
    .update({
      multiplier,
      risk_at_submission: riskAtSubmission,
      reward_at_submission: rewardAtSubmission,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pick.id)
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Failed to update pick multiplier')
    throw error
  }

  return data
}

export async function deletePick(userId, gameId) {
  const { data: pick } = await supabase
    .from('picks')
    .select('id, status')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .single()

  if (!pick) {
    const err = new Error('Pick not found')
    err.status = 404
    throw err
  }

  if (pick.status !== 'pending') {
    const err = new Error('Cannot undo a locked or settled pick')
    err.status = 400
    throw err
  }

  const { error } = await supabase
    .from('picks')
    .delete()
    .eq('id', pick.id)

  if (error) {
    logger.error({ error }, 'Failed to delete pick')
    throw error
  }
}

export async function getUserPicks(userId, status) {
  let query = supabase
    .from('picks')
    .select('*, games(*, sports(key, name))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error

  return data
}

export async function getUserPickHistory(userId) {
  const { data, error } = await supabase
    .from('picks')
    .select('*, games(*, sports(key, name))')
    .eq('user_id', userId)
    .in('status', ['locked', 'settled'])
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getPickById(pickId) {
  const { data, error } = await supabase
    .from('picks')
    .select('*, games(*, sports(key, name))')
    .eq('id', pickId)
    .single()

  if (error || !data) {
    const err = new Error('Pick not found')
    err.status = 404
    throw err
  }

  return data
}

export async function getGamePicksData(userId, gameId) {
  // Get connected user IDs
  const { data: connections } = await supabase
    .from('connections')
    .select('user_id_1, user_id_2')
    .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
    .eq('status', 'connected')

  const connectedIds = (connections || []).map((c) =>
    c.user_id_1 === userId ? c.user_id_2 : c.user_id_1
  )

  const [squadResult, homeCount, awayCount] = await Promise.all([
    // Squad picks (skip if no connections)
    connectedIds.length > 0
      ? supabase
          .from('picks')
          .select('picked_team, users(id, username, display_name, avatar_emoji)')
          .eq('game_id', gameId)
          .in('user_id', connectedIds)
      : { data: [] },
    // Total home picks
    supabase
      .from('picks')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('picked_team', 'home'),
    // Total away picks
    supabase
      .from('picks')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('picked_team', 'away'),
  ])

  return {
    squadPicks: (squadResult.data || []).map((p) => ({
      picked_team: p.picked_team,
      ...p.users,
    })),
    totalCounts: {
      home: homeCount.count || 0,
      away: awayCount.count || 0,
    },
  }
}

export async function getPublicPickHistory(userId) {
  const { data, error } = await supabase
    .from('picks')
    .select('*, games(*, sports(key, name))')
    .eq('user_id', userId)
    .in('status', ['locked', 'settled'])
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}
