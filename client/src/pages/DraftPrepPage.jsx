import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { buildRosterConfigHash } from '../lib/rosterConfigHash'
import FantasyMyRankings from '../components/leagues/FantasyMyRankings'
import DraftPrepAdp from '../components/draftPrep/DraftPrepAdp'
import DraftPrepSyncPanel from '../components/draftPrep/DraftPrepSyncPanel'
import MockDraftPage from './MockDraftPage'

const TABS = ['My Rankings', 'ADP', 'Mock Draft']

const SCORING_OPTIONS = [
  { value: 'half_ppr', label: 'Half-PPR' },
  { value: 'ppr', label: 'PPR' },
  { value: 'standard', label: 'Standard' },
]

const DEFAULT_ROSTER = { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, sflex: 0, k: 1, def: 1 }

const SLOT_LABELS = [
  { key: 'qb', label: 'QB' },
  { key: 'rb', label: 'RB' },
  { key: 'wr', label: 'WR' },
  { key: 'te', label: 'TE' },
  { key: 'flex', label: 'FLEX' },
  { key: 'sflex', label: 'SFLEX' },
  { key: 'k', label: 'K' },
  { key: 'def', label: 'DEF' },
]

function rosterLabel(slots) {
  return SLOT_LABELS
    .filter((s) => (slots[s.key] || 0) > 0)
    .map((s) => `${slots[s.key]}${s.label}`)
    .join(' / ')
}

export default function DraftPrepPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = TABS.findIndex((t) => t.toLowerCase().replace(/\s+/g, '-') === searchParams.get('tab'))
  const [activeTab, setActiveTab] = useState(initialTab >= 0 ? initialTab : 0)
  const [scoringFormat, setScoringFormat] = useState('half_ppr')
  const [rosterSlots, setRosterSlots] = useState({ ...DEFAULT_ROSTER })
  const [showConfig, setShowConfig] = useState(false)
  const [introOpen, setIntroOpen] = useState(false)

  const configHash = buildRosterConfigHash(rosterSlots)

  function handleTabChange(i) {
    setActiveTab(i)
    setSearchParams({ tab: TABS[i].toLowerCase().replace(/\s+/g, '-') }, { replace: true })
  }

  function adjustSlot(key, delta) {
    setRosterSlots((prev) => ({
      ...prev,
      [key]: Math.max(0, (prev[key] || 0) + delta),
    }))
  }

  return (
    <div className="relative">
      {/* Hero backdrop */}
      <div className="absolute inset-x-0 top-0 h-[520px] md:h-[480px] overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <img
          src="/ff-draft-prep-bg.png"
          alt=""
          className="w-full h-full object-cover opacity-30"
          style={{ objectPosition: 'center 50%' }}
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-bg-primary/20 via-bg-primary/40 to-bg-primary" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-6 pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link to="/leagues" className="text-text-muted hover:text-text-primary">←</Link>
        <h1 className="font-display text-3xl">Fantasy Football Draft Prep</h1>
      </div>

      {/* Intro */}
      <div className={`rounded-xl border border-text-primary/20 backdrop-blur-md p-4 mb-4 mt-20 md:mt-4 transition-colors ${introOpen ? 'bg-bg-primary/15' : 'bg-bg-primary/5'}`}>
        <button
          onClick={() => setIntroOpen(!introOpen)}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <p className="text-sm font-bold text-text-primary">
            Preparation is the best way to secure your league championships!
          </p>
          <span className="flex items-center gap-1.5 shrink-0 text-accent">
            <span className="text-[10px] font-semibold uppercase tracking-wider">{introOpen ? 'Hide' : 'Learn more'}</span>
            <svg
              className={`w-5 h-5 transition-transform ${introOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        {introOpen && (
          <ul className="space-y-1.5 text-sm text-text-primary/80 mt-3">
            <li className="flex gap-2"><span className="text-accent">•</span><span>Rank every player your way — drag, search, and filter your own board</span></li>
            <li className="flex gap-2"><span className="text-accent">•</span><span>Tune it for your scoring (PPR / Half-PPR / Standard) and roster shape</span></li>
            <li className="flex gap-2"><span className="text-accent">•</span><span>Compare your rankings against ADP and projections side-by-side</span></li>
            <li className="flex gap-2"><span className="text-accent">•</span><span>Sync your rankings to any of your fantasy leagues — edits flow both ways</span></li>
            <li className="flex gap-2"><span className="text-accent">•</span><span>Mock-draft against the field using your rankings and/or ADP rankings</span></li>
          </ul>
        )}
      </div>

      {/* Config bar */}
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-semibold">Scoring:</span>
            <div className="flex gap-1">
              {SCORING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setScoringFormat(opt.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    scoringFormat === opt.value
                      ? 'bg-accent text-white'
                      : 'bg-bg-secondary text-text-secondary hover:bg-white/10'
                  }`}
                >{opt.label}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-semibold">Roster:</span>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-bg-secondary border border-text-primary/20 text-text-secondary hover:bg-white/10 transition-colors"
            >
              {rosterLabel(rosterSlots)} {showConfig ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {/* Expandable roster editor */}
        {showConfig && (
          <div className="mt-3 pt-3 border-t border-text-primary/10">
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {SLOT_LABELS.map((s) => (
                <div key={s.key} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold text-text-muted">{s.label}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => adjustSlot(s.key, -1)}
                      className="w-6 h-6 rounded bg-bg-secondary text-text-muted hover:text-text-primary text-sm flex items-center justify-center"
                    >−</button>
                    <span className="text-sm font-bold text-text-primary w-4 text-center">{rosterSlots[s.key] || 0}</span>
                    <button
                      onClick={() => adjustSlot(s.key, 1)}
                      className="w-6 h-6 rounded bg-bg-secondary text-text-muted hover:text-text-primary text-sm flex items-center justify-center"
                    >+</button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => { setRosterSlots({ ...DEFAULT_ROSTER }); setShowConfig(false) }}
              className="mt-2 text-[10px] text-text-muted hover:text-text-primary underline"
            >
              Reset to default
            </button>
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => handleTabChange(i)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
              activeTab === i
                ? 'bg-accent text-white'
                : 'bg-bg-primary border border-text-primary/20 text-text-secondary hover:bg-white/10'
            }`}
          >{tab}</button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 0 && (
        <div className="space-y-4">
          <FantasyMyRankings draftPrepConfig={{ scoringFormat, configHash }} />
          <DraftPrepSyncPanel configHash={configHash} scoringFormat={scoringFormat} />
        </div>
      )}
      {activeTab === 1 && (
        <DraftPrepAdp scoringFormat={scoringFormat} />
      )}
      {activeTab === 2 && (
        <MockDraftPage embedded defaultConfig={{ scoringFormat, configHash }} />
      )}
      </div>
    </div>
  )
}
