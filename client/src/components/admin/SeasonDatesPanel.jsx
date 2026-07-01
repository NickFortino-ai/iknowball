import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { toast } from '../ui/Toast'

const SPORT_OPTIONS = [
  { key: 'americanfootball_nfl', label: 'NFL' },
  { key: 'basketball_nba', label: 'NBA' },
  { key: 'baseball_mlb', label: 'MLB' },
  { key: 'icehockey_nhl', label: 'NHL' },
  { key: 'basketball_wnba', label: 'WNBA' },
  { key: 'soccer_usa_mls', label: 'MLS' },
  { key: 'basketball_ncaab', label: 'NCAAB' },
  { key: 'basketball_wncaab', label: 'WNCAAB' },
  { key: 'americanfootball_ncaaf', label: 'NCAAF' },
  { key: 'americanfootball_ufl', label: 'UFL' },
]

// "End of today PT" as an ISO timestamp, in the same convention used by
// parseEndDate on the server: next day 10:00 UTC = 3 AM PT next day.
// Anything before this moment is "today PT or earlier" — the right cap
// for "playoffs just ended, close out the leagues."
function endOfTodayPtIso() {
  const ptDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const d = new Date(`${ptDateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(10, 0, 0, 0)
  return d.toISOString()
}

export default function SeasonDatesPanel() {
  const qc = useQueryClient()
  const { data: seasonDates, isLoading } = useQuery({
    queryKey: ['admin', 'season-dates'],
    queryFn: () => api.get('/admin/season-dates'),
  })

  const [sportKey, setSportKey] = useState('')
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear())
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [playoffEndsAt, setPlayoffEndsAt] = useState('')

  const saveMutation = useMutation({
    mutationFn: (body) => api.post('/admin/season-dates', body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin', 'season-dates'] })
      toast('Season dates saved — full_season leagues clamped', 'success')
      setSportKey('')
      setStartsAt('')
      setEndsAt('')
      setPlayoffEndsAt('')
    },
    onError: (err) => toast(err.message || 'Failed to save', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/admin/season-dates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'season-dates'] })
      toast('Deleted', 'success')
    },
  })

  function handleSave() {
    if (!sportKey || !endsAt) {
      toast('Select a sport and enter a regular season end date', 'error')
      return
    }
    saveMutation.mutate({
      sport_key: sportKey,
      season_year: Number(seasonYear),
      regular_season_starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      regular_season_ends_at: new Date(endsAt).toISOString(),
      playoff_ends_at: playoffEndsAt ? new Date(playoffEndsAt).toISOString() : null,
    })
  }

  function handleMarkPlayoffsEnded(sd) {
    const label = SPORT_OPTIONS.find((s) => s.key === sd.sport_key)?.label || sd.sport_key
    if (!confirm(`Mark ${label} playoffs as ended (today)?\n\nAll full_season ${label} leagues with end dates beyond today will be clamped to today and completed within seconds.`)) {
      return
    }
    saveMutation.mutate({
      sport_key: sd.sport_key,
      season_year: sd.season_year,
      regular_season_starts_at: sd.regular_season_starts_at || null,
      regular_season_ends_at: sd.regular_season_ends_at,
      playoff_ends_at: endOfTodayPtIso(),
    })
  }

  const sportLabel = (key) => SPORT_OPTIONS.find((s) => s.key === key)?.label || key

  return (
    <div>
      <h2 className="font-display text-xl mb-4">Season End Dates</h2>
      <p className="text-sm text-text-muted mb-6">
        Set the regular season and (optionally) postseason end dates for a sport. Full-season leagues (Pick'em, DFS, Salary Cap, HR Derby, TD Pass) get clamped to the playoff end if set, otherwise to the regular season end — so they complete and award points on time.
      </p>

      <div className="bg-bg-primary rounded-xl border border-text-primary/20 p-4 mb-6">
        <div className="grid sm:grid-cols-6 gap-3 mb-3">
          <div>
            <label className="text-xs text-text-muted mb-1 block">Sport</label>
            <select
              value={sportKey}
              onChange={(e) => setSportKey(e.target.value)}
              className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
            >
              <option value="">Select sport...</option>
              {SPORT_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">Season Year</label>
            <input
              type="number"
              value={seasonYear}
              onChange={(e) => setSeasonYear(e.target.value)}
              className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-text-muted mb-1 block">Regular Season Start (optional)</label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-text-muted mb-1 block">Regular Season End</label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-text-muted mb-1 block">Playoff End (optional)</label>
            <input
              type="datetime-local"
              value={playoffEndsAt}
              onChange={(e) => setPlayoffEndsAt(e.target.value)}
              className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
            />
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="bg-accent hover:bg-accent-hover text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save & Apply'}
        </button>
      </div>

      {isLoading ? (
        <div className="text-text-muted text-sm">Loading...</div>
      ) : !seasonDates?.length ? (
        <div className="text-text-muted text-sm">No season end dates set yet.</div>
      ) : (
        <div className="space-y-2">
          {seasonDates.map((sd) => (
            <div key={sd.id} className="flex items-center justify-between bg-bg-primary rounded-xl border border-text-primary/20 px-4 py-3">
              <div>
                <span className="font-semibold text-sm">{sportLabel(sd.sport_key)}</span>
                <span className="text-text-muted text-sm ml-2">{sd.season_year}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm text-text-secondary">
                    Reg {new Date(sd.regular_season_ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  {sd.playoff_ends_at && (
                    <div className="text-xs text-text-muted">
                      Playoffs {new Date(sd.playoff_ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleMarkPlayoffsEnded(sd)}
                  disabled={saveMutation.isPending}
                  className="text-xs bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40 rounded-lg px-3 py-1.5 font-semibold transition-colors disabled:opacity-50"
                  title="Set playoff end to today and close out all full_season leagues for this sport"
                >
                  Mark playoffs ended
                </button>
                <button
                  onClick={() => deleteMutation.mutate(sd.id)}
                  className="text-xs text-incorrect hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
