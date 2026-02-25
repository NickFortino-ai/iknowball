import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { fetchFuturesOdds, FUTURES_SPORT_KEYS } from './oddsService.js'
import { calculateRiskPoints, calculateRewardPoints } from '../utils/scoring.js'
import { createNotification } from './notificationService.js'
import { checkRecordAfterSettle } from './recordService.js'

export async function syncFuturesForSport(parentSportKey) {
  const futuresKeys = FUTURES_SPORT_KEYS[parentSportKey] || []
  if (!futuresKeys.length) return { synced: 0 }

  let totalSynced = 0

  for (const futuresKey of futuresKeys) {
    try {
      const events = await fetchFuturesOdds(futuresKey)
      const eventsList = Array.isArray(events) ? events : [events]

      for (const event of eventsList) {
        if (!event?.id) continue

        // Pick the first available bookmaker
        const bookmaker = event.bookmakers?.[0]
        const outrightsMarket = bookmaker?.markets?.find((m) => m.key === 'outrights')
        const outcomes = (outrightsMarket?.outcomes || []).map((o) => ({
          name: o.name,
          odds: o.price,
        }))

        // Don't overwrite settled markets
        const { data: existing } = await supabase
          .from('futures_markets')
          .select('status')
          .eq('external_event_id', event.id)
          .single()

        if (existing?.status === 'settled') continue

        const { error } = await supabase
          .from('futures_markets')
          .upsert({
            sport_key: parentSportKey,
            futures_sport_key: futuresKey,
            external_event_id: event.id,
            title: event.sport_title || futuresKey.replace(/_/g, ' '),
            outcomes,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'external_event_id' })

        if (error) {
          logger.error({ error, eventId: event.id }, 'Failed to upsert futures market')
        } else {
          totalSynced++
        }
      }
    } catch (err) {
      logger.warn({ err: err.message, futuresKey }, 'Failed to fetch futures odds')
    }
  }

  return { synced: totalSynced }
}

export async function getFuturesMarkets(sportKey, status) {
  let query = supabase
    .from('futures_markets')
    .select('*')
    .order('title')

  if (sportKey) {
    query = query.eq('sport_key', sportKey)
  }
  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getFuturesMarketById(marketId) {
  const { data, error } = await supabase
    .from('futures_markets')
    .select('*')
    .eq('id', marketId)
    .single()

  if (error || !data) {
    const err = new Error('Futures market not found')
    err.status = 404
    throw err
  }
  return data
}

export async function submitFuturesPick(userId, marketId, pickedOutcome) {
  // Verify market exists and is active
  const { data: market, error: marketError } = await supabase
    .from('futures_markets')
    .select('id, status, outcomes')
    .eq('id', marketId)
    .single()

  if (marketError || !market) {
    const err = new Error('Futures market not found')
    err.status = 404
    throw err
  }

  if (market.status !== 'active') {
    const err = new Error('This futures market is no longer accepting picks')
    err.status = 400
    throw err
  }

  // Check if user already has a pick on this market (locked immediately, no changes)
  const { data: existingPick } = await supabase
    .from('futures_picks')
    .select('id')
    .eq('user_id', userId)
    .eq('market_id', marketId)
    .single()

  if (existingPick) {
    const err = new Error('You already have a pick on this market')
    err.status = 400
    throw err
  }

  // Find outcome in market data (server-authoritative odds)
  const outcomes = typeof market.outcomes === 'string'
    ? JSON.parse(market.outcomes)
    : market.outcomes || []
  const outcomeData = outcomes.find((o) => o.name === pickedOutcome)

  if (!outcomeData) {
    const err = new Error('Invalid outcome for this market')
    err.status = 400
    throw err
  }

  const currentOdds = outcomeData.odds
  const riskPoints = calculateRiskPoints(currentOdds)
  const rewardPoints = calculateRewardPoints(currentOdds)

  const { data, error } = await supabase
    .from('futures_picks')
    .insert({
      user_id: userId,
      market_id: marketId,
      picked_outcome: pickedOutcome,
      odds_at_submission: currentOdds,
      risk_at_submission: riskPoints,
      reward_at_submission: rewardPoints,
      status: 'locked',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      const err = new Error('You already have a pick on this market')
      err.status = 400
      throw err
    }
    logger.error({ error }, 'Failed to submit futures pick')
    throw error
  }

  return data
}

export async function getUserFuturesPicks(userId, status) {
  let query = supabase
    .from('futures_picks')
    .select('*, futures_markets(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getUserFuturesPickHistory(userId) {
  const { data, error } = await supabase
    .from('futures_picks')
    .select('*, futures_markets(*)')
    .eq('user_id', userId)
    .in('status', ['locked', 'settled'])
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function closeFuturesMarket(marketId) {
  const { error } = await supabase
    .from('futures_markets')
    .update({ status: 'closed', updated_at: new Date().toISOString() })
    .eq('id', marketId)
    .eq('status', 'active')

  if (error) {
    logger.error({ error, marketId }, 'Failed to close futures market')
    throw error
  }

  logger.info({ marketId }, 'Futures market closed')
}

export async function settleFuturesMarket(marketId, winningOutcome) {
  // Update market status
  const { data: market, error: marketError } = await supabase
    .from('futures_markets')
    .update({
      status: 'settled',
      winning_outcome: winningOutcome,
      updated_at: new Date().toISOString(),
    })
    .eq('id', marketId)
    .in('status', ['active', 'closed'])
    .select('*')
    .single()

  if (marketError || !market) {
    logger.error({ marketError, marketId }, 'Failed to settle futures market')
    const err = new Error('Failed to settle market — it may already be settled')
    err.status = 400
    throw err
  }

  // Get all locked picks for this market
  const { data: picks, error: picksError } = await supabase
    .from('futures_picks')
    .select('*')
    .eq('market_id', marketId)
    .eq('status', 'locked')

  if (picksError) {
    logger.error({ picksError, marketId }, 'Failed to fetch futures picks for scoring')
    return { scored: 0 }
  }

  if (!picks?.length) {
    return { scored: 0 }
  }

  let scored = 0

  for (const pick of picks) {
    const isCorrect = pick.picked_outcome === winningOutcome
    const pointsEarned = isCorrect
      ? (pick.reward_at_submission || 0)
      : -(pick.risk_at_submission || 0)

    const { error: pickError } = await supabase
      .from('futures_picks')
      .update({
        status: 'settled',
        is_correct: isCorrect,
        points_earned: pointsEarned,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pick.id)

    if (pickError) {
      logger.error({ pickError, pickId: pick.id }, 'Failed to settle futures pick')
      continue
    }

    // Update user total points
    if (pointsEarned !== 0) {
      const { error: pointsError } = await supabase
        .rpc('increment_user_points', {
          user_row_id: pick.user_id,
          points_delta: pointsEarned,
        })

      if (pointsError) {
        logger.error({ pointsError, userId: pick.user_id }, 'Failed to update user points for futures, reverting')
        await supabase
          .from('futures_picks')
          .update({ status: 'locked', is_correct: null, points_earned: null, updated_at: new Date().toISOString() })
          .eq('id', pick.id)
        continue
      }
    }

    // Send notification
    await createNotification(
      pick.user_id,
      'futures_result',
      `Your futures pick "${pick.picked_outcome}" ${isCorrect ? 'won' : 'lost'}! (${pointsEarned > 0 ? '+' : ''}${pointsEarned} pts)`,
      { marketId, pickId: pick.id }
    )

    // Check records after futures pick settles
    try {
      await checkRecordAfterSettle(pick.user_id, 'futures', {
        isCorrect,
        odds: pick.odds_at_submission,
        sportKey: market.sport_key,
      })
    } catch (err) {
      logger.error({ err, userId: pick.user_id }, 'Record check after futures settle failed')
    }

    scored++
  }

  logger.info({ marketId, scored, winningOutcome }, 'Futures market settled')
  return { scored }
}
