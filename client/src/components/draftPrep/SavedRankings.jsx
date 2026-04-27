import { useState } from 'react'
import { useSavedRankingConfigs } from '../../hooks/useDraftPrep'
import { parseRosterConfigHash } from '../../lib/rosterConfigHash'

const SLOT_ORDER = [
  { key: 'qb', label: 'QB' },
  { key: 'rb', label: 'RB' },
  { key: 'wr', label: 'WR' },
  { key: 'te', label: 'TE' },
  { key: 'flex', label: 'FLEX' },
  { key: 'sflex', label: 'SFLEX' },
  { key: 'k', label: 'K' },
  { key: 'def', label: 'DEF' },
]

const SCORING_LABELS = {
  ppr: 'PPR',
  half_ppr: 'Half-PPR',
  standard: 'Standard',
}

function formatRoster(slots) {
  return SLOT_ORDER
    .filter((s) => (slots[s.key] || 0) > 0)
    .map((s) => `${slots[s.key]}${s.label}`)
    .join(' / ')
}

function formatRelative(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function SavedRankings({ activeScoringFormat, activeConfigHash, onLoad }) {
  const { data: configs, isLoading, error } = useSavedRankingConfigs()
  const [open, setOpen] = useState(false)

  if (isLoading) return null

  // Render even when empty so the user has a clear signal that the picker
  // exists; otherwise it looks like the feature is missing entirely.
  if (error) {
    return (
      <div className="rounded-xl border border-incorrect/30 bg-incorrect/5 backdrop-blur-md px-4 py-3">
        <div className="text-sm font-semibold text-incorrect">Couldn't load your saved boards</div>
        <div className="text-[11px] text-text-muted mt-0.5">{error.message || 'Unknown error'}</div>
      </div>
    )
  }

  if (!configs?.length) {
    return (
      <div className="rounded-xl border border-text-primary/15 bg-bg-primary/10 backdrop-blur-md px-4 py-3">
        <div className="text-sm font-semibold text-text-primary">Your saved boards</div>
        <div className="text-[11px] text-text-muted mt-0.5">
          No saved boards yet. Reorder a few players below — your board saves automatically against the current scoring + roster.
        </div>
      </div>
    )
  }

  const total = configs.length
  const otherCount = configs.filter(
    (c) => !(c.config_hash === activeConfigHash && c.scoring_format === activeScoringFormat),
  ).length

  return (
    <div className="rounded-xl border border-text-primary/20 bg-bg-primary/15 backdrop-blur-md overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg-primary/10 transition-colors"
      >
        <div className="text-left">
          <div className="text-sm font-semibold text-text-primary">Your saved boards</div>
          <div className="text-[11px] text-text-muted mt-0.5">
            {total} {total === 1 ? 'board' : 'boards'}
            {otherCount > 0 && open === false && ` · ${otherCount} other${otherCount === 1 ? '' : 's'} not loaded`}
          </div>
        </div>
        <svg
          className={`w-4 h-4 shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-1.5">
          {configs.map((c) => {
            const slots = parseRosterConfigHash(c.config_hash)
            const isActive = c.config_hash === activeConfigHash && c.scoring_format === activeScoringFormat
            return (
              <button
                key={`${c.config_hash}|${c.scoring_format}`}
                onClick={() => !isActive && onLoad?.({ scoringFormat: c.scoring_format, rosterSlots: slots })}
                disabled={isActive}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  isActive
                    ? 'border-accent bg-accent/10 cursor-default'
                    : 'border-text-primary/15 bg-bg-primary/20 hover:bg-bg-primary/40 hover:border-text-primary/30 cursor-pointer'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                        {SCORING_LABELS[c.scoring_format] || c.scoring_format}
                      </span>
                      {isActive && (
                        <span className="text-[9px] font-bold text-accent uppercase tracking-wider px-1.5 py-0.5 rounded border border-accent/40">Active</span>
                      )}
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5 truncate">
                      {formatRoster(slots) || 'No starters'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-text-muted">
                      {c.player_count} {c.player_count === 1 ? 'player' : 'players'}
                    </div>
                    {c.last_updated && (
                      <div className="text-[10px] text-text-muted/70">{formatRelative(c.last_updated)}</div>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
