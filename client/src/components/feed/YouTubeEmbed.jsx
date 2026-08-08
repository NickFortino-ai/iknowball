import { Capacitor } from '@capacitor/core'
import { openExternalUrl } from '../../lib/openExternalUrl'

// YouTube embed with a platform split:
//
// - Web: renders the standard IFrame embed. YouTube's IFrame API
//   verifies the parent window's origin — https://... passes, so the
//   player initializes normally.
//
// - Capacitor native (iOS/Android): the parent origin is
//   capacitor://localhost, which YouTube's player rejects at config
//   time with "Error 153: Video player configuration error." Fighting
//   the iframe with autoplay tweaks, youtube-nocookie swaps, and
//   playsinline all failed — the underlying problem is the origin
//   verification, not autoplay. Instead we render a rich thumbnail card
//   (hqdefault.jpg, no CORS) and open the video in the OS browser
//   (SFSafariViewController on iOS via openExternalUrl) on tap. Users
//   still get the video in-app, just via the platform's native player.
//
// Props:
//   videoId  — 11-char YouTube ID (required)
//   title    — optional string (a11y + preview label)
//   isShort  — bool, forces 9/16 aspect for /shorts/ links
export default function YouTubeEmbed({ videoId, title, isShort = false }) {
  if (!videoId) return null

  const isNative = typeof window !== 'undefined' && Capacitor?.isNativePlatform?.()

  const containerStyle = isShort
    ? { aspectRatio: '9/16' }
    : { paddingBottom: '56.25%' }
  const wrapperClass = isShort
    ? 'relative rounded-lg overflow-hidden max-w-[280px] mx-auto bg-black'
    : 'relative rounded-lg overflow-hidden w-full bg-black'

  if (isNative) {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
    const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); openExternalUrl(watchUrl) }}
        className={`${wrapperClass} group cursor-pointer`}
        style={containerStyle}
        aria-label={`Play ${title || 'YouTube video'}`}
      >
        <img
          src={thumbUrl}
          alt={title || 'YouTube thumbnail'}
          className={isShort ? 'w-full h-full object-cover' : 'absolute inset-0 w-full h-full object-cover'}
          loading="lazy"
        />
        {/* Play glyph overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-black/70 group-active:bg-black/85 flex items-center justify-center transition-colors">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
              <polygon points="6,4 20,12 6,20" />
            </svg>
          </div>
        </div>
        {/* YouTube mark bottom-right */}
        <div className="absolute bottom-2 right-2 text-white text-[10px] font-bold bg-black/60 px-1.5 py-0.5 rounded pointer-events-none">
          YouTube
        </div>
      </button>
    )
  }

  return (
    <div className={wrapperClass} style={containerStyle}>
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0`}
        title={title || 'YouTube video'}
        className={isShort ? 'w-full h-full border-0' : 'absolute inset-0 w-full h-full border-0'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
      />
    </div>
  )
}
