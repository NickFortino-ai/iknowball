import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { americanToMultiplier } from '../utils/scoring.js'
import { BASE_RISK_POINTS } from '../config/constants.js'

export async function createParlay(userId, legs) {
  // Validate leg count
  if (legs.length < 2 || legs.length > 5) {
    const err = new Error('Parlays must have between 2 and 5 legs')
    err.status = 400
    throw err
  }

  // Check for duplicate game IDs
  const gameIds = legs.map((l) => l.game_id)
  if (new Set(gameIds).size !== gameIds.length) {
    const err = new Error('Cannot pick the same game twice in a parlay')
    err.status = 400
    throw err
  }

  // Fetch all games and verify they're upcoming
  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select('id, status, starts_at, home_odds, away_odds')
    .in('id', gameIds)

  if (gamesError) {
    logger.error({ error: gamesError }, 'Failed to fetch games for parlay')
    throw gamesError
  }

  if (!games || games.length !== legs.length) {
    const err = new Error('One or more games not found')
    err.status = 404
    throw err
  }

  const gamesMap = {}
  for (const game of games) {
    gamesMap[game.id] = game
  }

  for (const game of games) {
    if (game.status !== 'upcoming') {
      const err = new Error('One or more games have already started')
      err.status = 400
      throw err
    }
    if (new Date(game.starts_at) <= new Date()) {
      const err = new Error('One or more games have already started')
      err.status = 400
      throw err
    }
  }

  // Calculate combined multiplier
  let combinedMultiplier = 1
  const legData = []

  for (const leg of legs) {
    const game = gamesMap[leg.game_id]
    const odds = leg.picked_team === 'home' ? game.home_odds : game.away_odds
    const decimalOdds = odds ? 1 + americanToMultiplier(odds) : 2 // default to even if no odds

    combinedMultiplier *= decimalOdds

    legData.push({
      game_id: leg.game_id,
      picked_team: leg.picked_team,
      odds_at_submission: odds || null,
    })
  }

  const rewardPoints = Math.max(1, Math.round(BASE_RISK_POINTS * (combinedMultiplier - 1)))

  // Insert parlay
  const { data: parlay, error: parlayError } = await supabase
    .from('parlays')
    .insert({
      user_id: userId,
      status: 'pending',
      leg_count: legs.length,
      risk_points: BASE_RISK_POINTS,
      combined_multiplier: combinedMultiplier,
      reward_points: rewardPoints,
    })
    .select()
    .single()

  if (parlayError) {
    logger.error({ error: parlayError }, 'Failed to create parlay')
    throw parlayError
  }

  // Insert legs
  const legsToInsert = legData.map((leg) => ({
    parlay_id: parlay.id,
    game_id: leg.game_id,
    picked_team: leg.picked_team,
    odds_at_submission: leg.odds_at_submission,
  }))

  const { data: insertedLegs, error: legsError } = await supabase
    .from('parlay_legs')
    .insert(legsToInsert)
    .select('*, games(*, sports(key, name))')

  if (legsError) {
    logger.error({ error: legsError }, 'Failed to insert parlay legs')
    // Clean up the parlay
    await supabase.from('parlays').delete().eq('id', parlay.id)
    throw legsError
  }

  return { ...parlay, parlay_legs: insertedLegs }
}

export async function deleteParlay(userId, parlayId) {
  const { data: parlay } = await supabase
    .from('parlays')
    .select('id, status')
    .eq('id', parlayId)
    .eq('user_id', userId)
    .single()

  if (!parlay) {
    const err = new Error('Parlay not found')
    err.status = 404
    throw err
  }

  if (parlay.status !== 'pending') {
    const err = new Error('Cannot delete a locked or settled parlay')
    err.status = 400
    throw err
  }

  const { error } = await supabase
    .from('parlays')
    .delete()
    .eq('id', parlay.id)

  if (error) {
    logger.error({ error }, 'Failed to delete parlay')
    throw error
  }
}

export async function getUserParlays(userId, status) {
  let query = supabase
    .from('parlays')
    .select('*, parlay_legs(*, games(*, sports(key, name)))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getUserParlayHistory(userId) {
  const { data, error } = await supabase
    .from('parlays')
    .select('*, parlay_legs(*, games(*, sports(key, name)))')
    .eq('user_id', userId)
    .eq('status', 'settled')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data
}
