const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g

export function extractFirstUrl(text) {
  if (!text) return null
  const match = text.match(URL_REGEX)
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
  const segments = []
  let lastIndex = 0
  const regex = new RegExp(URL_REGEX.source, 'g')
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'url', value: match[0] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return segments
}
