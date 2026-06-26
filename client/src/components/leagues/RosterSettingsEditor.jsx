/**
 * Roster slot configuration editor for traditional fantasy leagues.
 *
 * Each row shows a label + minus / value / plus controls. Commissioners
 * can freely set any slot to any non-negative count — minus stops at 0.
 * IR is intentionally NOT in this list; CreateLeaguePage keeps its own
 * dedicated IR field beside the draft-mode pickers.
 *
 * Props:
 *   value: roster_slots object (qb, rb, wr, te, flex, superflex, k, def, bench)
 *   onChange(slots): called with the updated slots object on every adjust
 */

const SLOTS = [
  { key: 'qb', label: 'QB' },
  { key: 'rb', label: 'RB' },
  { key: 'wr', label: 'WR' },
  { key: 'te', label: 'TE' },
  { key: 'flex', label: 'FLEX', sub: 'RB / WR / TE' },
  { key: 'superflex', label: 'Superflex', sub: 'QB / RB / WR / TE' },
  { key: 'k', label: 'K' },
  { key: 'def', label: 'DEF' },
  { key: 'bench', label: 'Bench' },
]

export const DEFAULT_ROSTER_SLOTS = {
  qb: 1,
  rb: 2,
  wr: 2,
  te: 1,
  flex: 1,
  superflex: 0,
  k: 1,
  def: 1,
  bench: 6,
}

export default function RosterSettingsEditor({ value, onChange }) {
  const slots = { ...DEFAULT_ROSTER_SLOTS, ...(value || {}) }

  function adjust(key, delta) {
    const next = Math.max(0, (slots[key] || 0) + delta)
    onChange({ ...slots, [key]: next })
  }

  const starterTotal = SLOTS
    .filter((s) => s.key !== 'bench')
    .reduce((sum, s) => sum + (slots[s.key] || 0), 0)
  const total = starterTotal + (slots.bench || 0)

  return (
    <div className="space-y-3 rounded-xl border border-text-primary/20 p-4 bg-bg-primary/40">
      <div className="space-y-2">
        {SLOTS.map((slot) => (
          <div key={slot.key} className="flex items-center justify-between">
            <div>
              <div className="text-sm text-text-primary">{slot.label}</div>
              {slot.sub && <div className="text-[10px] text-text-muted">{slot.sub}</div>}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => adjust(slot.key, -1)}
                disabled={(slots[slot.key] || 0) === 0}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-bg-secondary text-text-primary text-lg leading-none hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label={`Decrease ${slot.label}`}
              >
                −
              </button>
              <span className="text-sm font-semibold text-text-primary w-6 text-center tabular-nums">
                {slots[slot.key] || 0}
              </span>
              <button
                type="button"
                onClick={() => adjust(slot.key, 1)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-bg-secondary text-text-primary text-lg leading-none hover:bg-border transition-colors"
                aria-label={`Increase ${slot.label}`}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-text-primary/10 text-xs">
        <span className="text-text-muted uppercase tracking-wider">Roster size</span>
        <span className="text-text-primary font-semibold tabular-nums text-right">
          {starterTotal} starters · {slots.bench || 0} bench · {total} total
        </span>
      </div>
    </div>
  )
}
