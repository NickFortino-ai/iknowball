import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { calculateRewardPoints, calculateRiskPoints, americanToMultiplier } from '../utils/scoring.js'

export async function lockPicks() {
  const now = new Date().toISOString()

  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select('id, home_odds, away_odds')
    .eq('status', 'upcoming')
    .lte('starts_at', now)

  if (gamesError) {
    logger.error({ error: gamesError }, 'Failed to fetch games for lock')
    return
  }

  if (!games?.length) return

  // Update games to live status
  const gameIds = games.map((g) => g.id)
  await supabase
    .from('games')
    .update({ status: 'live', updated_at: now })
    .in('id', gameIds)

  let locked = 0
  for (const game of games) {
    const { data: picks } = await supabase
      .from('picks')
      .select('id, picked_team')
      .eq('game_id', game.id)
      .eq('status', 'pending')

    if (!picks?.length) continue

    for (const pick of picks) {
      const odds = pick.picked_team === 'home' ? game.home_odds : game.away_odds
      const risk = odds ? calculateRiskPoints(odds) : 0
      const reward = odds ? calculateRewardPoints(odds) : 0

      const { error } = await supabase
        .from('picks')
        .update({
          status: 'locked',
          odds_at_pick: odds,
          risk_points: risk,
          reward_points: reward,
          updated_at: now,
        })
        .eq('id', pick.id)

      if (error) {
        logger.error({ error, pickId: pick.id }, 'Failed to lock pick')
      } else {
        locked++
      }
    }
  }

  // Lock survivor picks for these games
  let survivorLocked = 0
  for (const game of games) {
    const { data: survivorPicks } = await supabase
      .from('survivor_picks')
      .select('id')
      .eq('game_id', game.id)
      .eq('status', 'pending')

    if (survivorPicks?.length) {
      await supabase
        .from('survivor_picks')
        .update({ status: 'locked', updated_at: now })
        .eq('game_id', game.id)
        .eq('status', 'pending')

      survivorLocked += survivorPicks.length
    }
  }

  // Lock published player props and their pending picks for these games
  let propsLocked = 0
  let propPicksLocked = 0
  for (const game of games) {
    // Lock published props for this game
    const { data: props } = await supabase
      .from('player_props')
      .select('id, over_odds, under_odds')
      .eq('game_id', game.id)
      .eq('status', 'published')

    if (!props?.length) continue

    const propIds = props.map((p) => p.id)
    await supabase
      .from('player_props')
      .update({ status: 'locked', updated_at: now })
      .in('id', propIds)

    propsLocked += props.length

    // Lock pending prop picks and snapshot odds
    for (const prop of props) {
      const { data: propPicks } = await supabase
        .from('prop_picks')
        .select('id, picked_side')
        .eq('prop_id', prop.id)
        .eq('status', 'pending')

      if (!propPicks?.length) continue

      for (const pick of propPicks) {
        const odds = pick.picked_side === 'over' ? prop.over_odds : prop.under_odds
        const risk = odds ? calculateRiskPoints(odds) : 0
        const reward = odds ? calculateRewardPoints(odds) : 0

        const { error } = await supabase
          .from('prop_picks')
          .update({
            status: 'locked',
            odds_at_pick: odds,
            risk_points: risk,
            reward_points: reward,
            updated_at: now,
          })
          .eq('id', pick.id)

        if (error) {
          logger.error({ error, pickId: pick.id }, 'Failed to lock prop pick')
        } else {
          propPicksLocked++
        }
      }
    }
  }

  // Lock parlay legs for these games
  let parlayLegsLocked = 0
  for (const game of games) {
    const { data: legs } = await supabase
      .from('parlay_legs')
      .select('id, picked_team, parlay_id')
      .eq('game_id', game.id)
      .eq('status', 'pending')

    if (!legs?.length) continue

    for (const leg of legs) {
      const odds = leg.picked_team === 'home' ? game.home_odds : game.away_odds
      const multiplierAtLock = odds ? 1 + americanToMultiplier(odds) : 2

      const { error } = await supabase
        .from('parlay_legs')
        .update({
          status: 'locked',
          odds_at_lock: odds,
          multiplier_at_lock: multiplierAtLock,
          updated_at: now,
        })
        .eq('id', leg.id)

      if (error) {
        logger.error({ error, legId: leg.id }, 'Failed to lock parlay leg')
      } else {
        parlayLegsLocked++
      }

      // Update parent parlay to locked status
      await supabase
        .from('parlays')
        .update({ status: 'locked', updated_at: now })
        .eq('id', leg.parlay_id)
        .eq('status', 'pending')
    }
  }

  if (locked > 0 || survivorLocked > 0 || propsLocked > 0 || propPicksLocked > 0 || parlayLegsLocked > 0) {
    logger.info({ locked, survivorLocked, propsLocked, propPicksLocked, parlayLegsLocked, games: gameIds.length }, 'Picks locked')
  }
}
