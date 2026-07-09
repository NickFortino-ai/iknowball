import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { env } from '../config/env.js'

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4'

/**
 * Cron job: poll Cloudflare Stream for hot takes whose videos are still
 * transcoding. When Cloudflare reports readyToStream=true, mark the hot
 * take as ready (stream_ready_at = NOW()) so it becomes visible to the
 * public feed.
 *
 * Runs every 30s. Cloudflare's Stream API allows ~1200 requests/min per
 * token so as long as we have fewer than ~600 pending videos at a time
 * we're well under the limit; realistic queue is single-digit or low
 * double-digit at most.
 */
export async function checkStreamReadiness() {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_STREAM_API_TOKEN) {
    logger.debug('Cloudflare Stream not configured, skipping readiness check')
    return
  }

  const { data: pending, error } = await supabase
    .from('hot_takes')
    .select('id, stream_video_uid, created_at')
    .not('stream_video_uid', 'is', null)
    .is('stream_ready_at', null)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    logger.error({ err: error }, 'Failed to fetch pending Stream videos')
    return
  }
  if (!pending?.length) return

  let ready = 0
  let stillProcessing = 0
  let errored = 0

  for (const row of pending) {
    try {
      const res = await fetch(`${CLOUDFLARE_API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream/${row.stream_video_uid}`, {
        headers: { Authorization: `Bearer ${env.CLOUDFLARE_STREAM_API_TOKEN}` },
      })
      if (!res.ok) {
        // 404 typically means the upload URL was never consumed. If it's
        // been more than 30 min since we created the hot take, give up
        // and mark the row ready anyway so the uploader isn't stuck
        // watching a spinner forever — better to show a broken video
        // than to leave the post in limbo indefinitely.
        const ageMinutes = (Date.now() - new Date(row.created_at).getTime()) / 1000 / 60
        if (res.status === 404 && ageMinutes > 30) {
          logger.warn({ hotTakeId: row.id, uid: row.stream_video_uid, ageMinutes }, 'Stream asset never appeared after 30 min — flushing to ready state')
          await supabase
            .from('hot_takes')
            .update({ stream_ready_at: new Date().toISOString() })
            .eq('id', row.id)
        } else {
          errored++
        }
        continue
      }
      const body = await res.json()
      if (body?.result?.readyToStream) {
        await supabase
          .from('hot_takes')
          .update({ stream_ready_at: new Date().toISOString() })
          .eq('id', row.id)
        ready++
      } else {
        stillProcessing++
      }
    } catch (err) {
      logger.error({ err, hotTakeId: row.id, uid: row.stream_video_uid }, 'Stream readiness check threw')
      errored++
    }
  }

  if (ready > 0 || stillProcessing > 0 || errored > 0) {
    logger.info({ total: pending.length, ready, stillProcessing, errored }, 'Stream readiness sweep complete')
  }
}
