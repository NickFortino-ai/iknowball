const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g
const EMBED_REGEX = /<iframe[^>]+src=["']https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)[^"']*["'][^>]*>(?:<\/iframe>)?/g

export function extractFirstUrl(text) {
  if (!text) return null
  // Skip URLs that are inside an iframe embed code
  const withoutEmbeds = text.replace(new RegExp(EMBED_REGEX.source, 'g'), '')
  const match = withoutEmbeds.match(URL_REGEX)
  return match ? match[0] : null
}

export function displayUrl(url) {
  try {
    const parsed = new URL(url)
    let host = parsed.hostname.replace(/^www\./, '')
    let path = parsed.pathname
    if (path === '/') path = ''
    if (path.length > 20) path = path.slice(0, 20) + '...'
    return host + path
  } catch {
    return url
  }
}

export function segmentContent(text) {
  if (!text) return []

  // Combined regex: match embed codes OR URLs
  const combined = new RegExp(`(${EMBED_REGEX.source})|(${URL_REGEX.source})`, 'g')
  const segments = []
  let lastIndex = 0
  let match

  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    if (match[1]) {
      // Embed code matched — match[2] is the video ID from the embed capture group
      segments.push({ type: 'youtube_embed', videoId: match[2] })
    } else {
      segments.push({ type: 'url', value: match[0] })
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return segments
}
