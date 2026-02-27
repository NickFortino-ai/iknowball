import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { getAllCrownHolders } from '../services/leaderboardService.js'

// Map crown holder display names to DB scope values
const SCOPE_MAP = {
  'I KNOW BALL': 'global',
  'Props': 'props',
  'Parlays': 'parlays',
}

function toScope(crownKey) {
  return SCOPE_MAP[crownKey] || crownKey
}

export async function snapshotCrowns() {
  logger.info('Starting daily crown snapshot')

  const holders = await getAllCrownHolders()

  if (!holders || Object.keys(holders).length === 0) {
    logger.info('No crown holders found, skipping snapshot')
    return
  }

  const today = new Date()
  const snapshotDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const rows = Object.entries(holders).map(([crownKey, user]) => ({
    scope: toScope(crownKey),
    user_id: user.id,
    snapshot_date: snapshotDate,
  }))

  const { error } = await supabase
    .from('crown_snapshots')
    .upsert(rows, { onConflict: 'scope,snapshot_date' })

  if (error) {
    logger.error({ error }, 'Failed to insert crown snapshots')
    return
  }

  logger.info({ count: rows.length, date: snapshotDate }, 'Daily crown snapshot complete')
}
