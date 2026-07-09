import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { createDirectUploadURL, hlsUrlFor } from '../services/cloudflareStreamService.js'

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

export default router
