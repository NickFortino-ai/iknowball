import { useState } from 'react'
import { useLinkPreview } from '../../hooks/useLinkPreview'
import { displayUrl } from '../../lib/urlUtils'

export default function LinkPreview({ url }) {
  const { data, isLoading } = useLinkPreview(url)
  const [imgError, setImgError] = useState(false)

  if (isLoading) {
    return <div className="mt-2 h-20 bg-bg-secondary rounded-lg animate-pulse" />
  }

  if (!data || (!data.title && !data.youtubeVideoId)) return null

  // YouTube embed
  if (data.youtubeVideoId) {
    return (
      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
        <div className="relative w-full rounded-lg overflow-hidden" style={{ paddingBottom: '56.25%' }}>
          <iframe
            src={`https://www.youtube.com/embed/${data.youtubeVideoId}`}
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
      className="mt-2 block border border-border rounded-lg overflow-hidden bg-bg-card hover:bg-bg-card-hover transition-colors"
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
