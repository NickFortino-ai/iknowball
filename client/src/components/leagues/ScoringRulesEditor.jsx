import { Fragment, useState, useEffect } from 'react'

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
  fgmiss_0_39: -3,
  fgmiss_40_49: -2,
  fgmiss_50_plus: -1,
  xpm: 1,
  xpmiss: -1,
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
  // IDP (individual defensive players). Industry-standard defaults; only
  // apply when the player has the corresponding idp_* stat row, so leaving
  // these in the rule set is a no-op for team-DEF leagues.
  idp_tkl_solo: 1,
  idp_tkl_ast: 0.5,
  idp_tkl_loss: 2,
  idp_sack: 2,
  idp_int: 3,
  idp_pass_def: 1,
  idp_qb_hit: 0,
  idp_ff: 2,
  idp_fum_rec: 2,
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

function NumberField({ label, value, onChange, step = 0.5, hint, info }) {
  const [showInfo, setShowInfo] = useState(false)
  // Keep a local string so the input can transiently be empty (or just "-"
  // or ".") while the user is typing without snapping back to 0. Previous
  // controlled-with-parseFloat approach turned "" → 0 on every keystroke,
  // making it impossible to backspace through a value and type a fresh one.
  const [text, setText] = useState(() => String(value ?? 0))

  // Resync if the parent value changes from elsewhere (preset switch, etc.),
  // but only when our local text doesn't already represent that number — so
  // we don't clobber mid-edit state.
  useEffect(() => {
    const parsed = parseFloat(text)
    if (Number.isNaN(parsed) || parsed !== (value ?? 0)) {
      setText(String(value ?? 0))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <label className="block">
      <span className="text-[10px] uppercase text-text-muted tracking-wider mb-1 flex items-center gap-1">
        {label}
        {info && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setShowInfo(!showInfo) }}
            aria-label={`About ${label}`}
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-text-muted/40 text-[9px] font-bold text-text-muted hover:text-text-primary hover:border-text-primary/60 transition-colors"
          >
            i
          </button>
        )}
      </span>
      {info && showInfo && (
        <div className="text-[10px] text-text-secondary bg-bg-primary/50 border border-text-primary/10 rounded px-2 py-1.5 mb-1 leading-snug">
          {info}
        </div>
      )}
      <input
        type="number"
        step={step}
        value={text}
        onChange={(e) => {
          const v = e.target.value
          setText(v)
          // Empty / partial-typing states ("-", ".") don't commit; the user
          // is still typing. Commit as soon as it's a real number.
          if (v === '' || v === '-' || v === '.') return
          const n = parseFloat(v)
          if (!Number.isNaN(n)) onChange(n)
        }}
        onBlur={() => {
          if (text === '' || text === '-' || text === '.') {
            setText('0')
            onChange(0)
          }
        }}
        className="w-full bg-bg-input border border-border rounded-lg px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent"
      />
      {hint && <div className="text-[9px] text-text-muted mt-0.5">{hint}</div>}
    </label>
  )
}

export default function ScoringRulesEditor({ value, onChange, defenseMode }) {
  const rules = value || DEFAULT_RULES
  // 'def' → only Team Defense, 'idp' → only IDP, anything else → both
  // (back-compat: callers that don't pass the prop see both sections).
  const showTeamDef = defenseMode !== 'idp'
  const showIdp = defenseMode !== 'def'
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
    } else {
      // "Custom" is a no-op for the rules themselves (it just flips the
      // indicator), so on its own it confuses users. Auto-expand Advanced
      // so they can immediately see and edit the per-stat fields.
      setAdvancedOpen(true)
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
    <div className="space-y-3 rounded-xl border border-text-primary/20 p-4 bg-bg-primary/40">
      {/* Preset picker (no inner label — the outer field already says "Scoring") */}
      <div>
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
        className="flex items-center gap-2 text-sm font-semibold text-accent hover:text-accent-hover"
      >
        <span className={`transition-transform ${advancedOpen ? 'rotate-90' : ''}`}>▶</span>
        Advanced
      </button>

      {advancedOpen && (
        <div className="space-y-5">
          {/* Passing */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Passing</h4>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Pts per 25 Yds" value={Math.round(rules.pass_yd * 25 * 100) / 100} onChange={(v) => set('pass_yd', v / 25)} step={0.5} />
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

          {/* Kicker — range × make/miss grid */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Kicker</h4>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-2 items-center">
              <span />
              <span className="text-[10px] uppercase tracking-wider text-text-muted text-center w-20">Make</span>
              <span className="text-[10px] uppercase tracking-wider text-text-muted text-center w-20">Miss</span>
              {[
                { range: 'FG 0–39 yds', mk: 'fgm_0_39', ms: 'fgmiss_0_39' },
                { range: 'FG 40–49 yds', mk: 'fgm_40_49', ms: 'fgmiss_40_49' },
                { range: 'FG 50+ yds', mk: 'fgm_50_plus', ms: 'fgmiss_50_plus' },
                { range: 'Extra Point', mk: 'xpm', ms: 'xpmiss' },
              ].map((row) => (
                <Fragment key={row.range}>
                  <span className="text-xs text-text-secondary">{row.range}</span>
                  <input
                    type="number"
                    step={0.5}
                    value={rules[row.mk] ?? 0}
                    onChange={(e) => set(row.mk, parseFloat(e.target.value) || 0)}
                    className="w-20 bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary text-center focus:outline-none focus:border-accent"
                  />
                  <input
                    type="number"
                    step={0.5}
                    value={rules[row.ms] ?? 0}
                    onChange={(e) => set(row.ms, parseFloat(e.target.value) || 0)}
                    className="w-20 bg-bg-input border border-border rounded-lg px-2 py-1.5 text-sm text-text-primary text-center focus:outline-none focus:border-accent"
                  />
                </Fragment>
              ))}
            </div>
          </div>

          {/* Defense */}
          {showTeamDef && (
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
                    <span className="text-text-muted w-20">
                      {b.max >= 999
                        ? `${((rules.def_pa_brackets[i - 1]?.max ?? -1) + 1)}+ pts`
                        : `≤ ${b.max} pts`}
                    </span>
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
          )}

          {/* IDP — Individual Defensive Players */}
          {showIdp && (
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">IDP <span className="text-text-muted normal-case font-normal tracking-normal">(Individual Defensive Players)</span></h4>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Tackle (Solo)" value={rules.idp_tkl_solo} onChange={(v) => set('idp_tkl_solo', v)} step={0.5} />
              <NumberField label="Tackle (Assist)" value={rules.idp_tkl_ast} onChange={(v) => set('idp_tkl_ast', v)} step={0.5} />
              <NumberField label="Tackle for Loss" value={rules.idp_tkl_loss} onChange={(v) => set('idp_tkl_loss', v)} step={0.5} info="TFLs stack with solo tackle. Every tackle for loss is also credited as a solo tackle in NFL play-by-play data — so a TFL actually nets Tackle for Loss + Tackle (Solo) points combined. At defaults that's 2 + 1 = 3 pts per TFL." />
              <NumberField label="Sack" value={rules.idp_sack} onChange={(v) => set('idp_sack', v)} step={0.5} info="Sacks stack with solo tackle + tackle for loss. So a defender's sack actually nets Sack + Tackle (Solo) + Tackle for Loss points combined — at defaults that's 2 + 1 + 2 = 5 pts per sack." />
              <NumberField label="INT" value={rules.idp_int} onChange={(v) => set('idp_int', v)} step={1} />
              <NumberField label="Pass Defended" value={rules.idp_pass_def} onChange={(v) => set('idp_pass_def', v)} step={0.5} />
              <NumberField label="QB Hit" value={rules.idp_qb_hit} onChange={(v) => set('idp_qb_hit', v)} step={0.5} />
              <NumberField label="Forced Fumble" value={rules.idp_ff} onChange={(v) => set('idp_ff', v)} step={1} />
              <NumberField label="Fumble Recovery" value={rules.idp_fum_rec} onChange={(v) => set('idp_fum_rec', v)} step={1} />
            </div>
          </div>
          )}

          {/* Bonuses */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h4 className="text-sm font-bold uppercase tracking-wider text-text-primary">Bonuses</h4>
              <button
                type="button"
                role="switch"
                aria-checked={rules.bonuses_enabled}
                aria-label="Toggle bonuses"
                onClick={() => set('bonuses_enabled', !rules.bonuses_enabled)}
                className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                  rules.bonuses_enabled ? 'bg-accent' : 'bg-bg-secondary border border-text-primary/20'
                }`}
              >
                <span
                  className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                    rules.bonuses_enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
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
