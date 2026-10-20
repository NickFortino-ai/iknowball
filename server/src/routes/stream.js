import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { createDirectUploadURL, createTusUploadURL, hlsUrlFor } from '../services/cloudflareStreamService.js'
import { supabase } from '../config/supabase.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4'

// Hard ceiling for a single video, server side.
//
// Cloudflare's tus protocol allows 30GB; this is deliberately far below it.
// The real brake on an abusive upload is the 180s duration cap — at 3
// minutes even iPhone 4K/60 (~50 Mbps) lands near 1.1GB, so 2GB clears any
// honest recording while keeping a 30GB one impossible.
//
// Keep in step with MAX_VIDEO_BYTES in client/src/hooks/useHotTakes.js and
// the figure quoted in TermsPage.jsx.
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024

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
 * Hand the client a RESUMABLE (tus) upload endpoint, for files past the
 * 200MB ceiling on the form-POST route above.
 *
 * `uploadLength` is the exact byte count — tus requires it at creation time,
 * so the client sends `file.size` and Cloudflare holds the slot for it.
 *
 * The ceiling here is the server's word on the matter. The client checks the
 * same number first so a user gets a sentence instead of a 400, but a client
 * is editable and this is not.
 */
router.post('/tus-upload', requireAuth, async (req, res) => {
  try {
    const uploadLength = parseInt(req.body?.uploadLength, 10)
    if (!Number.isFinite(uploadLength) || uploadLength <= 0) {
      return res.status(400).json({ error: 'uploadLength is required' })
    }
    if (uploadLength > MAX_UPLOAD_BYTES) {
      const gb = (MAX_UPLOAD_BYTES / (1024 ** 3)).toFixed(1)
      return res.status(400).json({ error: `Video exceeds the ${gb}GB limit` })
    }
    const meta = { userId: req.user.id }
    const maxDurationSeconds = Math.min(
      Math.max(parseInt(req.body?.maxDurationSeconds || '180', 10), 5),
      600,
    )
    const { uploadURL, uid } = await createTusUploadURL({ uploadLength, maxDurationSeconds, meta })
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
