import { useState } from 'react'
import { segmentContent, displayUrl } from '../../lib/urlUtils'
import ImageLightbox from './ImageLightbox'
import YouTubeEmbed from './YouTubeEmbed'

const IMAGE_EXT_REGEX = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i

function normalizeUrl(url) {
  return url.startsWith('http') ? url : `https://${url}`
}

export default function RichContent({ text, className }) {
  const segments = segmentContent(text)
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
