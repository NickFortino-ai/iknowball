import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { calculateRewardPoints, calculateRiskPoints } from '../utils/scoring.js'

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

  if (locked > 0 || survivorLocked > 0) {
    logger.info({ locked, survivorLocked, games: gameIds.length }, 'Picks locked')
  }
}
