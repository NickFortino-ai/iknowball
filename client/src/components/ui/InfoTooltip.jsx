import { useState, useRef, useEffect } from 'react'

export default function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

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
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-72 bg-bg-card border border-border rounded-xl shadow-lg z-50 px-4 py-3 text-sm text-text-secondary leading-relaxed">
          {text}
        </div>
      )}
    </span>
  )
}
