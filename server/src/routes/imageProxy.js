/**
 * Image proxy — fetches a remote image and streams it back to the client.
 *
 * Use case: the Hot Take composer accepts drag-and-drop from other browser
 * tabs. When the source is cross-origin (almost always), the client can't
 * fetch the bytes directly because of CORS. The composer falls back to
 * calling this proxy server-side, which has no CORS restriction.
 *
 * Safety:
 *  - requireAuth: not public; only signed-in users
 *  - SSRF guards: only http(s) urls, blocks private/internal IPs
 *  - content-type validated as image/*
 *  - size cap (6 MB — slightly above the client-side 5 MB cap)
 *  - 10s timeout
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

const FETCH_TIMEOUT_MS = 10_000
const MAX_BYTES = 6 * 1024 * 1024

function isPrivateUrl(urlStr) {
  try {
    const parsed = new URL(urlStr)
    const hostname = parsed.hostname
    if (['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(hostname)) return true
    const parts = hostname.split('.')
    if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
      const [a, b] = parts.map(Number)
      if (a === 10) return true
      if (a === 172 && b >= 16 && b <= 31) return true
      if (a === 192 && b === 168) return true
      if (a === 169 && b === 254) return true // cloud metadata
    }
    return false
  } catch {
    return true
  }
}

router.get('/', requireAuth, async (req, res) => {
  const url = String(req.query.url || '').trim()
  if (!url) return res.status(400).json({ error: 'url query param required' })
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'only http(s) urls supported' })
  if (isPrivateUrl(url)) return res.status(400).json({ error: 'url blocked' })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'IKB-ImageProxy/1.0' },
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timeoutId)
    if (!upstream.ok) return res.status(502).json({ error: `upstream ${upstream.status}` })

    const contentType = upstream.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) return res.status(400).json({ error: 'not an image' })

    const buf = await upstream.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) return res.status(413).json({ error: 'image too large' })

    res.set('Content-Type', contentType)
    res.set('Cache-Control', 'private, max-age=300')
    return res.send(Buffer.from(buf))
  } catch (err) {
    clearTimeout(timeoutId)
    return res.status(500).json({ error: err.name === 'AbortError' ? 'timeout' : (err.message || 'fetch failed') })
  }
})

export default router
