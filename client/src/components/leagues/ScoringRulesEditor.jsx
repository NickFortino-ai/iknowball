import { useState } from 'react'

/**
 * Reusable scoring-rules editor for NFL fantasy leagues.
 *
 * Renders a preset picker (PPR / Half / Std / Custom), then a collapsible
 * Advanced section with every per-stat input. Bonus toggle reveals editable
 * yardage bonus tiers.
 *
 * Props:
 *   value: scoring_rules object (or null/undefined → uses DEFAULT_RULES)
 *   onChange(rules): called whenever a field changes
 */

export const DEFAULT_RULES = {
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -2,
  pass_2pt: 2,
  rush_yd: 0.1,
  rush_td: 6,
  rush_2pt: 2,
  rec: 1,
  rec_yd: 0.1,
  rec_td: 6,
  rec_2pt: 2,
  fum_lost: -2,
  fgm_0_39: 3,
  fgm_40_49: 4,
  fgm_50_plus: 5,
  xpm: 1,
  def_sack: 1,
  def_int: 2,
  def_fum_rec: 2,
  def_td: 6,
  def_safety: 2,
  def_pa_brackets: [
    { max: 0,   pts: 10 },
    { max: 6,   pts: 7 },
    { max: 13,  pts: 4 },
    { max: 20,  pts: 1 },
    { max: 27,  pts: 0 },
    { max: 34,  pts: -1 },
    { max: 999, pts: -4 },
  ],
  bonuses_enabled: false,
  pass_yd_bonuses: [
    { threshold: 300, points: 5 },
    { threshold: 350, points: 5 },
    { threshold: 400, points: 5 },
    { threshold: 450, points: 5 },
  ],
  rush_yd_bonuses: [
    { threshold: 100, points: 5 },
    { threshold: 150, points: 5 },
    { threshold: 200, points: 5 },
    { threshold: 250, points: 5 },
    { threshold: 300, points: 5 },
  ],
  rec_yd_bonuses: [
    { threshold: 100, points: 5 },
    { threshold: 150, points: 5 },
    { threshold: 200, points: 5 },
    { threshold: 250, points: 5 },
    { threshold: 300, points: 5 },
  ],
}

function buildFromPreset(preset) {
  const base = JSON.parse(JSON.stringify(DEFAULT_RULES))
  if (preset === 'standard') base.rec = 0
  else if (preset === 'half_ppr') base.rec = 0.5
  else base.rec = 1
  return base
}

function NumberField({ label, value, onChange, step = 0.5, hint }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase text-text-muted tracking-wider block mb-1">{label}</span>
      <input
        type="number"
        step={step}
        value={value ?? 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-bg-input border border-border rounded-lg px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent"
      />
      {hint && <div className="text-[9px] text-text-muted mt-0.5">{hint}</div>}
    </label>
  )
}

export default function ScoringRulesEditor({ value, onChange }) {
  const rules = value || DEFAULT_RULES
  const [preset, setPreset] = useState(() => {
    if (rules.rec === 1) return 'ppr'
    if (rules.rec === 0.5) return 'half_ppr'
    if (rules.rec === 0) return 'standard'
    return 'custom'
  })
  const [advancedOpen, setAdvancedOpen] = useState(false)

  function set(field, val) {
    onChange({ ...rules, [field]: val })
    setPreset('custom')
  }

  function pickPreset(p) {
    setPreset(p)
    if (p !== 'custom') {
      onChange(buildFromPreset(p))
    }
  }

  function updateBonusTier(arrField, idx, key, val) {
    const next = [...(rules[arrField] || [])]
    next[idx] = { ...next[idx], [key]: parseFloat(val) || 0 }
    set(arrField, next)
  }

  function updatePaBracket(idx, key, val) {
    const next = [...(rules.def_pa_brackets || [])]
    next[idx] = { ...next[idx], [key]: parseFloat(val) || 0 }
    set('def_pa_brackets', next)
  }

  return (
    <div className="space-y-3">
      {/* Preset picker */}
      <div>
        <label className="block text-xs text-text-muted mb-2">Scoring Preset</label>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: 'ppr', label: 'PPR' },
            { value: 'half_ppr', label: 'Half PPR' },
            { value: 'standard', label: 'Standard' },
            { value: 'custom', label: 'Custom' },
          ].map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => pickPreset(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                preset === p.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setAdvancedOpen(!advancedOpen)}
        className="flex items-center gap-2 text-xs font-semibold text-accent hover:text-accent-hover"
      >
        <span className={`transition-transform ${advancedOpen ? 'rotate-90' : ''}`}>▶</span>
        Advanced Scoring
      </button>

      {advancedOpen && (
        <div className="space-y-5 rounded-xl border border-text-primary/20 p-4 bg-bg-primary/40">
          {/* Passing */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Passing</h4>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Pts / Yard" value={rules.pass_yd} onChange={(v) => set('pass_yd', v)} step={0.01} hint="0.04 = 1 pt per 25 yds" />
              <NumberField label="Pts per TD" value={rules.pass_td} onChange={(v) => set('pass_td', v)} step={1} />
              <NumberField label="Pts per INT" value={rules.pass_int} onChange={(v) => set('pass_int', v)} step={1} />
              <NumberField label="Pts per 2PT" value={rules.pass_2pt} onChange={(v) => set('pass_2pt', v)} step={1} />
            </div>
          </div>

          {/* Rushing */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Rushing</h4>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Pts / Yard" value={rules.rush_yd} onChange={(v) => set('rush_yd', v)} step={0.01} hint="0.1 = 1 pt per 10 yds" />
              <NumberField label="Pts per TD" value={rules.rush_td} onChange={(v) => set('rush_td', v)} step={1} />
              <NumberField label="Pts per 2PT" value={rules.rush_2pt} onChange={(v) => set('rush_2pt', v)} step={1} />
            </div>
          </div>

          {/* Receiving */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Receiving</h4>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Pts per Reception" value={rules.rec} onChange={(v) => set('rec', v)} step={0.5} hint="1 PPR · 0.5 Half · 0 Std" />
              <NumberField label="Pts / Yard" value={rules.rec_yd} onChange={(v) => set('rec_yd', v)} step={0.01} />
              <NumberField label="Pts per TD" value={rules.rec_td} onChange={(v) => set('rec_td', v)} step={1} />
              <NumberField label="Pts per 2PT" value={rules.rec_2pt} onChange={(v) => set('rec_2pt', v)} step={1} />
            </div>
          </div>

          {/* Misc */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Misc</h4>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Fumble Lost" value={rules.fum_lost} onChange={(v) => set('fum_lost', v)} step={1} />
            </div>
          </div>

          {/* Kicker */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Kicker</h4>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="FG 0–39" value={rules.fgm_0_39} onChange={(v) => set('fgm_0_39', v)} step={1} />
              <NumberField label="FG 40–49" value={rules.fgm_40_49} onChange={(v) => set('fgm_40_49', v)} step={1} />
              <NumberField label="FG 50+" value={rules.fgm_50_plus} onChange={(v) => set('fgm_50_plus', v)} step={1} />
              <NumberField label="Extra Point" value={rules.xpm} onChange={(v) => set('xpm', v)} step={1} />
            </div>
          </div>

          {/* Defense */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Team Defense</h4>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Sack" value={rules.def_sack} onChange={(v) => set('def_sack', v)} step={0.5} />
              <NumberField label="INT" value={rules.def_int} onChange={(v) => set('def_int', v)} step={1} />
              <NumberField label="Fumble Rec" value={rules.def_fum_rec} onChange={(v) => set('def_fum_rec', v)} step={1} />
              <NumberField label="TD" value={rules.def_td} onChange={(v) => set('def_td', v)} step={1} />
              <NumberField label="Safety" value={rules.def_safety} onChange={(v) => set('def_safety', v)} step={1} />
            </div>
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Points Allowed Brackets</div>
              <div className="space-y-1">
                {(rules.def_pa_brackets || []).map((b, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-text-muted w-20">≤ {b.max} pts</span>
                    <input
                      type="number"
                      step={1}
                      value={b.pts}
                      onChange={(e) => updatePaBracket(i, 'pts', e.target.value)}
                      className="w-20 bg-bg-input border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                    />
                    <span className="text-text-muted">pts</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bonuses */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">Yardage Bonuses</h4>
              <button
                type="button"
                onClick={() => set('bonuses_enabled', !rules.bonuses_enabled)}
                className={`text-[10px] font-bold px-3 py-1 rounded-full transition-colors ${
                  rules.bonuses_enabled ? 'bg-accent text-white' : 'bg-bg-secondary text-text-muted'
                }`}
              >
                {rules.bonuses_enabled ? 'ON' : 'OFF'}
              </button>
            </div>
            {rules.bonuses_enabled && (
              <div className="space-y-3">
                {[
                  { field: 'pass_yd_bonuses', label: 'Passing Yards' },
                  { field: 'rush_yd_bonuses', label: 'Rushing Yards' },
                  { field: 'rec_yd_bonuses', label: 'Receiving Yards' },
                ].map((cat) => (
                  <div key={cat.field}>
                    <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">{cat.label}</div>
                    <div className="space-y-1">
                      {(rules[cat.field] || []).map((tier, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-text-muted w-12">≥</span>
                          <input
                            type="number"
                            value={tier.threshold}
                            onChange={(e) => updateBonusTier(cat.field, i, 'threshold', e.target.value)}
                            className="w-20 bg-bg-input border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                          />
                          <span className="text-text-muted">yds → +</span>
                          <input
                            type="number"
                            step={0.5}
                            value={tier.points}
                            onChange={(e) => updateBonusTier(cat.field, i, 'points', e.target.value)}
                            className="w-16 bg-bg-input border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
                          />
                          <span className="text-text-muted">pts</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
