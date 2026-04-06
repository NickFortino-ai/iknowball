import { useState, useRef, useLayoutEffect } from 'react'

// Renders text with a max of `lines` lines. If the text overflows,
// shows "Show more" / "Show less" toggle.
export default function TruncatedText({ children, lines = 5, className = '' }) {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Temporarily remove clamp to measure true height
    const prevDisplay = el.style.webkitLineClamp
    el.style.webkitLineClamp = 'unset'
    el.style.display = 'block'
    const fullHeight = el.scrollHeight
    el.style.display = '-webkit-box'
    el.style.webkitLineClamp = String(lines)
    const clampedHeight = el.clientHeight
    setOverflowing(fullHeight > clampedHeight + 2)
    el.style.webkitLineClamp = prevDisplay
  }, [children, lines])

  return (
    <div>
      <div
        ref={ref}
        className={className}
        style={{
          display: expanded ? 'block' : '-webkit-box',
          WebkitLineClamp: expanded ? 'unset' : lines,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
        }}
      >
        {children}
      </div>
      {overflowing && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
          className="text-xs text-accent hover:text-accent-hover mt-1 font-semibold"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
