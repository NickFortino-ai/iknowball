import { useState, useEffect } from 'react'
import { useAdminDFSSalaries, useUpdateDFSSalary, useResetDFSSalary, useSyncNFLSalaries, usePublishNFLSalaries, useAdminDFSUnpublishedCount, useToggleDFSHidden, useAdminCurrentNflWeek } from '../../hooks/useAdmin'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../ui/Toast'

const POSITION_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'DEF']

// Salary cap runs the NFL REGULAR season only. Weeks 19-22 (playoffs) have
// no salary rows, so allowing them just yields a confusing empty table
// with a "Generate Week 20" prompt.
const MAX_WEEK = 18

// NFL seasons are named after the year they START (Sept Y → Feb Y+1).
// Default to the "current" season from an admin's POV:
//   Mar-Dec → current calendar year (offseason prep through regular season)
//   Jan-Feb → previous year (playoffs of the season that began last fall)
// The WEEK is not guessable from the calendar, so it comes from the server
// (nfl_schedule) — see the effect below. Week 1 is only the placeholder
// shown for the moment before that resolves.
function defaultSeason() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1-12
  return month <= 2 ? year - 1 : year
}

export default function NFLSalariesEditor() {
  const { profile } = useAuth()
  const isHelperAdmin = profile?.admin_role === 'helper'
  const { data: current } = useAdminCurrentNflWeek()
  const [week, setWeek] = useState(1)
  const [season, setSeason] = useState(defaultSeason())
  const [weekPinned, setWeekPinned] = useState(false)
  const [position, setPosition] = useState('ALL')
  const [search, setSearch] = useState('')

  // Snap to the live week once the server answers, unless the admin has
  // already moved the selector themselves.
  useEffect(() => {
    if (weekPinned || !current) return
    if (Number.isInteger(current.week) && current.week >= 1) {
      setWeek(Math.min(current.week, MAX_WEEK))
    }
    if (Number.isInteger(current.season)) setSeason(current.season)
  }, [current, weekPinned])

  const isCurrentWeek = current?.week != null && week === current.week

  const { data, isLoading, error, refetch } = useAdminDFSSalaries({ week, season, position, search })
  const updateSalary = useUpdateDFSSalary()
  const resetSalary = useResetDFSSalary()
  const generateSalaries = useSyncNFLSalaries()
  const publishSalaries = usePublishNFLSalaries()
  const toggleHidden = useToggleDFSHidden()
  const { data: unpubData, refetch: refetchUnpub } = useAdminDFSUnpublishedCount({ week, season })
  const unpubCount = unpubData?.count ?? 0
  const hasDrafts = unpubCount > 0

  async function handleGenerate() {
    if (!confirm(`Generate algorithmic salaries for Week ${week}, ${season}?\n\nNew rows start as drafts — users won't see them until you Publish. Manually-edited rows are preserved on future regens.`)) return
    try {
      await generateSalaries.mutateAsync({ week, season })
      toast(`Started generation for Week ${week}. Refresh in a few seconds — this runs in the background.`, 'success')
      setTimeout(() => { refetch(); refetchUnpub() }, 3000)
    } catch (err) {
      toast(err.message || 'Failed to start generation', 'error')
    }
  }

  async function handlePublish() {
    if (!confirm(`Publish ${unpubCount} draft ${unpubCount === 1 ? 'row' : 'rows'} for Week ${week}?\n\nUsers will immediately see these prices in the salary cap lineup builder.`)) return
    try {
      const result = await publishSalaries.mutateAsync({ week, season })
      toast(`Published ${result.published} price${result.published === 1 ? '' : 's'} for Week ${week}.`, 'success')
    } catch (err) {
      toast(err.message || 'Failed to publish', 'error')
    }
  }

  const rows = data?.rows || []
  const totalCount = data?.count || 0

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl mb-1">NFL Salary Editor</h2>
        <p className="text-xs text-text-muted">
          Prices generate automatically each week and publish to users <strong>Tuesday at 10:00 AM PT</strong>.
          Edit any player and press Save — edits before the 10 AM release go out with it, edits after it
          are live immediately. Overrides survive future regens until you Reset.
          Algorithm $ is what the generator computed; Current Salary is what users see.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-text-primary/20 bg-bg-primary/40 p-3">
        <label className="text-xs">
          <div className="mb-1 text-text-muted">Week</div>
          <input
            type="number"
            min="1"
            max={MAX_WEEK}
            value={week}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              setWeekPinned(true)
              setWeek(Math.min(Math.max(Number.isInteger(v) ? v : 1, 1), MAX_WEEK))
            }}
            className={`w-20 rounded-md border bg-bg-primary px-2 py-1 text-sm ${
              isCurrentWeek ? 'border-text-primary/20' : 'border-yellow-500/60'
            }`}
          />
        </label>
        {/* Season is derived, not chosen. A typo here used to render an
            empty table whose empty state invited "Generate Week N" — i.e.
            it made fabricating a bogus historical week one click away. */}
        <div className="text-xs">
          <div className="mb-1 text-text-muted">Season</div>
          <div className="w-24 rounded-md border border-transparent px-2 py-1 text-sm text-text-muted tabular-nums">
            {season}
          </div>
        </div>
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
        <div className="ml-auto flex items-center gap-3">
          {/* Always rendered, both states. The single most useful fact on
              this page is whether the week users are about to draft from is
              live yet — showing it only in the draft state meant "no badge"
              was ambiguous between live and not-yet-generated. */}
          {!isLoading && totalCount > 0 && (
            hasDrafts ? (
              <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-yellow-500">
                {unpubCount} draft{unpubCount === 1 ? '' : 's'} — users can't see
              </span>
            ) : (
              <span className="rounded-full border border-correct/40 bg-correct/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-correct">
                Live to users
              </span>
            )
          )}
          {/* Full admins only. The weekly cron generates every week on its
              own; this is the recovery lever for when it doesn't. Helpers
              get the editor without the one button that can reshape a
              whole week. Server enforces it too (requireFullAdmin). */}
          {!isHelperAdmin && (
            <button
              onClick={handleGenerate}
              disabled={generateSalaries.isPending}
              className="rounded-lg border border-accent px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
              title="Recovery only — the weekly cron normally does this. Force-generates algorithmic salaries for the selected week. New rows start as drafts. Preserves manual edits already saved for that week."
            >
              {generateSalaries.isPending ? 'Starting…' : `Generate Week ${week}`}
            </button>
          )}
          {hasDrafts && (
            <button
              onClick={handlePublish}
              disabled={publishSalaries.isPending}
              className="rounded-lg bg-correct px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-correct/90 disabled:opacity-50"
              title="Publish all draft prices for this week so users can see them in the salary cap lineup builder."
            >
              {publishSalaries.isPending ? 'Publishing…' : `Publish Week ${week}`}
            </button>
          )}
          <div className="text-xs text-text-muted">
            {isLoading ? 'Loading…' : `${totalCount} player${totalCount === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>

      {/* Editing a week that isn't live changes nothing users will see.
          Silent before — the panel opened on Week 1 year-round. */}
      {current?.week != null && !isCurrentWeek && (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-500">
          You're viewing <strong>Week {week}</strong>, but the live NFL week is{' '}
          <strong>Week {current.week}</strong>. Edits here won't affect the pool users
          are drafting from.{' '}
          <button onClick={() => { setWeekPinned(false); setWeek(current.week) }} className="underline font-semibold">
            Go to Week {current.week}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-incorrect/40 bg-incorrect/10 p-3 text-sm text-incorrect">
          {error.message || 'Failed to load salaries.'}
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="rounded-md border border-text-primary/10 bg-bg-primary/40 p-6 text-center text-sm text-text-muted">
          No salary rows for Week {week}, {season}.{' '}
          {isHelperAdmin
            ? 'These generate automatically each week and publish to users Tuesday at 10:00 AM PT.'
            : <>They generate automatically each week — use <span className="font-semibold text-accent">Generate Week {week}</span> above only if that didn't run.</>}
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-text-primary/20">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-bg-primary/60 text-xs uppercase text-text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Player</th>
                <th className="px-2 py-2 text-left">Pos</th>
                <th className="px-2 py-2 text-left">Team</th>
                <th className="px-2 py-2 text-center">Bye</th>
                <th className="px-3 py-2 text-right">Algorithm $</th>
                <th className="px-3 py-2 text-right">Current Salary</th>
                <th className="px-3 py-2 text-center">Manual?</th>
                <th className="px-3 py-2 text-center">Visible?</th>
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
                  onToggleHidden={async () => {
                    try {
                      await toggleHidden.mutateAsync({ id: row.id, hidden: !row.hidden })
                      toast(`${row.hidden ? 'Showing' : 'Hiding'} ${row.full_name}`, 'success')
                    } catch (err) {
                      toast(err.message || 'Failed to toggle visibility', 'error')
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

function SalaryRow({ row, onSave, onReset, onToggleHidden }) {
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
    <tr className={`border-t border-text-primary/10 ${row.hidden ? 'opacity-50' : ''} ${row.manually_set ? 'bg-accent/5' : ''}`}>
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
              <div
                className={`text-[10px] uppercase ${
                  /^questionable$/i.test(row.injury_status)
                    ? 'text-yellow-400'
                    : 'text-incorrect'
                }`}
              >
                {row.injury_status}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-2 py-2 text-text-muted">{row.position}</td>
      <td className="px-2 py-2 text-text-muted">{row.team}</td>
      <td className="px-2 py-2 text-center text-text-muted tabular-nums">
        {row.bye_week != null ? row.bye_week : '—'}
      </td>
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
      <td className="px-3 py-2 text-center">
        {/* Only render the toggle for the players who actually need it:
            low-salary QBs (deep-bench / practice-squad types users
            shouldn't be tempted to draft) OR any row already hidden
            (bye-week auto-hides, etc.) so admin can un-hide edge cases.
            Everyone else (starting QBs, all skill/DEF rows) shows
            nothing — no visual noise on players who'll never be hidden. */}
        {(row.hidden || (row.position === 'QB' && row.salary <= 5500)) ? (
          <button
            onClick={onToggleHidden}
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
              row.hidden
                ? 'bg-incorrect/20 text-incorrect hover:bg-incorrect/30'
                : 'bg-correct/20 text-correct hover:bg-correct/30'
            }`}
            title={row.hidden ? 'Hidden from user pool — click to show' : 'Visible to users — click to hide'}
          >
            {row.hidden ? 'HIDDEN' : 'SHOWN'}
          </button>
        ) : (
          <span className="text-[10px] text-text-muted">—</span>
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
