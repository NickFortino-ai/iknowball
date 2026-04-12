import { useState, useRef, useEffect, useCallback } from 'react'

export default function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const tooltipRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Clamp tooltip to viewport edges
  const clampToViewport = useCallback((el) => {
    if (!el) return
    tooltipRef.current = el
    const rect = el.getBoundingClientRect()
    if (rect.left < 8) {
      el.style.transform = 'none'
      el.style.left = `${-rect.left + 8}px`
    } else if (rect.right > window.innerWidth - 8) {
      el.style.transform = 'none'
      el.style.left = `${-(rect.right - window.innerWidth + 8)}px`
    }
  }, [])

  return (
    <span className="relative inline-flex items-center" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-text-muted hover:text-text-secondary transition-colors ml-1.5 focus:outline-none"
        aria-label="More info"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      {open && (
        <div
          ref={clampToViewport}
          className="absolute left-1/2 -translate-x-1/2 top-full mt-3 w-80 max-w-[calc(100vw-1rem)] bg-bg-card/85 backdrop-blur-md border border-border rounded-xl shadow-lg z-[100] px-4 py-3 text-sm text-text-secondary leading-relaxed font-sans font-normal tracking-normal normal-case text-left"
        >
          {text}
        </div>
      )}
    </span>
  )
}
