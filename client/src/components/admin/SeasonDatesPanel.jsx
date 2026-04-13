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
]

export default function SeasonDatesPanel() {
  const qc = useQueryClient()
  const { data: seasonDates, isLoading } = useQuery({
    queryKey: ['admin', 'season-dates'],
    queryFn: () => api.get('/admin/season-dates'),
  })

  const [sportKey, setSportKey] = useState('')
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear())
  const [endsAt, setEndsAt] = useState('')

  const saveMutation = useMutation({
    mutationFn: (body) => api.post('/admin/season-dates', body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin', 'season-dates'] })
      toast('Season end date saved — full_season leagues clamped', 'success')
      setSportKey('')
      setEndsAt('')
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
      toast('Select a sport and enter an end date', 'error')
      return
    }
    saveMutation.mutate({
      sport_key: sportKey,
      season_year: Number(seasonYear),
      regular_season_ends_at: new Date(endsAt).toISOString(),
    })
  }

  const sportLabel = (key) => SPORT_OPTIONS.find((s) => s.key === key)?.label || key

  return (
    <div>
      <h2 className="font-display text-xl mb-4">Regular Season End Dates</h2>
      <p className="text-sm text-text-muted mb-6">
        Set the regular season end date for a sport. All full-season leagues (Pick'em, DFS, Salary Cap, HR Derby, TD Pass) in that sport will have their end dates clamped so they complete and award points on time.
      </p>

      <div className="bg-bg-primary rounded-xl border border-text-primary/20 p-4 mb-6">
        <div className="grid sm:grid-cols-4 gap-3 mb-3">
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
          <div>
            <label className="text-xs text-text-muted mb-1 block">Regular Season End Date</label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="w-full bg-accent hover:bg-accent-hover text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save & Apply'}
            </button>
          </div>
        </div>
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
                <span className="text-sm text-text-secondary">
                  Ends {new Date(sd.regular_season_ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
                </span>
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
