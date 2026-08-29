import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'

const router = Router()

const CACHE_TTL_DAYS = 7
const FETCH_TIMEOUT_MS = 5000
const MAX_BODY_BYTES = 100 * 1024

// Private/reserved IP ranges for SSRF protection
function isPrivateUrl(urlStr) {
  try {
    const parsed = new URL(urlStr)
    const hostname = parsed.hostname
    if (['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(hostname)) return true
    // Check private IP ranges
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

function extractYoutubeVideoId(urlStr) {
  try {
    const parsed = new URL(urlStr)
    const host = parsed.hostname.replace('www.', '')
    if (host === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v') || null
      }
      const shortMatch = parsed.pathname.match(/^\/(shorts|embed)\/([^/?]+)/)
      if (shortMatch) return shortMatch[2]
    }
    return null
  } catch {
    return null
  }
}

function extractTweetId(urlStr) {
  try {
    const parsed = new URL(urlStr)
    const host = parsed.hostname.replace('www.', '')
    if (host === 'twitter.com' || host === 'x.com') {
      const match = parsed.pathname.match(/\/\w+\/status\/(\d+)/)
      if (match) return match[1]
    }
    return null
  } catch {
    return null
  }
}

// OG content attributes arrive HTML-escaped, and these values are rendered
// as TEXT, so without decoding a card reads:
//   NFL on Instagram: &quot;running through tacklers&quot; ... &#064;NFLPlus
// Affects any site whose title contains quotes, apostrophes or ampersands —
// Instagram just makes it obvious because it puts the caption in the title.
//
// Hand-rolled rather than adding a dependency: this only ever runs over a
// title/description/site_name we are about to render as plain text, and the
// named set below covers what actually shows up in OG tags. Numeric forms
// (&#64; and &#x40;) cover the rest.
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '\u2018', rsquo: '\u2019',
  ldquo: '\u201C', rdquo: '\u201D', middot: '·', bull: '•', trade: '™',
  reg: '\u00AE', copy: '\u00A9', deg: '°',
}

function decodeEntities(str) {
  if (!str || !str.includes('&')) return str
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const n = parseInt(hex, 16)
      return Number.isFinite(n) ? String.fromCodePoint(n) : _
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const n = parseInt(dec, 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : _
    })
    // &amp; last so "&amp;quot;" doesn't become a live quote entity.
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
}

function parseOgTags(html, baseUrl) {
  const meta = {}
  // Match og: meta tags
  const ogRegex = /<meta[^>]+property=["']og:(\w+)["'][^>]+content=["']([^"']*?)["'][^>]*>/gi
  const ogRegex2 = /<meta[^>]+content=["']([^"']*?)["'][^>]+property=["']og:(\w+)["'][^>]*>/gi
  let match
  while ((match = ogRegex.exec(html)) !== null) {
    meta[match[1]] = decodeEntities(match[2])
  }
  while ((match = ogRegex2.exec(html)) !== null) {
    meta[match[2]] = decodeEntities(match[1])
  }

  // Fallback to <title> tag
  if (!meta.title) {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    if (titleMatch) meta.title = decodeEntities(titleMatch[1].trim())
  }

  // Resolve relative image URLs
  if (meta.image && !meta.image.startsWith('http')) {
    try {
      meta.image = new URL(meta.image, baseUrl).href
    } catch {
      // leave as-is
    }
  }

  return meta
}

// GET /api/link-preview?url=<encoded-url>
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const url = req.query.url
    if (!url) return res.status(400).json({ error: 'url parameter required' })

    // Validate URL
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      return res.status(400).json({ error: 'Invalid URL' })
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http/https URLs allowed' })
    }
    if (isPrivateUrl(url)) {
      return res.status(400).json({ error: 'URL not allowed' })
    }

    // Check cache
    const cacheExpiry = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data: cached } = await supabase
      .from('link_previews')
      .select('*')
      .eq('url', url)
      .gt('fetched_at', cacheExpiry)
      .maybeSingle()

    if (cached) {
      // Tweet/YouTube IDs are derivable from the URL itself — re-extract
      // on cache hit so rows that were stored with null IDs (cached before
      // the x.com handler existed, or before YouTube extraction was wired)
      // still render the embed instead of falling through to "no data".
      const tweetId = cached.tweet_id || extractTweetId(cached.url)
      const youtubeVideoId = cached.youtube_video_id || extractYoutubeVideoId(cached.url)
      return res.json({
        url: cached.url,
        title: cached.title,
        description: cached.description,
        image: cached.image,
        siteName: cached.site_name,
        youtubeVideoId,
        tweetId,
      })
    }

    // Extract YouTube video ID or tweet ID
    const youtubeVideoId = extractYoutubeVideoId(url)
    const tweetId = extractTweetId(url)

    // Fetch the URL
    let html = ''
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'IKnowBall/1.0' },
        redirect: 'follow',
      })
      clearTimeout(timeout)

      if (response.ok) {
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
          // Read up to MAX_BODY_BYTES
          const reader = response.body.getReader()
          const chunks = []
          let totalSize = 0
          while (totalSize < MAX_BODY_BYTES) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
            totalSize += value.length
          }
          reader.cancel()
          html = new TextDecoder().decode(Buffer.concat(chunks).slice(0, MAX_BODY_BYTES))
        }
      }
    } catch {
      // Fetch failed — still return YouTube ID if we have it
    }

    // Parse OG tags
    const og = parseOgTags(html, url)

    const result = {
      url,
      title: og.title || null,
      description: og.description || null,
      image: og.image || null,
      siteName: og.site_name || null,
      youtubeVideoId,
      tweetId,
    }

    // Upsert into cache
    await supabase.from('link_previews').upsert(
      {
        url,
        title: result.title,
        description: result.description,
        image: result.image,
        site_name: result.siteName,
        youtube_video_id: result.youtubeVideoId,
        tweet_id: result.tweetId,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'url' }
    )

    res.json(result)
  } catch (err) {
    next(err)
  }
})

export default router
