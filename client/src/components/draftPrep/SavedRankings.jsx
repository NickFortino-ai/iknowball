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
        <div className="text-sm font-semibold text-incorrect">Couldn't load your saved rankings</div>
        <div className="text-[11px] text-text-muted mt-0.5">{error.message || 'Unknown error'}</div>
      </div>
    )
  }

  if (!configs?.length) {
    return (
      <div className="rounded-xl border border-text-primary/15 bg-bg-primary/10 backdrop-blur-md px-4 py-3">
        <div className="text-sm font-semibold text-text-primary">Your Saved Rankings</div>
        <div className="text-[11px] text-text-muted mt-0.5">Based on different roster configurations</div>
        <div className="text-[11px] text-text-muted mt-2">
          No saved rankings yet. Reorder a few players below — your board saves automatically against the current roster.
        </div>
      </div>
    )
  }

  // One row per (roster + scoring) — different scoring formats produce
  // meaningfully different rankings (TE/RB/WR values shift), so we surface
  // them as separate entries instead of collapsing.
  const sorted = [...configs].sort((a, b) => {
    if (!a.last_updated) return 1
    if (!b.last_updated) return -1
    return b.last_updated.localeCompare(a.last_updated)
  })

  const total = sorted.length
  const otherCount = sorted.filter(
    (c) => !(c.config_hash === activeConfigHash && c.scoring_format === activeScoringFormat),
  ).length

  return (
    <div className="rounded-xl border border-text-primary/20 bg-bg-primary/15 backdrop-blur-md overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg-primary/10 transition-colors"
      >
        <div className="text-left">
          <div className="text-sm font-semibold text-text-primary">Your Saved Rankings</div>
          <div className="text-[11px] text-text-muted mt-0.5">Based on different roster configurations</div>
          <div className="text-[11px] text-text-muted mt-1">
            {total} {total === 1 ? 'ranking' : 'rankings'}
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
          {sorted.map((c) => {
            const slots = parseRosterConfigHash(c.config_hash)
            const isActive = c.config_hash === activeConfigHash && c.scoring_format === activeScoringFormat
            const rosterLabel = formatRoster(slots) || 'No starters'
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-text-primary">{rosterLabel}</span>
                      {isActive && (
                        <span className="text-[9px] font-bold text-accent uppercase tracking-wider px-1.5 py-0.5 rounded border border-accent/40">Active</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-1.5 py-0.5 rounded bg-bg-primary/40 border border-text-primary/15">
                        {SCORING_LABELS[c.scoring_format] || c.scoring_format}
                      </span>
                      {c.last_updated && (
                        <span className="text-[10px] text-text-muted">{formatRelative(c.last_updated)}</span>
                      )}
                    </div>
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
