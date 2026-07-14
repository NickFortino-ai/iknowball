// Client mirror of server/src/utils/embedParser.js — used to render an
// inline preview in the composer before submit. The server re-parses on
// insert (authoritative), so an out-of-sync client can never store an
// unrecognized provider — worst case is the preview shows nothing.

const YOUTUBE_ID_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/i
const X_STATUS_RE = /(?:x\.com|twitter\.com)\/[^/\s"']+\/status\/(\d{5,25})/i
const X_DATA_TWEET_ID_RE = /data-tweet-id\s*=\s*["'](\d{5,25})["']/i

export function parseEmbedSource(source) {
  if (!source || typeof source !== 'string') return null
  const trimmed = source.trim()
  if (!trimmed) return null

  const yt = trimmed.match(YOUTUBE_ID_RE)
  if (yt) return { provider: 'youtube', refId: yt[1], url: `https://www.youtube.com/watch?v=${yt[1]}` }

  const xs = trimmed.match(X_STATUS_RE)
  if (xs) return { provider: 'x', refId: xs[1], url: `https://x.com/i/status/${xs[1]}` }

  const xd = trimmed.match(X_DATA_TWEET_ID_RE)
  if (xd) return { provider: 'x', refId: xd[1], url: `https://x.com/i/status/${xd[1]}` }

  return null
}
