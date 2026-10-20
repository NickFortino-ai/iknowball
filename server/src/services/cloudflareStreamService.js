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
 * Create a RESUMABLE (tus) upload and return the one-time endpoint to PATCH
 * chunks at.
 *
 * This exists because the basic direct upload above is a single form POST,
 * and Cloudflare caps those at 200MB — their limit, not our plan's. tus
 * raises it to 30GB and uploads in chunks, so a phone that loses signal
 * resumes instead of starting the whole file again.
 *
 * Three things differ from the basic call and all three are easy to get
 * wrong:
 *   - the endpoint is `/stream?direct_user=true`, NOT `/stream/direct_upload`
 *   - the options travel as base64 tus metadata headers, not a JSON body
 *   - the upload URL comes back in the `Location` RESPONSE HEADER, and the
 *     body is empty — reading `body.result.uploadURL` here returns undefined
 *
 * `Upload-Length` is required at creation time, so the client has to tell us
 * the exact byte count up front.
 *
 * See: https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
 */
export async function createTusUploadURL({ uploadLength, maxDurationSeconds = 180, meta = {} } = {}) {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_STREAM_API_TOKEN) {
    const err = new Error('Cloudflare Stream is not configured on the server')
    err.status = 503
    throw err
  }
  if (!Number.isFinite(uploadLength) || uploadLength <= 0) {
    const err = new Error('uploadLength (bytes) is required for a resumable upload')
    err.status = 400
    throw err
  }

  const b64 = (v) => Buffer.from(String(v)).toString('base64')
  // tus metadata is `key base64value` pairs, comma separated. Cloudflare
  // reads the same options the JSON body carries on the basic call.
  const uploadMetadata = [
    `maxdurationseconds ${b64(maxDurationSeconds)}`,
    `requiresignedurls ${b64('false')}`,
    ...Object.entries(meta).map(([k, v]) => `${k} ${b64(v)}`),
  ].join(',')

  const url = `${CLOUDFLARE_API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream?direct_user=true`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_STREAM_API_TOKEN}`,
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(Math.floor(uploadLength)),
      'Upload-Metadata': uploadMetadata,
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger.error({ status: res.status, body }, 'Cloudflare Stream tus create failed')
    const err = new Error('Cloudflare Stream request failed')
    err.status = res.status || 500
    throw err
  }

  const uploadURL = res.headers.get('Location')
  // Cloudflare sends the asset id as `stream-media-id`. It is the last path
  // segment of the Location too, so parse that as a fallback rather than
  // failing the upload over a header name we do not control.
  const uid = res.headers.get('stream-media-id')
    || (uploadURL ? uploadURL.split('?')[0].split('/').filter(Boolean).pop() : null)

  if (!uploadURL || !uid) {
    logger.error({ uploadURL, uid }, 'Cloudflare Stream tus create returned no Location/uid')
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
