import { useEffect, useRef, useState } from 'react'

// Instagram post / reel embed.
//
// Unlike YouTube, Instagram's /embed endpoint imposes no framing
// restrictions — no X-Frame-Options, no frame-ancestors CSP — and needs no
// API token for public posts. It also does no parent-origin verification,
// which is the thing that makes YouTube unembeddable inside Capacitor's
// capacitor://localhost webview. So this should behave the same in the
// native app as on web.
//
// Height is the awkward part: the iframe holds a header, the media and a
// footer, so a fixed aspect ratio clips it. Instagram's own embed.js sizes
// these by listening for a postMessage the iframe emits — we listen for the
// same message rather than pulling in their script, since the app already
// carries Twitter's widgets.js and one third-party script is enough.
const DEFAULT_HEIGHT = 540
const MIN_HEIGHT = 240
const MAX_HEIGHT = 1200

export default function InstagramEmbed({ instagramId, url }) {
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const frameRef = useRef(null)

  useEffect(() => {
    function onMessage(e) {
      if (!/instagram\.com$/.test(new URL(e.origin).hostname.replace('www.', ''))) return
      try {
        const payload = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        const h = payload?.details?.height
        if (typeof h === 'number' && Number.isFinite(h)) {
          setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(h))))
        }
      } catch { /* not a message we understand — keep the default height */ }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  if (!instagramId) return null

  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      <div className="rounded-lg overflow-hidden border border-text-primary/15 bg-black">
        <iframe
          ref={frameRef}
          src={`https://www.instagram.com/reel/${instagramId}/embed`}
          title="Instagram post"
          className="w-full block"
          style={{ height }}
          loading="lazy"
          scrolling="no"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-1.5 text-xs text-text-secondary hover:text-accent transition-colors"
        >
          View on Instagram
        </a>
      )}
    </div>
  )
}
