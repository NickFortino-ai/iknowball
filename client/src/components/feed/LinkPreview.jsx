import { useState, useEffect, useRef } from 'react'
import { useLinkPreview } from '../../hooks/useLinkPreview'
import { displayUrl } from '../../lib/urlUtils'

function TweetEmbed({ tweetId, url }) {
  const containerRef = useRef(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!tweetId || !containerRef.current) return

    // Load Twitter widget.js if not already loaded
    function renderTweet() {
      if (window.twttr?.widgets) {
        containerRef.current.innerHTML = ''
        window.twttr.widgets
          .createTweet(tweetId, containerRef.current, {
            theme: 'dark',
            conversation: 'none',
            dnt: true,
          })
          .then(() => setLoaded(true))
          .catch(() => setLoaded(false))
      }
    }

    if (window.twttr?.widgets) {
      renderTweet()
    } else {
      // Load the script once
      if (!document.getElementById('twitter-wjs')) {
        const script = document.createElement('script')
        script.id = 'twitter-wjs'
        script.src = 'https://platform.twitter.com/widgets.js'
        script.async = true
        script.onload = () => {
          // widgets.js sets window.twttr after load, but needs a tick
          const check = setInterval(() => {
            if (window.twttr?.widgets) {
              clearInterval(check)
              renderTweet()
            }
          }, 100)
          setTimeout(() => clearInterval(check), 5000)
        }
        document.head.appendChild(script)
      } else {
        // Script tag exists but hasn't loaded yet
        const check = setInterval(() => {
          if (window.twttr?.widgets) {
            clearInterval(check)
            renderTweet()
          }
        }, 100)
        setTimeout(() => clearInterval(check), 5000)
      }
    }
  }, [tweetId])

  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      <div ref={containerRef} className="max-w-full [&>*]:!m-0" />
      {!loaded && (
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

export default function LinkPreview({ url }) {
  const { data, isLoading } = useLinkPreview(url)
  const [imgError, setImgError] = useState(false)

  if (isLoading) {
    return <div className="mt-2 h-20 bg-bg-secondary rounded-lg animate-pulse" />
  }

  if (!data || (!data.title && !data.youtubeVideoId && !data.tweetId)) return null

  // Tweet embed
  if (data.tweetId) {
    return <TweetEmbed tweetId={data.tweetId} url={url} />
  }

  // YouTube embed
  if (data.youtubeVideoId) {
    const isShort = /\/shorts\//.test(url)
    return (
      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
        <div
          className={`relative rounded-lg overflow-hidden ${isShort ? 'max-w-[280px]' : 'w-full'}`}
          style={{ paddingBottom: isShort ? '177.78%' : '56.25%' }}
        >
          <iframe
            src={`https://www.youtube.com/embed/${data.youtubeVideoId}?autoplay=1&mute=1`}
            title={data.title || 'YouTube video'}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
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
