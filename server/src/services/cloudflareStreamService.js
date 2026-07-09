import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4'

/**
 * Request a one-time direct-upload URL from Cloudflare Stream. The client
 * uploads directly to that URL (bypassing our server), then we get back a
 * Stream UID that identifies the resulting asset. Cloudflare handles
 * transcoding — .mov, .mp4, .webm, .mkv all come in and get normalized to
 * adaptive-bitrate HLS on the way out.
 *
 * See: https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
 */
export async function createDirectUploadURL({ maxDurationSeconds = 90, meta = {} } = {}) {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_STREAM_API_TOKEN) {
    const err = new Error('Cloudflare Stream is not configured on the server')
    err.status = 503
    throw err
  }

  const url = `${CLOUDFLARE_API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream/direct_upload`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_STREAM_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      maxDurationSeconds,
      // Anyone can watch — hot takes are public. requireSignedURLs would
      // gate playback behind server-generated tokens; not needed for a
      // public social feed.
      requireSignedURLs: false,
      meta,
    }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.success) {
    logger.error({ status: res.status, body }, 'Cloudflare Stream direct_upload failed')
    const err = new Error(body.errors?.[0]?.message || 'Cloudflare Stream request failed')
    err.status = res.status || 500
    throw err
  }

  const { uploadURL, uid } = body.result || {}
  if (!uploadURL || !uid) {
    logger.error({ body }, 'Cloudflare Stream returned malformed direct_upload result')
    const err = new Error('Malformed Cloudflare Stream response')
    err.status = 500
    throw err
  }

  return { uploadURL, uid }
}

/**
 * Build the HLS manifest URL for a Cloudflare Stream asset. Playback in
 * <video> uses this URL directly on iOS (native HLS support) or through
 * hls.js elsewhere.
 */
export function hlsUrlFor(uid) {
  if (!env.CLOUDFLARE_STREAM_SUBDOMAIN) return null
  return `https://${env.CLOUDFLARE_STREAM_SUBDOMAIN}/${uid}/manifest/video.m3u8`
}

/**
 * Delete a Stream asset — call from admin content moderation when a hot
 * take is removed so we're not paying to store deleted content.
 */
export async function deleteStreamAsset(uid) {
  if (!uid) return
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_STREAM_API_TOKEN) return
  try {
    const url = `${CLOUDFLARE_API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.CLOUDFLARE_STREAM_API_TOKEN}` },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.warn({ uid, status: res.status, body }, 'Cloudflare Stream delete failed')
    }
  } catch (err) {
    logger.warn({ err, uid }, 'Cloudflare Stream delete threw')
  }
}
