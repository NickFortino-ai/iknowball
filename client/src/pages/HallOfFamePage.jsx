import { useState } from 'react'
import { RoyaltyContent } from './RoyaltyPage'
import { RecordBookContent } from './RecordBookPage'
import { HeadlinesArchiveContent } from './HeadlinesArchivePage'

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
  const [openSections, setOpenSections] = useState({})

  function toggle(key) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="text-center mb-6">
        <h1 className="font-display text-3xl">I KNOW BALL</h1>
        <h2 className="font-display text-xl text-text-secondary">HALL OF FAME</h2>
      </div>

      {/* Royalty */}
      <div className="border-b border-border">
        <SectionToggle title="Royalty" open={openSections.royalty} onToggle={() => toggle('royalty')} />
        {openSections.royalty && (
          <div className="pb-4">
            <RoyaltyContent />
          </div>
        )}
      </div>

      {/* Record Book */}
      <div className="border-b border-border">
        <SectionToggle title="Record Book" open={openSections.records} onToggle={() => toggle('records')} />
        {openSections.records && (
          <div className="pb-4">
            <RecordBookContent />
          </div>
        )}
      </div>

      {/* Headlines Archive */}
      <div>
        <SectionToggle title="Headlines Archive" open={openSections.headlines} onToggle={() => toggle('headlines')} />
        {openSections.headlines && (
          <div className="pb-4">
            <HeadlinesArchiveContent />
          </div>
        )}
      </div>
    </div>
  )
}
