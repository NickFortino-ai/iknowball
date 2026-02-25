import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

export async function snapshotRanks() {
  logger.info('Starting daily rank snapshot')

  // Get global leaderboard ordered by points
  const { data: users, error } = await supabase
    .from('users')
    .select('id, total_points')
    .order('total_points', { ascending: false })

  if (error) {
    logger.error({ error }, 'Failed to fetch users for rank snapshot')
    return
  }

  if (!users?.length) return

  const today = new Date()
  const snapshotDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const rows = users.map((u, i) => ({
    user_id: u.id,
    scope: 'global',
    rank: i + 1,
    total_points: u.total_points || 0,
    snapshot_date: snapshotDate,
  }))

  const { error: insertError } = await supabase
    .from('leaderboard_rank_snapshots')
    .upsert(rows, { onConflict: 'user_id,scope,snapshot_date' })

  if (insertError) {
    logger.error({ insertError }, 'Failed to insert rank snapshots')
    return
  }

  logger.info({ count: rows.length, date: snapshotDate }, 'Daily rank snapshot complete')
}
