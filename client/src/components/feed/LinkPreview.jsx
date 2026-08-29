import { useState, useEffect, useRef } from 'react'
import { useLinkPreview } from '../../hooks/useLinkPreview'
import { displayUrl } from '../../lib/urlUtils'
import YouTubeEmbed from './YouTubeEmbed'
import InstagramEmbed from './InstagramEmbed'

function TweetEmbed({ tweetId, url }) {
  const containerRef = useRef(null)
  // Track which tweetId we've successfully kicked off a render for. Without
  // this, a race between renderTweet calls (script-load callback + polling
  // interval + remounts) could call createTweet twice into the same
  // container, appending two iframes for one tweet.
  const renderedForRef = useRef(null)
  // Track active intervals so cleanup on unmount / tweetId change kills
  // any in-flight polling that would otherwise fire renderTweet later.
  const intervalRef = useRef(null)
  const [status, setStatus] = useState('pending')

  useEffect(() => {
    if (!tweetId || !containerRef.current) return
    let cancelled = false

    function renderTweet() {
      if (cancelled) return
      if (!window.twttr?.widgets) return
      if (renderedForRef.current === tweetId) return
      renderedForRef.current = tweetId
      containerRef.current.innerHTML = ''
      window.twttr.widgets
        .createTweet(tweetId, containerRef.current, {
          theme: 'dark',
          conversation: 'none',
          dnt: true,
        })
        .then((el) => { if (!cancelled) setStatus(el ? 'loaded' : 'failed') })
        .catch(() => { if (!cancelled) setStatus('failed') })
    }

    function pollForWidget() {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = setInterval(() => {
        if (window.twttr?.widgets) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
          renderTweet()
        }
      }, 100)
      setTimeout(() => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }, 5000)
    }

    if (window.twttr?.widgets) {
      renderTweet()
    } else if (!document.getElementById('twitter-wjs')) {
      const script = document.createElement('script')
      script.id = 'twitter-wjs'
      script.src = 'https://platform.twitter.com/widgets.js'
      script.async = true
      script.onload = pollForWidget
      document.head.appendChild(script)
    } else {
      pollForWidget()
    }

    return () => {
      cancelled = true
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [tweetId])

  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      <div ref={containerRef} className="max-w-full [&>*]:!m-0" />
      {status === 'failed' && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block border border-text-primary/20 rounded-lg px-3 py-2.5 bg-bg-primary hover:bg-text-primary/5 transition-colors"
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-0.5">X (Twitter)</div>
          <div className="text-sm text-accent">View post &rarr;</div>
          <div className="text-[10px] text-text-muted mt-1">{displayUrl(url)}</div>
        </a>
      )}
    </div>
  )
}

// onRendered fires once, when this actually puts something on screen. Lets a
// caller hide the raw URL from the post text only AFTER a card exists, so a
// link whose metadata comes back empty is never left with neither.
export default function LinkPreview({ url, onRendered }) {
  const { data, isLoading } = useLinkPreview(url)
  const [imgError, setImgError] = useState(false)

  const willRender = !!data && !!(data.title || data.youtubeVideoId || data.tweetId || data.instagramId)
  // Ref-guarded so an inline arrow from the parent can't retrigger this on
  // every render, and so it reports once per url rather than once per paint.
  const reportedRef = useRef(null)
  useEffect(() => {
    if (willRender && reportedRef.current !== url) {
      reportedRef.current = url
      onRendered?.(url)
    }
  }, [willRender, url, onRendered])

  if (isLoading) {
    return <div className="mt-2 h-20 bg-bg-secondary rounded-lg animate-pulse" />
  }

  if (!data || (!data.title && !data.youtubeVideoId && !data.tweetId && !data.instagramId)) return null

  // Instagram embed. Falls through to the generic OG card below if the id
  // is missing — the card still has the thumbnail and caption, so a change
  // on Instagram's side degrades rather than breaks.
  if (data.instagramId) {
    return <InstagramEmbed instagramId={data.instagramId} url={url} />
  }

  // Tweet embed
  if (data.tweetId) {
    return <TweetEmbed tweetId={data.tweetId} url={url} />
  }

  // YouTube: <YouTubeEmbed /> handles the web-vs-native split — iframe
  // on web (which passes YouTube's origin check) and tap-to-open
  // thumbnail on Capacitor (where capacitor://localhost is rejected
  // with Error 153).
  if (data.youtubeVideoId) {
    const isShort = /\/shorts\//.test(url)
    return (
      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
        <YouTubeEmbed videoId={data.youtubeVideoId} title={data.title} isShort={isShort} />
        {data.title && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-1.5 text-xs text-text-secondary hover:text-accent transition-colors line-clamp-1"
            onClick={(e) => e.stopPropagation()}
          >
            {data.title}
          </a>
        )}
      </div>
    )
  }

  // Article / generic OG card
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block border border-text-primary/20 rounded-lg overflow-hidden bg-bg-primary hover:bg-text-primary/5 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {data.image && !imgError && (
        <img
          src={data.image}
          alt=""
          className="w-full h-40 object-cover"
          onError={() => setImgError(true)}
        />
      )}
      <div className="px-3 py-2.5">
        {data.siteName && (
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-0.5">
            {data.siteName}
          </div>
        )}
        <div className="text-sm font-semibold text-text-primary line-clamp-2">
          {data.title}
        </div>
        {data.description && (
          <div className="text-xs text-text-muted mt-0.5 line-clamp-2">
            {data.description}
          </div>
        )}
        <div className="text-[10px] text-text-muted mt-1">
          {displayUrl(url)}
        </div>
      </div>
    </a>
  )
}
