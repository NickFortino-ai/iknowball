import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

export async function cleanupExpiredVideos() {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data: expired, error } = await supabase
    .from('hot_takes')
    .select('id, video_url')
    .not('video_url', 'is', null)
    .lt('created_at', fourteenDaysAgo)

  if (error) {
    logger.error({ error }, 'Failed to query expired videos')
    return
  }

  if (!expired?.length) {
    logger.info('No expired videos to clean up')
    return
  }

  let cleaned = 0
  for (const row of expired) {
    try {
      // Parse storage path from public URL
      // URL format: https://<project>.supabase.co/storage/v1/object/public/hot-take-videos/<userId>/<timestamp>.<ext>
      const url = new URL(row.video_url)
      const prefix = '/storage/v1/object/public/hot-take-videos/'
      const pathIndex = url.pathname.indexOf(prefix)
      if (pathIndex === -1) {
        logger.warn({ id: row.id, video_url: row.video_url }, 'Could not parse video storage path')
        continue
      }
      const storagePath = url.pathname.slice(pathIndex + prefix.length)

      const { error: deleteError } = await supabase.storage
        .from('hot-take-videos')
        .remove([storagePath])

      if (deleteError) {
        logger.error({ id: row.id, deleteError }, 'Failed to delete video from storage')
      }

      await supabase
        .from('hot_takes')
        .update({ video_url: null })
        .eq('id', row.id)

      cleaned++
    } catch (err) {
      logger.error({ id: row.id, err }, 'Error cleaning up expired video')
    }
  }

  logger.info({ cleaned, total: expired.length }, 'Video cleanup completed')
}
