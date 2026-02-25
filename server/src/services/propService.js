import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { fetchPlayerProps } from './oddsService.js'
import { getMarketLabel } from '../utils/propMarkets.js'
import { calculateRiskPoints, calculateRewardPoints } from '../utils/scoring.js'

export async function syncPropsForGame(gameId, markets) {
  // Get game details
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, external_id, sport_id, sports(key)')
    .eq('id', gameId)
    .single()

  if (gameError || !game) {
    const err = new Error('Game not found')
    err.status = 404
    throw err
  }

  const sportKey = game.sports.key
  const eventId = game.external_id

  // Fetch props from Odds API
  let apiData
  try {
    apiData = await fetchPlayerProps(sportKey, eventId, markets)
  } catch (err) {
    logger.warn({ err, sportKey, eventId }, 'No player props available from API')
    return { synced: 0 }
  }

  if (!apiData?.bookmakers?.length) {
    return { synced: 0 }
  }

  // Use first bookmaker
  const bookmaker = apiData.bookmakers[0]
  const rows = []

  for (const market of bookmaker.markets || []) {
    for (const outcome of market.outcomes || []) {
      if (!outcome.point && outcome.point !== 0) continue

      const playerName = outcome.description || outcome.name
      const line = outcome.point
      const side = outcome.name?.toLowerCase()

      let row = rows.find(
        (r) => r.player_name === playerName && r.market_key === market.key && r.line === line
      )

      if (!row) {
        row = {
          game_id: gameId,
          sport_id: game.sport_id,
          player_name: playerName,
          market_key: market.key,
          market_label: getMarketLabel(market.key),
          line,
          over_odds: null,
          under_odds: null,
          bookmaker: bookmaker.key,
          external_event_id: eventId,
        }
        rows.push(row)
      }

      if (side === 'over') {
        row.over_odds = outcome.price
      } else if (side === 'under') {
        row.under_odds = outcome.price
      }
    }
  }

  if (!rows.length) {
    return { synced: 0 }
  }

  // Upsert props — omit status so existing published/locked props keep their status
  for (const row of rows) {
    const { error } = await supabase
      .from('player_props')
      .upsert(row, { onConflict: 'game_id,player_name,market_key,line' })

    if (error) {
      logger.error({ error, row }, 'Failed to upsert prop')
    }
  }

  logger.info({ gameId, synced: rows.length }, 'Props synced for game')
  return { synced: rows.length }
}

export async function getAllPropsForGame(gameId) {
  const { data, error } = await supabase
    .from('player_props')
    .select('*')
    .eq('game_id', gameId)
    .order('player_name')
    .order('market_key')

  if (error) throw error
  return data || []
}

export async function featureProp(propId, featuredDate) {
  // Check if another prop is already featured for this date
  const { data: existing } = await supabase
    .from('player_props')
    .select('id')
    .eq('featured_date', featuredDate)
    .neq('id', propId)
    .maybeSingle()

  if (existing) {
    const err = new Error('Another prop is already featured for this date. Unfeature it first.')
    err.status = 400
    throw err
  }

  const { data, error } = await supabase
    .from('player_props')
    .update({
      status: 'published',
      featured_date: featuredDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', propId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function unfeatureProp(propId) {
  // Check for existing picks
  const { count } = await supabase
    .from('prop_picks')
    .select('id', { count: 'exact', head: true })
    .eq('prop_id', propId)

  if (count > 0) {
    const err = new Error('Cannot unfeature prop with existing picks')
    err.status = 400
    throw err
  }

  const { data, error } = await supabase
    .from('player_props')
    .update({
      status: 'synced',
      featured_date: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', propId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getFeaturedProp(date) {
  const { data, error } = await supabase
    .from('player_props')
    .select('*, games(id, home_team, away_team, starts_at, status, sports(key, name))')
    .eq('featured_date', date)
    .in('status', ['published', 'locked', 'settled'])
    .maybeSingle()

  if (error) throw error
  return data || null
}

export async function getFeaturedProps() {
  const { data, error } = await supabase
    .from('player_props')
    .select('*, games(id, home_team, away_team, starts_at, status, sports(key, name))')
    .not('featured_date', 'is', null)
    .order('featured_date', { ascending: true })

  if (error) throw error
  return data || []
}

export async function settleProps(settlements) {
  const results = []

  for (const { propId, outcome, actualValue } of settlements) {
    const updates = {
      status: 'settled',
      outcome,
      updated_at: new Date().toISOString(),
    }
    if (actualValue !== undefined && actualValue !== null) {
      updates.actual_value = actualValue
    }

    const { data: prop, error: propError } = await supabase
      .from('player_props')
      .update(updates)
      .eq('id', propId)
      .in('status', ['locked', 'published'])
      .select()
      .single()

    if (propError) {
      logger.error({ propError, propId }, 'Failed to settle prop')
      continue
    }

    // Score all locked prop_picks for this prop
    const { data: picks, error: picksError } = await supabase
      .from('prop_picks')
      .select('*')
      .eq('prop_id', propId)
      .eq('status', 'locked')

    if (picksError) {
      logger.error({ picksError, propId }, 'Failed to fetch prop picks for scoring')
      continue
    }

    if (!picks?.length) {
      results.push({ propId, scored: 0 })
      continue
    }

    for (const pick of picks) {
      let isCorrect = null
      let pointsEarned = 0

      if (outcome === 'push') {
        isCorrect = null
        pointsEarned = 0
      } else if (pick.picked_side === outcome) {
        isCorrect = true
        pointsEarned = pick.reward_points || 0
      } else {
        isCorrect = false
        pointsEarned = -(pick.risk_points || 0)
      }

      const { error: pickError } = await supabase
        .from('prop_picks')
        .update({
          status: 'settled',
          is_correct: isCorrect,
          points_earned: pointsEarned,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pick.id)

      if (pickError) {
        logger.error({ pickError, pickId: pick.id }, 'Failed to settle prop pick')
        continue
      }

      if (pointsEarned !== 0) {
        const { error: pointsError } = await supabase
          .rpc('increment_user_points', {
            user_row_id: pick.user_id,
            points_delta: pointsEarned,
          })

        if (pointsError) {
          logger.error({ pointsError, userId: pick.user_id }, 'Failed to update user points for prop')
        }
      }

      if (isCorrect !== null) {
        const { error: statsError } = await supabase
          .rpc('update_sport_stats', {
            p_user_id: pick.user_id,
            p_sport_id: prop.sport_id,
            p_is_correct: isCorrect,
            p_points: pointsEarned,
          })

        if (statsError) {
          logger.error({ statsError, userId: pick.user_id }, 'Failed to update sport stats for prop')
        }
      }
    }

    results.push({ propId, scored: picks.length })
    logger.info({ propId, scored: picks.length, outcome }, 'Prop picks scored')
  }

  return results
}

export async function submitPropPick(userId, propId, pickedSide) {
  const { data: prop, error: propError } = await supabase
    .from('player_props')
    .select('id, status, game_id, over_odds, under_odds, games(starts_at, status)')
    .eq('id', propId)
    .single()

  if (propError || !prop) {
    const err = new Error('Prop not found')
    err.status = 404
    throw err
  }

  if (prop.status !== 'published') {
    const err = new Error('This prop is not available for picking')
    err.status = 400
    throw err
  }

  if (prop.games.status !== 'upcoming' || new Date(prop.games.starts_at) <= new Date()) {
    const err = new Error('Game has already started — props are locked')
    err.status = 400
    throw err
  }

  // Snapshot odds at submission time
  const odds = pickedSide === 'over' ? prop.over_odds : prop.under_odds
  const oddsAtSubmission = odds || null
  const riskAtSubmission = odds ? calculateRiskPoints(odds) : null
  const rewardAtSubmission = odds ? calculateRewardPoints(odds) : null

  const { data, error } = await supabase
    .from('prop_picks')
    .upsert(
      {
        user_id: userId,
        prop_id: propId,
        picked_side: pickedSide,
        status: 'pending',
        updated_at: new Date().toISOString(),
        odds_at_submission: oddsAtSubmission,
        risk_at_submission: riskAtSubmission,
        reward_at_submission: rewardAtSubmission,
      },
      { onConflict: 'user_id,prop_id' }
    )
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Failed to submit prop pick')
    throw error
  }

  return data
}

export async function deletePropPick(userId, propId) {
  const { data: pick } = await supabase
    .from('prop_picks')
    .select('id, status')
    .eq('user_id', userId)
    .eq('prop_id', propId)
    .single()

  if (!pick) {
    const err = new Error('Prop pick not found')
    err.status = 404
    throw err
  }

  if (pick.status !== 'pending') {
    const err = new Error('Cannot undo a locked or settled prop pick')
    err.status = 400
    throw err
  }

  const { error } = await supabase
    .from('prop_picks')
    .delete()
    .eq('id', pick.id)

  if (error) {
    logger.error({ error }, 'Failed to delete prop pick')
    throw error
  }
}

export async function getPropPickById(propPickId) {
  const { data, error } = await supabase
    .from('prop_picks')
    .select('*, player_props(*, games(id, home_team, away_team, starts_at, status, sports(key, name)))')
    .eq('id', propPickId)
    .single()

  if (error || !data) {
    const err = new Error('Prop pick not found')
    err.status = 404
    throw err
  }

  return data
}

export async function getUserPropPicks(userId, status) {
  let query = supabase
    .from('prop_picks')
    .select('*, player_props(*, games(id, home_team, away_team, starts_at, status, sports(key, name)))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getUserPropPickHistory(userId) {
  const { data, error } = await supabase
    .from('prop_picks')
    .select('*, player_props(*, games(id, home_team, away_team, starts_at, status, sports(key, name)))')
    .eq('user_id', userId)
    .in('status', ['locked', 'settled'])
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data || []
}
