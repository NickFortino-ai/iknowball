import { segmentContent, displayUrl } from '../../lib/urlUtils'

export default function RichContent({ text, className }) {
  const segments = segmentContent(text)

  return (
    <div className={className}>
      {segments.map((seg, i) =>
        seg.type === 'youtube_embed' ? (
          <div key={i} className="mt-2 mb-1" onClick={(e) => e.stopPropagation()}>
            <div className="relative w-full rounded-lg overflow-hidden" style={{ paddingBottom: '56.25%' }}>
              <iframe
                src={`https://www.youtube.com/embed/${seg.videoId}?autoplay=1&mute=1`}
                title="YouTube video"
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
              />
            </div>
          </div>
        ) : seg.type === 'url' ? (
          <a
            key={i}
            href={seg.value}
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
    </div>
  )
}
