// Parse a user-supplied embed source (either a raw URL or a full embed
// HTML snippet from YouTube / X) into a safe { provider, refId, url }
// tuple. Rejects anything else so we never store — and never render —
// user-controlled HTML. All rendering happens from provider-specific
// templates in the client.
//
// Supported providers:
//   youtube: video URLs (watch, youtu.be short, /embed), and iframe
//            snippets whose src matches those patterns
//   x:       twitter.com/x.com status URLs, and blockquote snippets with
//            data-tweet-id or a status URL inside them

const YOUTUBE_ID_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/i
const X_STATUS_RE = /(?:x\.com|twitter\.com)\/[^/\s"']+\/status\/(\d{5,25})/i
// Twitter's blockquote embeds sometimes stash the id here — fallback.
const X_DATA_TWEET_ID_RE = /data-tweet-id\s*=\s*["'](\d{5,25})["']/i

export function parseEmbedSource(source) {
  if (!source || typeof source !== 'string') return null
  const trimmed = source.trim()
  if (!trimmed) return null

  const yt = trimmed.match(YOUTUBE_ID_RE)
  if (yt) {
    const refId = yt[1]
    return {
      provider: 'youtube',
      refId,
      url: `https://www.youtube.com/watch?v=${refId}`,
    }
  }

  const xStatus = trimmed.match(X_STATUS_RE)
  if (xStatus) {
    const refId = xStatus[1]
    return {
      provider: 'x',
      refId,
      url: `https://x.com/i/status/${refId}`,
    }
  }

  const xDataId = trimmed.match(X_DATA_TWEET_ID_RE)
  if (xDataId) {
    const refId = xDataId[1]
    return {
      provider: 'x',
      refId,
      url: `https://x.com/i/status/${refId}`,
    }
  }

  return null
}
