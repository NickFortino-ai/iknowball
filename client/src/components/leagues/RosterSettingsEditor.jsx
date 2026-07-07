/**
 * Roster slot configuration editor for traditional fantasy leagues.
 *
 * Each row shows a label + minus / value / plus controls. Commissioners
 * can freely set any slot to any non-negative count — minus stops at 0.
 *
 * Defense mode toggles between Team DEF (one DEF slot) and IDP
 * (individual defensive players: LB, DL, DB, S). When IDP is on the
 * single DEF slot collapses to zero and the four IDP slots default to
 * one each. The user can then adjust IDP counts freely.
 *
 * Props:
 *   value: roster_slots object (qb, rb, wr, te, flex, superflex, k,
 *          def OR lb/dl/db/s, bench, ir)
 *   onChange(slots): called with the updated slots object on every adjust
 */

const OFFENSIVE_SLOTS = [
  { key: 'qb', label: 'QB' },
  { key: 'rb', label: 'RB' },
  { key: 'wr', label: 'WR' },
  { key: 'te', label: 'TE' },
  { key: 'flex', label: 'FLEX', sub: 'RB / WR / TE' },
  { key: 'superflex', label: 'Superflex', sub: 'QB / RB / WR / TE' },
  { key: 'k', label: 'K' },
]

const IDP_SLOTS = [
  { key: 'dl', label: 'DL', sub: 'DE / DT / NT' },
  { key: 'lb', label: 'LB', sub: 'ILB / OLB / MLB' },
  { key: 'db', label: 'DB', sub: 'CB / DB' },
  { key: 's', label: 'S', sub: 'FS / SS' },
]

const TAIL_SLOTS = [
  { key: 'bench', label: 'Bench' },
  { key: 'ir', label: 'IR', sub: "Injured reserve — doesn't count toward your bench" },
]

export const DEFAULT_ROSTER_SLOTS = {
  qb: 1,
  rb: 2,
  wr: 3,
  te: 1,
  flex: 1,
  superflex: 0,
  k: 1,
  def: 1,
  // IDP slots default to 0 until commissioner flips defense mode to IDP.
  dl: 0,
  lb: 0,
  db: 0,
  s: 0,
  bench: 6,
  ir: 1,
}

export default function RosterSettingsEditor({ value, onChange }) {
  const slots = { ...DEFAULT_ROSTER_SLOTS, ...(value || {}) }

  // Derive defense mode from the slot counts themselves so the toggle
  // reflects the actual config without needing a separate boolean.
  const idpCount = (slots.dl || 0) + (slots.lb || 0) + (slots.db || 0) + (slots.s || 0)
  const defenseMode = idpCount > 0 ? 'idp' : 'def'

  function adjust(key, delta) {
    const next = Math.max(0, (slots[key] || 0) + delta)
    onChange({ ...slots, [key]: next })
  }

  function setDefenseMode(mode) {
    if (mode === 'def') {
      onChange({ ...slots, def: 1, dl: 0, lb: 0, db: 0, s: 0 })
    } else {
      onChange({ ...slots, def: 0, dl: 1, lb: 1, db: 1, s: 1 })
    }
  }

  const defenseSlotsForTotal = defenseMode === 'def'
    ? [{ key: 'def' }]
    : IDP_SLOTS
  const starterTotal = [...OFFENSIVE_SLOTS, ...defenseSlotsForTotal]
    .reduce((sum, s) => sum + (slots[s.key] || 0), 0)
  const total = starterTotal + (slots.bench || 0)

  function renderRow(slot) {
    return (
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
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-text-primary/20 p-4 bg-bg-primary/40">
      <div className="space-y-2">
        {OFFENSIVE_SLOTS.map(renderRow)}

        {/* Defense row: label on left, mode toggle inline with the slot
            controls. In DEF mode the +/- controls appear next to the
            toggle. In IDP mode they're suppressed (DEF count is forced
            to 0) and the four IDP slot rows render below. */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-text-primary">Defense</div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              {[
                { value: 'def', label: 'DEF' },
                { value: 'idp', label: 'IDP' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDefenseMode(opt.value)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${
                    defenseMode === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {defenseMode === 'def' && (
              <>
                <button
                  type="button"
                  onClick={() => adjust('def', -1)}
                  disabled={(slots.def || 0) === 0}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-bg-secondary text-text-primary text-lg leading-none hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Decrease DEF"
                >
                  −
                </button>
                <span className="text-sm font-semibold text-text-primary w-6 text-center tabular-nums">
                  {slots.def || 0}
                </span>
                <button
                  type="button"
                  onClick={() => adjust('def', 1)}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-bg-secondary text-text-primary text-lg leading-none hover:bg-border transition-colors"
                  aria-label="Increase DEF"
                >
                  +
                </button>
              </>
            )}
          </div>
        </div>

        {defenseMode === 'idp' && IDP_SLOTS.map(renderRow)}

        {TAIL_SLOTS.map(renderRow)}
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-text-primary/10 text-xs">
        <span className="text-text-muted uppercase tracking-wider">Roster size</span>
        <span className="text-text-primary font-semibold tabular-nums text-right">
          {starterTotal} starters · {slots.bench || 0} bench · {total} total{(slots.ir || 0) > 0 ? ` + ${slots.ir} IR` : ''}
        </span>
      </div>
    </div>
  )
}
