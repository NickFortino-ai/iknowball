import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { trySettleParlay } from '../services/scoringService.js'

export async function settleStuckParlays() {
  // Find parlay legs stuck in pending/locked whose game already went final
  const { data: stuckLegs, error } = await supabase
    .from('parlay_legs')
    .select('id, picked_team, parlay_id, games!inner(winner)')
    .in('status', ['pending', 'locked'])
    .eq('games.status', 'final')

  if (error) {
    logger.error({ error }, 'Failed to query stuck parlay legs')
    return
  }

  if (!stuckLegs?.length) return

  logger.info({ count: stuckLegs.length }, 'Found stuck parlay legs, settling')

  for (const leg of stuckLegs) {
    const winner = leg.games.winner
    let legStatus
    if (winner === null) {
      legStatus = 'push'
    } else if (leg.picked_team === winner) {
      legStatus = 'won'
    } else {
      legStatus = 'lost'
    }

    const { error: updateError } = await supabase
      .from('parlay_legs')
      .update({ status: legStatus, updated_at: new Date().toISOString() })
      .eq('id', leg.id)

    if (updateError) {
      logger.error({ updateError, legId: leg.id }, 'Failed to update stuck parlay leg')
    }
  }

  // Settle affected parlays
  const parlayIds = [...new Set(stuckLegs.map((l) => l.parlay_id))]
  for (const parlayId of parlayIds) {
    try {
      await trySettleParlay(parlayId)
    } catch (err) {
      logger.error({ err, parlayId }, 'Failed to settle parlay from cleanup job')
    }
  }

  logger.info({ legsFixed: stuckLegs.length, parlaysChecked: parlayIds.length }, 'Stuck parlay cleanup complete')
}
