import { segmentContent, displayUrl } from '../../lib/urlUtils'

export default function RichContent({ text, className }) {
  const segments = segmentContent(text)

  return (
    <div className={className}>
      {segments.map((seg, i) =>
        seg.type === 'url' ? (
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
