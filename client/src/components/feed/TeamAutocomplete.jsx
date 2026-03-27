import { useState, useRef, useEffect } from 'react'

export default function TeamAutocomplete({ teams, onSelect, inputValue, onInputChange, placeholder = 'Search teams...' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const query = (inputValue || '').toLowerCase()
  const filtered = query.length >= 3
    ? (teams || []).filter((t) => {
        const lower = t.toLowerCase()
        // Match full name or individual words
        if (lower.includes(query)) return true
        const words = lower.split(/\s+/)
        return words.some((w) => w.startsWith(query))
      }).slice(0, 8)
    : []

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => {
          onInputChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full bg-bg-secondary border border-text-primary/20 rounded-lg px-2 py-1 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent/40"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-bg-primary border border-text-primary/20 rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {filtered.map((t) => (
            <button
              key={t}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(t)
                onInputChange('')
                setOpen(false)
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-text-primary/5 truncate"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
