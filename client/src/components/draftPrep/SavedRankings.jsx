import { useState, useRef, useEffect } from 'react'
import { useSavedRankingConfigs, useRenameSavedRanking } from '../../hooks/useDraftPrep'
import { parseRosterConfigHash } from '../../lib/rosterConfigHash'
import { toast } from '../ui/Toast'

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
  const rename = useRenameSavedRanking()
  const [open, setOpen] = useState(false)
  // Which row is showing the ⋯ menu open (key: `${config_hash}|${scoring}`)
  const [menuKey, setMenuKey] = useState(null)
  // Which row is in inline-edit mode + its draft value
  const [editKey, setEditKey] = useState(null)
  const [editName, setEditName] = useState('')
  const inputRef = useRef(null)

  // Close menu / edit on click outside
  useEffect(() => {
    if (!menuKey && !editKey) return
    function onDocClick(e) {
      if (e.target.closest('[data-savedranking-row]')) return
      setMenuKey(null)
      if (editKey) {
        setEditKey(null)
        setEditName('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuKey, editKey])

  useEffect(() => {
    if (editKey && inputRef.current) inputRef.current.select()
  }, [editKey])

  async function handleSaveName(configHash, scoringFormat) {
    try {
      await rename.mutateAsync({ configHash, scoringFormat, name: editName })
      toast(editName.trim() ? 'Ranking renamed' : 'Name cleared', 'success')
      setEditKey(null)
      setEditName('')
    } catch (err) {
      toast(err.message || 'Failed to rename', 'error')
    }
  }

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
            const rowKey = `${c.config_hash}|${c.scoring_format}`
            const slots = parseRosterConfigHash(c.config_hash)
            const isActive = c.config_hash === activeConfigHash && c.scoring_format === activeScoringFormat
            const rosterLabel = formatRoster(slots) || 'No starters'
            const isEditing = editKey === rowKey
            const isMenuOpen = menuKey === rowKey
            // Prefer the user-supplied name; fall back to roster label
            const displayName = c.name || rosterLabel

            return (
              <div
                key={rowKey}
                data-savedranking-row
                className={`relative rounded-lg border px-3 py-2.5 transition-colors ${
                  isActive
                    ? 'border-accent bg-accent/10'
                    : 'border-text-primary/15 bg-bg-primary/20 hover:bg-bg-primary/40 hover:border-text-primary/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => !isActive && !isEditing && onLoad?.({ scoringFormat: c.scoring_format, rosterSlots: slots })}
                    disabled={isActive || isEditing}
                    className={`min-w-0 flex-1 text-left ${isActive || isEditing ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value.slice(0, 50))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleSaveName(c.config_hash, c.scoring_format) }
                            if (e.key === 'Escape') { setEditKey(null); setEditName('') }
                          }}
                          onBlur={() => handleSaveName(c.config_hash, c.scoring_format)}
                          placeholder={rosterLabel}
                          maxLength={50}
                          className="text-sm font-semibold text-text-primary bg-transparent border-b border-accent/60 outline-none flex-1 min-w-0"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="text-sm font-semibold text-text-primary truncate">{displayName}</span>
                      )}
                      {isActive && !isEditing && (
                        <span className="text-[9px] font-bold text-accent uppercase tracking-wider px-1.5 py-0.5 rounded border border-accent/40">Active</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-1.5 py-0.5 rounded bg-bg-primary/40 border border-text-primary/15">
                        {SCORING_LABELS[c.scoring_format] || c.scoring_format}
                      </span>
                      {/* When a custom name exists, show the auto roster label as
                          the secondary line so users don't lose the config info */}
                      {c.name && !isEditing && (
                        <span className="text-[10px] text-text-muted truncate">{rosterLabel}</span>
                      )}
                      {c.last_updated && !c.name && !isEditing && (
                        <span className="text-[10px] text-text-muted">{formatRelative(c.last_updated)}</span>
                      )}
                    </div>
                  </button>

                  {/* ⋯ menu — hidden while editing */}
                  {!isEditing && (
                    <div className="relative shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuKey(isMenuOpen ? null : rowKey)
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-bg-primary/40 transition-colors"
                        aria-label="Row actions"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="5" cy="12" r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="19" cy="12" r="1.5" />
                        </svg>
                      </button>
                      {isMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 z-20 min-w-[9rem] rounded-lg border border-text-primary/20 bg-bg-primary shadow-lg overflow-hidden">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setMenuKey(null)
                              setEditKey(rowKey)
                              setEditName(c.name || '')
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-bg-primary/60"
                          >
                            Rename
                          </button>
                          {c.name && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation()
                                setMenuKey(null)
                                try {
                                  await rename.mutateAsync({ configHash: c.config_hash, scoringFormat: c.scoring_format, name: '' })
                                  toast('Name cleared', 'success')
                                } catch (err) {
                                  toast(err.message || 'Failed to clear', 'error')
                                }
                              }}
                              className="w-full text-left px-3 py-2 text-xs text-text-muted hover:bg-bg-primary/60 border-t border-text-primary/10"
                            >
                              Clear name
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
