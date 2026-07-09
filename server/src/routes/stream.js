import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { createDirectUploadURL, hlsUrlFor } from '../services/cloudflareStreamService.js'
import { supabase } from '../config/supabase.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4'

const router = Router()

/**
 * Hand the client a one-time upload URL from Cloudflare Stream. The client
 * POSTs the video directly to that URL — the file never touches our server,
 * which sidesteps every "iPhone .mov gets rejected by our uploader" edge
 * case since Cloudflare handles the transcoding.
 *
 * Returns:
 *   uploadURL — where the client uploads to
 *   uid       — the Stream asset ID (saved on the resulting hot take)
 *   hlsUrl    — playback manifest URL (also saved so the render code
 *               doesn't need to derive it)
 */
router.post('/direct-upload', requireAuth, async (req, res) => {
  try {
    const meta = { userId: req.user.id }
    const maxDurationSeconds = Math.min(
      Math.max(parseInt(req.body?.maxDurationSeconds || '90', 10), 5),
      600, // 10 min hard cap to keep abuse potential low
    )
    const { uploadURL, uid } = await createDirectUploadURL({ maxDurationSeconds, meta })
    res.json({ uploadURL, uid, hlsUrl: hlsUrlFor(uid) })
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

/**
 * Client-driven readiness check. The uploader's post card polls this while
 * their video is transcoding; each hit does a live Cloudflare lookup and
 * flips stream_ready_at as soon as the asset is ready — no waiting for
 * the 60s cron sweep. The cron stays as a background safety net for cases
 * where the uploader closes the app.
 *
 * Auth-gated to the hot take's author so anyone can't probe arbitrary
 * UIDs (Cloudflare rate limits us globally, not per-user).
 */
router.post('/check-ready/:uid', requireAuth, async (req, res) => {
  const uid = req.params.uid
  if (!uid) return res.status(400).json({ error: 'uid required' })
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_STREAM_API_TOKEN) {
    return res.status(503).json({ error: 'Cloudflare Stream not configured' })
  }

  const { data: hotTake } = await supabase
    .from('hot_takes')
    .select('id, user_id, stream_ready_at')
    .eq('stream_video_uid', uid)
    .maybeSingle()

  if (!hotTake || hotTake.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Not found' })
  }
  if (hotTake.stream_ready_at) {
    return res.json({ ready: true })
  }

  try {
    const cfRes = await fetch(`${CLOUDFLARE_API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`, {
      headers: { Authorization: `Bearer ${env.CLOUDFLARE_STREAM_API_TOKEN}` },
    })
    if (!cfRes.ok) {
      return res.json({ ready: false })
    }
    const body = await cfRes.json()
    if (body?.result?.readyToStream) {
      await supabase
        .from('hot_takes')
        .update({ stream_ready_at: new Date().toISOString() })
        .eq('id', hotTake.id)
      return res.json({ ready: true })
    }
    return res.json({ ready: false })
  } catch (err) {
    logger.error({ err, uid }, 'check-ready threw')
    return res.status(500).json({ error: 'Check failed' })
  }
})

export default router
