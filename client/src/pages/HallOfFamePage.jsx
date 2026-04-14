import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { RoyaltyContent } from './RoyaltyPage'
import { RecordBookContent } from './RecordBookPage'
import { HeadlinesArchiveContent } from './HeadlinesArchivePage'

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
  const { profile } = useAuth()
  const isAdmin = !!profile?.is_admin
  const section = searchParams.get('section')
  const recordParam = searchParams.get('record')
  const [openSections, setOpenSections] = useState(
    section === 'records' ? { records: true }
      : section === 'headlines' && isAdmin ? { headlines: true }
      : { royalty: true }
  )
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

        <div className="relative z-10 pb-10 sm:pb-14 px-4">
          <h1 className="font-display text-3xl sm:text-5xl lg:text-8xl text-accent tracking-tight drop-shadow-lg">
            I KNOW BALL
          </h1>
          <h2 className="font-display text-lg sm:text-xl lg:text-4xl text-white/90 drop-shadow mt-0.5 lg:mt-2">
            HALL OF FAME
          </h2>
        </div>
      </div>

      {/* Outer wrapper widens to max-w-5xl on desktop so the Royalty /
          Record Book / Headlines Archive section headers left-align with
          their wider expanded content, instead of being centered in a
          narrower column that floats away from the content. */}
      <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 pb-6 -mt-8 sm:-mt-10 relative z-10">
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

        {/* Headlines Archive — hidden from non-admins while we fix the
            recordsBroken data source (see HomePage for details). */}
        {isAdmin && (
          <div>
            <SectionToggle title="Headlines Archive" open={openSections.headlines} onToggle={() => toggle('headlines')} />
            {openSections.headlines && (
              <div className="pb-4 lg:max-w-4xl">
                <HeadlinesArchiveContent />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
