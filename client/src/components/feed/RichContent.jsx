import { useState } from 'react'
import { segmentContent, displayUrl } from '../../lib/urlUtils'
import { parseEmbedSource } from '../../lib/embedParser'
import ImageLightbox from './ImageLightbox'
import YouTubeEmbed from './YouTubeEmbed'

const IMAGE_EXT_REGEX = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i

function normalizeUrl(url) {
  return url.startsWith('http') ? url : `https://${url}`
}

// hideEmbeddedUrl: drop a URL from the TEXT when the surrounding card is
// already rendering it as a video, so the raw link doesn't sit above its own
// embed. Scoped to YouTube on purpose — that's decidable client-side from the
// URL alone, and YouTubeEmbed always renders something (iframe on web, a
// thumbnail card on native). A generic link preview can come back empty, and
// hiding the text for one of those would leave the post with neither a link
// nor a card.
export default function RichContent({ text, className, hideEmbeddedUrl = false }) {
  const segments = segmentContent(text).filter((seg) => !(
    hideEmbeddedUrl
    && seg.type === 'url'
    && parseEmbedSource(seg.value)?.provider === 'youtube'
  ))
  const [lightboxSrc, setLightboxSrc] = useState(null)

  return (
    <div className={`whitespace-pre-wrap ${className || ''}`}>
      {segments.map((seg, i) =>
        seg.type === 'youtube_embed' ? (
          <div key={i} className="mt-2 mb-1" onClick={(e) => e.stopPropagation()}>
            <YouTubeEmbed videoId={seg.videoId} />
          </div>
        ) : seg.type === 'url' && IMAGE_EXT_REGEX.test(seg.value) ? (
          <div key={i} className="mt-2 mb-1" onClick={(e) => { e.stopPropagation(); setLightboxSrc(normalizeUrl(seg.value)) }}>
            <img
              src={normalizeUrl(seg.value)}
              alt=""
              className="max-w-full rounded-lg cursor-pointer"
              loading="lazy"
            />
          </div>
        ) : seg.type === 'url' ? (
          <a
            key={i}
            href={normalizeUrl(seg.value)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {displayUrl(seg.value)}
          </a>
        ) : (
          <span key={i}>{seg.value}</span>
        )
      )}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  )
}
