import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { RoyaltyContent } from './RoyaltyPage'
import { RecordBookContent } from './RecordBookPage'

const HERO_IMAGES = [
  '/hall-of-fame/basketball-hof.webp',
  '/hall-of-fame/football-hof.webp',
  '/hall-of-fame/baseball-hof.webp',
]

function SectionToggle({ title, open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 py-3 text-left"
    >
      <svg
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className={`text-text-muted transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
      <span className="font-display text-lg">{title}</span>
    </button>
  )
}

export default function HallOfFamePage() {
  const [searchParams] = useSearchParams()
  // ?section is no longer read — both sections open on arrival now. ?record
  // still is, and drives scrollToRecord below.
  const recordParam = searchParams.get('record')
  // Both open on arrival. The page used to open whichever section the
  // ?section param named and leave the other collapsed, which made sense
  // when every visit came from a notification deep link — but the Hub's
  // fourth mark now sends people here with no section at all, and they were
  // landing on a Record Book that looked empty until they thought to tap it.
  //
  // The param still matters: scrollToRecord below needs it to jump to a
  // specific record, and that only works if the section is already open.
  const [openSections, setOpenSections] = useState({ royalty: true, records: true })
  const [heroIdx, setHeroIdx] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setHeroIdx((i) => (i + 1) % HERO_IMAGES.length)
    }, 11000)
    return () => clearInterval(interval)
  }, [])

  function toggle(key) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div data-onboarding="hall-of-fame">
      {/* Hero with cycling HOF backdrops — text block sits near the bottom
          of the hero area, above the gradient fade. Royalty section overlaps
          the bottom of the hero via negative margin. */}
      <div className="relative text-center overflow-hidden min-h-[55vh] sm:min-h-[60vh] flex flex-col justify-end">
        <div className="absolute inset-0">
          {HERO_IMAGES.map((src, i) => (
            <img
              key={src}
              src={src}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                opacity: i === heroIdx ? 1 : 0,
                transform: i === heroIdx ? 'scale(1.05)' : 'scale(1)',
                transition: i === heroIdx
                  ? 'opacity 2.5s ease-in-out, transform 15s ease-out'
                  : 'opacity 2.5s ease-in-out, transform 0.01s 2.6s',
              }}
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          ))}
          {/* Dark gradient overlay — stronger at bottom to fade into content */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-bg-primary" />
        </div>

        {/* Back to the Hub. The Hall of Fame is reached from the Hub's
            fourth mark now rather than from the account menu, so it needs a
            way back that does not depend on the browser's — a user who deep
            links in from a record notification has no history to pop.

            Deliberately quiet: the hero is the point of this page, and a
            solid button in the corner would compete with it. Sits above the
            backdrop on z-20 and inside the safe area, since the hero runs to
            the top of the screen on a phone.

            It carries its own dark pill rather than relying on a drop
            shadow. First pass was white/70 text on the bare hero, which is a
            bright sports photo under only a 40% gradient — legible on the
            dark frames of the cycle and effectively invisible on the rest.
            Subtle should mean quiet, not missing. */}
        <Link
          to="/hub"
          className="absolute top-0 left-0 z-20 m-3 mt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-sm text-xs font-semibold text-white/90 hover:bg-black/70 hover:text-white transition-colors"
        >
          <span aria-hidden="true" className="text-sm leading-none">&larr;</span>
          Hub
        </Link>

        <div className="relative z-10 pb-10 sm:pb-14 px-4">
          <h1 className="font-display text-3xl sm:text-5xl lg:text-8xl text-accent tracking-tight drop-shadow-lg">
            I KNOW BALL
          </h1>
          <h2 className="font-display text-lg sm:text-xl lg:text-4xl text-white/90 drop-shadow mt-0.5 lg:mt-2">
            HALL OF FAME
          </h2>
        </div>
      </div>

      {/* Outer wrapper widens on desktop so the Royalty / Record Book /
          Headlines Archive section headers left-align with their wider
          expanded content, instead of being centered in a narrower column
          that floats away from it.

          max-w-7xl with lg:px-6, matching RoyaltyPage's breakout container
          exactly (lg:w-screen -> lg:max-w-7xl lg:mx-auto lg:px-6). It was
          5xl, which is 256px narrower, so every header sat 128px inboard of
          the crowns underneath it. Changing one without the other is what
          put them out of line in the first place — if that breakout width
          ever moves, this has to move with it. */}
      <div className="max-w-2xl lg:max-w-7xl mx-auto px-4 lg:px-6 pb-6 -mt-8 sm:-mt-10 relative z-10">
        {/* Royalty */}
        <div className="border-b border-border">
          <SectionToggle title="Royalty" open={openSections.royalty} onToggle={() => toggle('royalty')} />
          {openSections.royalty && (
            <div className="pb-4">
              <RoyaltyContent />
            </div>
          )}
        </div>

        {/* Record Book — 2-col grid within each category on desktop (handled
            inside RecordBookContent). The wider wrapper gives it room. */}
        <div className="border-b border-border">
          <SectionToggle title="Record Book" open={openSections.records} onToggle={() => toggle('records')} />
          {openSections.records && (
            <div className="pb-4">
              <RecordBookContent scrollToRecord={recordParam} />
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
