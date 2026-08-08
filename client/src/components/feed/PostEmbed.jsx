import { useEffect, useRef } from 'react'
import YouTubeEmbed from './YouTubeEmbed'

// Renders a YouTube video or X (Twitter) post from the structured
// (provider, refId) tuple stored on hot_takes. We never render
// user-supplied HTML — the iframe / blockquote is reconstructed from
// scratch from provider-specific templates the server can't influence.
//
// YouTube: delegated to <YouTubeEmbed>, which iframe-embeds on web and
// falls back to a tap-to-open thumbnail on Capacitor (the WebView's
// capacitor://localhost origin is rejected by YouTube's player config
// no matter which embed domain we pick — Error 153).
//
// X requires their widgets.js script which we lazy-load exactly once
// and call widgets.load() on any newly-mounted blockquote.

let twitterScriptPromise = null
function loadTwitterScript() {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (twitterScriptPromise) return twitterScriptPromise
  twitterScriptPromise = new Promise((resolve) => {
    if (window.twttr?.widgets) return resolve(window.twttr)
    const s = document.createElement('script')
    s.src = 'https://platform.twitter.com/widgets.js'
    s.async = true
    s.onload = () => resolve(window.twttr)
    s.onerror = () => resolve(null)
    document.body.appendChild(s)
  })
  return twitterScriptPromise
}

export default function PostEmbed({ provider, refId }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (provider !== 'x' || !refId) return
    let cancelled = false
    loadTwitterScript().then((twttr) => {
      if (cancelled || !containerRef.current) return
      twttr?.widgets?.load?.(containerRef.current)
    })
    return () => { cancelled = true }
  }, [provider, refId])

  if (!provider || !refId) return null

  if (provider === 'youtube') {
    return (
      <div className="mt-2">
        <YouTubeEmbed videoId={refId} />
      </div>
    )
  }

  if (provider === 'x') {
    return (
      <div ref={containerRef} className="mt-2 flex justify-center">
        <blockquote className="twitter-tweet" data-theme="dark" data-dnt="true">
          <a href={`https://x.com/i/status/${refId}`}>View on X</a>
        </blockquote>
      </div>
    )
  }

  return null
}
