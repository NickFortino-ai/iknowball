import { useState, useMemo } from 'react'
import { useAdminDFSSalaries, useUpdateDFSSalary, useResetDFSSalary } from '../../hooks/useAdmin'
import { toast } from '../ui/Toast'

const POSITION_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'DEF']

// NFL season runs Sept-Feb; default to current week if in-season, else week 1.
// In offseason the admin will usually be QA-checking historical weeks anyway.
function defaultWeekAndSeason() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1-12
  // NFL season spans calendar years (Sept Y -> Feb Y+1). After Aug 1 use current year,
  // before Sept use prior year as the season.
  const season = month >= 8 ? year : year - 1
  return { week: 1, season }
}

export default function NFLSalariesEditor() {
  const { week: defaultWeek, season: defaultSeason } = defaultWeekAndSeason()
  const [week, setWeek] = useState(defaultWeek)
  const [season, setSeason] = useState(defaultSeason)
  const [position, setPosition] = useState('ALL')
  const [search, setSearch] = useState('')

  const { data, isLoading, error } = useAdminDFSSalaries({ week, season, position, search })
  const updateSalary = useUpdateDFSSalary()
  const resetSalary = useResetDFSSalary()

  const rows = data?.rows || []
  const totalCount = data?.count || 0

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl mb-1">NFL Salary Editor</h2>
        <p className="text-xs text-text-muted">
          Manually override prices for any player. Edits are preserved across regens until you reset.
          Algorithm $ shows what the generator computed; salary is what users see.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-text-primary/20 bg-bg-primary/40 p-3">
        <label className="text-xs">
          <div className="mb-1 text-text-muted">Week</div>
          <input
            type="number"
            min="1"
            max="22"
            value={week}
            onChange={(e) => setWeek(parseInt(e.target.value, 10) || 1)}
            className="w-20 rounded-md border border-text-primary/20 bg-bg-primary px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs">
          <div className="mb-1 text-text-muted">Season</div>
          <input
            type="number"
            min="2020"
            max="2035"
            value={season}
            onChange={(e) => setSeason(parseInt(e.target.value, 10) || 2026)}
            className="w-24 rounded-md border border-text-primary/20 bg-bg-primary px-2 py-1 text-sm"
          />
        </label>
        <div className="text-xs">
          <div className="mb-1 text-text-muted">Position</div>
          <div className="flex gap-1">
            {POSITION_FILTERS.map((pos) => (
              <button
                key={pos}
                onClick={() => setPosition(pos)}
                className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                  position === pos
                    ? 'bg-accent text-white'
                    : 'border border-text-primary/20 text-text-primary hover:bg-bg-primary'
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>
        <label className="text-xs flex-1 min-w-[180px]">
          <div className="mb-1 text-text-muted">Search by name</div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. Jefferson"
            className="w-full rounded-md border border-text-primary/20 bg-bg-primary px-2 py-1 text-sm"
          />
        </label>
        <div className="text-xs text-text-muted ml-auto">
          {isLoading ? 'Loading…' : `${totalCount} player${totalCount === 1 ? '' : 's'}`}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-incorrect/40 bg-incorrect/10 p-3 text-sm text-incorrect">
          {error.message || 'Failed to load salaries.'}
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="rounded-md border border-text-primary/10 bg-bg-primary/40 p-6 text-center text-sm text-text-muted">
          No salary rows for week {week}, season {season}. Generate salaries first from the admin panel.
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-text-primary/20">
          <table className="w-full text-sm">
            <thead className="bg-bg-primary/60 text-xs uppercase text-text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Player</th>
                <th className="px-2 py-2 text-left">Pos</th>
                <th className="px-2 py-2 text-left">Team</th>
                <th className="px-3 py-2 text-right">Algorithm $</th>
                <th className="px-3 py-2 text-right">Current Salary</th>
                <th className="px-3 py-2 text-center">Manual?</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <SalaryRow
                  key={row.id}
                  row={row}
                  onSave={async (newSalary) => {
                    try {
                      await updateSalary.mutateAsync({ id: row.id, salary: newSalary })
                      toast(`Saved ${row.full_name}: $${newSalary.toLocaleString()}`, 'success')
                    } catch (err) {
                      toast(err.message || 'Failed to save', 'error')
                    }
                  }}
                  onReset={async () => {
                    try {
                      await resetSalary.mutateAsync(row.id)
                      toast(`Reset ${row.full_name} to algorithm price`, 'success')
                    } catch (err) {
                      toast(err.message || 'Failed to reset', 'error')
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SalaryRow({ row, onSave, onReset }) {
  const [draft, setDraft] = useState(String(row.salary))
  const [saving, setSaving] = useState(false)
  const dirty = parseInt(draft, 10) !== row.salary

  async function handleSave() {
    const v = parseInt(draft, 10)
    if (!Number.isInteger(v) || v < 0) return
    setSaving(true)
    await onSave(v)
    setSaving(false)
  }

  return (
    <tr className={`border-t border-text-primary/10 ${row.manually_set ? 'bg-accent/5' : ''}`}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {row.headshot_url ? (
            <img
              src={row.headshot_url}
              alt=""
              className="h-9 w-9 flex-shrink-0 rounded-full bg-bg-primary object-cover"
            />
          ) : (
            <div className="h-9 w-9 flex-shrink-0 rounded-full bg-bg-primary" />
          )}
          <div className="min-w-0">
            <div className="font-medium truncate">{row.full_name}</div>
            {row.injury_status && (
              <div className="text-[10px] uppercase text-incorrect">{row.injury_status}</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-2 py-2 text-text-muted">{row.position}</td>
      <td className="px-2 py-2 text-text-muted">{row.team}</td>
      <td className="px-3 py-2 text-right text-text-muted tabular-nums">
        {row.algorithm_salary != null ? `$${row.algorithm_salary.toLocaleString()}` : '—'}
      </td>
      <td className="px-3 py-2 text-right">
        <input
          type="number"
          step="100"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={`w-24 rounded-md border bg-bg-primary px-2 py-1 text-right text-sm tabular-nums ${
            dirty ? 'border-accent' : 'border-text-primary/20'
          }`}
        />
      </td>
      <td className="px-3 py-2 text-center">
        {row.manually_set ? (
          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">
            MANUAL
          </span>
        ) : (
          <span className="text-[10px] text-text-muted">algo</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-1">
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="rounded-md border border-text-primary/20 px-2 py-1 text-xs font-semibold hover:bg-bg-primary disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {row.manually_set && (
            <button
              onClick={onReset}
              className="rounded-md border border-text-primary/20 px-2 py-1 text-xs font-semibold text-text-muted hover:bg-bg-primary"
              title="Restore the algorithm-computed price"
            >
              Reset
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
