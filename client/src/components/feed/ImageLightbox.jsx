import { useEffect, useRef, useState } from 'react'

// Resize via Supabase's render endpoint — way faster than loading the
// original full-resolution upload (often 3-5 MB straight from a phone
// camera). Pass-through for non-Supabase URLs.
function fastImage(url, width = 1600) {
  if (!url || !url.includes('/storage/v1/object/public/')) return url
  return url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + `?width=${width}&resize=contain&quality=80`
}

export default function ImageLightbox({ src, images, initialIndex = 0, onClose }) {
  // Back-compat: callers can pass a single `src` (single image) or
  // `images` + `initialIndex` (carousel). Normalize to one array.
  const list = images?.length ? images : (src ? [src] : [])
  const [index, setIndex] = useState(initialIndex)
  const scrollerRef = useRef(null)
  // Guards handleScroll from echoing intermediate scroll positions back to
  // index during a programmatic smooth-scroll (fights the arrow-click / key
  // handlers otherwise).
  const isProgrammaticScroll = useRef(false)

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, list.length - 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0))
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, list.length])

  // When index changes via keyboard or arrow button, sync the scroll position.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    isProgrammaticScroll.current = true
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
    // Smooth-scroll animation typically lands within ~400ms.
    const t = setTimeout(() => { isProgrammaticScroll.current = false }, 500)
    return () => clearTimeout(t)
  }, [index])

  // When user swipes/scrolls manually, derive the active index from scroll
  // position. Ignore scroll events during a programmatic scrollTo so the
  // in-flight smooth-scroll doesn't fight the arrow-click state update.
  function handleScroll() {
    if (isProgrammaticScroll.current) return
    const el = scrollerRef.current
    if (!el) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== index) setIndex(i)
  }

  if (!list.length) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 text-white/90 hover:text-white text-3xl z-20 w-12 h-12 flex items-center justify-center rounded-full bg-black/40 active:bg-black/60"
        style={{ top: 'max(0.75rem, calc(env(safe-area-inset-top) + 0.5rem))' }}
      >
        ×
      </button>

      {list.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-xs z-20 bg-black/40 px-2 py-1 rounded-full">
          {index + 1} / {list.length}
        </div>
      )}

      {/* Horizontal scroll-snap carousel — native swipe on touch devices,
          no extra gesture library needed. Each slide is exactly the
          viewport width so snap points land cleanly. */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        onClick={(e) => e.stopPropagation()}
        className="w-full h-full flex overflow-x-auto snap-x snap-mandatory overscroll-contain scrollbar-hide"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {list.map((url, i) => (
          <div
            key={url + i}
            className="shrink-0 w-full h-full flex items-center justify-center snap-center p-4"
          >
            <img
              src={fastImage(url)}
              alt=""
              loading={Math.abs(i - initialIndex) <= 1 ? 'eager' : 'lazy'}
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
          </div>
        ))}
      </div>

      {list.length > 1 && (
        <>
          {index > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.max(i - 1, 0)) }}
              className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-black/40 text-white/80 hover:text-white z-20"
              aria-label="Previous image"
            >
              ‹
            </button>
          )}
          {index < list.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.min(i + 1, list.length - 1)) }}
              className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-black/40 text-white/80 hover:text-white z-20"
              aria-label="Next image"
            >
              ›
            </button>
          )}

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
            {list.map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/40'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
