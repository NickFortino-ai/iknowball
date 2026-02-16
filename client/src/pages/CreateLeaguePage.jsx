import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateLeague, useBracketTemplatesActive } from '../hooks/useLeagues'
import { toast } from '../components/ui/Toast'

const FORMAT_OPTIONS = [
  { value: 'pickem', label: "Pick'em", description: 'Pick winners against the spread with odds-based scoring' },
  { value: 'survivor', label: 'Survivor', description: 'Pick one team per week — lose and you are eliminated' },
  { value: 'squares', label: 'Squares', description: '10x10 grid tied to a single game with quarter-by-quarter scoring' },
  { value: 'bracket', label: 'Bracket', description: 'Fill out a tournament bracket with escalating points per round' },
]

const SPORT_OPTIONS = [
  { value: 'americanfootball_nfl', label: 'NFL' },
  { value: 'basketball_nba', label: 'NBA' },
  { value: 'baseball_mlb', label: 'MLB' },
  { value: 'basketball_ncaab', label: 'NCAAB' },
  { value: 'americanfootball_ncaaf', label: 'NCAAF' },
  { value: 'basketball_wnba', label: 'WNBA' },
  { value: 'all', label: 'All Sports' },
]

const DAILY_ELIGIBLE_SPORTS = new Set(['basketball_nba', 'basketball_ncaab', 'basketball_wnba', 'baseball_mlb', 'all'])

const DURATION_OPTIONS = [
  { value: 'this_week', label: 'This Week Only' },
  { value: 'custom_range', label: 'Custom Date Range' },
  { value: 'full_season', label: 'Full Season' },
  { value: 'playoffs_only', label: 'Playoffs Only' },
]

export default function CreateLeaguePage() {
  const navigate = useNavigate()
  const createLeague = useCreateLeague()

  const [name, setName] = useState('')
  const [format, setFormat] = useState('')
  const [sport, setSport] = useState('')
  const [duration, setDuration] = useState('')
  const [maxMembers, setMaxMembers] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')

  // Bracket settings
  const [templateId, setTemplateId] = useState('')
  const [locksAt, setLocksAt] = useState('')
  const { data: bracketTemplates } = useBracketTemplatesActive(sport !== 'all' ? sport : undefined)

  // Format-specific settings
  const [lockOddsAt, setLockOddsAt] = useState('game_start')
  const [gamesPerWeek, setGamesPerWeek] = useState('')
  const [lives, setLives] = useState(1)
  const [pickFrequency, setPickFrequency] = useState('weekly')
  const [allEliminatedSurvive, setAllEliminatedSurvive] = useState(true)
  const [winnerBonus, setWinnerBonus] = useState(100)
  const [assignmentMethod, setAssignmentMethod] = useState('self_select')
  const [squaresPerMember, setSquaresPerMember] = useState('')
  const [pointsPerQuarter, setPointsPerQuarter] = useState([25, 25, 25, 50])

  async function handleSubmit(e) {
    e.preventDefault()

    const settings = {}
    if (format === 'pickem') {
      if (gamesPerWeek) settings.games_per_week = parseInt(gamesPerWeek, 10)
      if (lockOddsAt !== 'game_start') settings.lock_odds_at = lockOddsAt
    }
    if (format === 'survivor') {
      settings.lives = lives
      settings.pick_frequency = pickFrequency
      settings.all_eliminated_survive = allEliminatedSurvive
      settings.winner_bonus = winnerBonus
    }
    if (format === 'squares') {
      settings.assignment_method = assignmentMethod
      settings.points_per_quarter = pointsPerQuarter
      if (squaresPerMember) settings.squares_per_member = parseInt(squaresPerMember, 10)
    }
    if (format === 'bracket') {
      settings.template_id = templateId
      settings.locks_at = locksAt
    }

    try {
      const league = await createLeague.mutateAsync({
        name,
        format,
        sport,
        duration,
        max_members: maxMembers ? parseInt(maxMembers, 10) : undefined,
        starts_at: startsAt || undefined,
        ends_at: endsAt || undefined,
        settings,
      })
      toast('League created!', 'success')
      navigate(`/leagues/${league.id}`)
    } catch (err) {
      toast(err.message || 'Failed to create league', 'error')
    }
  }

  const canSubmit = name && format && sport && duration && (format !== 'bracket' || (templateId && locksAt))

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-6">Create a League</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* League Name */}
        <div>
          <label className="block text-sm font-semibold text-text-secondary mb-2">League Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Awesome League"
            maxLength={50}
            className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        {/* Format */}
        <div>
          <label className="block text-sm font-semibold text-text-secondary mb-2">Format</label>
          <div className="space-y-2">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFormat(opt.value)}
                className={`w-full text-left p-4 rounded-xl border transition-colors ${
                  format === opt.value
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-bg-card hover:bg-bg-card-hover'
                }`}
              >
                <div className="font-semibold text-sm">{opt.label}</div>
                <div className="text-xs text-text-muted mt-1">{opt.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Sport */}
        <div>
          <label className="block text-sm font-semibold text-text-secondary mb-2">Sport</label>
          <div className="flex gap-2 flex-wrap">
            {SPORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setSport(opt.value)
                  if (!DAILY_ELIGIBLE_SPORTS.has(opt.value)) setPickFrequency('weekly')
                }}
                className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  sport === opt.value
                    ? 'bg-accent text-white'
                    : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="block text-sm font-semibold text-text-secondary mb-2">Duration</label>
          <div className="grid grid-cols-2 gap-2">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDuration(opt.value)}
                className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  duration === opt.value
                    ? 'bg-accent text-white'
                    : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date range */}
        {duration === 'custom_range' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Start Date</label>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">End Date</label>
              <input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        )}

        {/* Max Members */}
        <div>
          <label className="block text-sm font-semibold text-text-secondary mb-2">
            Max Members <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <input
            type="number"
            value={maxMembers}
            onChange={(e) => setMaxMembers(e.target.value)}
            placeholder="No limit"
            min={2}
            className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        {/* Format-specific settings */}
        {format === 'pickem' && (
          <div className="bg-bg-card rounded-xl border border-border p-4 space-y-4">
            <h3 className="font-display text-sm text-text-secondary mb-1">Pick'em Settings</h3>
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Games per week <span className="text-text-muted">(leave empty for all games)</span>
              </label>
              <input
                type="number"
                value={gamesPerWeek}
                onChange={(e) => setGamesPerWeek(e.target.value)}
                placeholder="All games"
                min={1}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-2">Lock Odds</label>
              <div className="flex gap-2">
                {[
                  { value: 'game_start', label: 'At Game Start' },
                  { value: 'submission', label: 'At Submission' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLockOddsAt(opt.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      lockOddsAt === opt.value ? 'bg-accent text-white' : 'bg-bg-input text-text-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-text-muted mt-1">
                {lockOddsAt === 'submission'
                  ? 'Standings use odds from when each pick was submitted'
                  : 'Standings use odds from when the game starts (default)'}
              </div>
            </div>
          </div>
        )}

        {format === 'survivor' && (
          <div className="bg-bg-card rounded-xl border border-border p-4 space-y-4">
            <h3 className="font-display text-sm text-text-secondary mb-1">Survivor Settings</h3>
            <div>
              <label className="block text-xs text-text-muted mb-2">Lives</label>
              <div className="flex gap-2">
                {[1, 2].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setLives(n)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      lives === n ? 'bg-accent text-white' : 'bg-bg-input text-text-secondary'
                    }`}
                  >
                    {n} {n === 1 ? 'Life' : 'Lives'}
                  </button>
                ))}
              </div>
            </div>
            {DAILY_ELIGIBLE_SPORTS.has(sport) && (
              <div>
                <label className="block text-xs text-text-muted mb-2">Pick Frequency</label>
                <div className="flex gap-2">
                  {[
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'daily', label: 'Daily' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPickFrequency(opt.value)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        pickFrequency === opt.value ? 'bg-accent text-white' : 'bg-bg-input text-text-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {pickFrequency === 'daily' && (
                  <div className="text-[10px] text-text-muted mt-1">One pick per day instead of per week</div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-muted">
                If all eliminated in same {pickFrequency === 'daily' ? 'day' : 'week'}, all survive
              </label>
              <button
                type="button"
                onClick={() => setAllEliminatedSurvive(!allEliminatedSurvive)}
                className={`w-10 h-6 rounded-full transition-colors ${
                  allEliminatedSurvive ? 'bg-accent' : 'bg-bg-input'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-1 ${
                  allEliminatedSurvive ? 'translate-x-4' : ''
                }`} />
              </button>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Winner bonus points</label>
              <input
                type="number"
                value={winnerBonus}
                onChange={(e) => setWinnerBonus(parseInt(e.target.value, 10) || 0)}
                min={0}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        )}

        {format === 'squares' && (
          <div className="bg-bg-card rounded-xl border border-border p-4 space-y-4">
            <h3 className="font-display text-sm text-text-secondary mb-1">Squares Settings</h3>
            <div>
              <label className="block text-xs text-text-muted mb-2">Assignment Method</label>
              <div className="flex gap-2">
                {[
                  { value: 'self_select', label: 'Self-Select' },
                  { value: 'random', label: 'Random' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAssignmentMethod(opt.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      assignmentMethod === opt.value ? 'bg-accent text-white' : 'bg-bg-input text-text-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Squares per member <span className="text-text-muted">(auto-calculated if empty)</span>
              </label>
              <input
                type="number"
                value={squaresPerMember}
                onChange={(e) => setSquaresPerMember(e.target.value)}
                placeholder="Auto"
                min={1}
                max={100}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-2">Points per Quarter</label>
              <div className="grid grid-cols-4 gap-2">
                {['Q1', 'Q2', 'Q3', 'Q4'].map((label, i) => (
                  <div key={label}>
                    <div className="text-xs text-text-muted text-center mb-1">{label}</div>
                    <input
                      type="number"
                      value={pointsPerQuarter[i]}
                      onChange={(e) => {
                        const next = [...pointsPerQuarter]
                        next[i] = parseInt(e.target.value, 10) || 0
                        setPointsPerQuarter(next)
                      }}
                      min={0}
                      className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-center text-text-primary focus:outline-none focus:border-accent"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {format === 'bracket' && (
          <div className="bg-bg-card rounded-xl border border-border p-4 space-y-4">
            <h3 className="font-display text-sm text-text-secondary mb-1">Bracket Settings</h3>
            <div>
              <label className="block text-xs text-text-muted mb-2">Tournament Template</label>
              {bracketTemplates?.length > 0 ? (
                <div className="space-y-1">
                  {bracketTemplates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
                        templateId === t.id
                          ? 'border-accent bg-accent/10'
                          : 'border-border bg-bg-primary hover:bg-bg-card-hover'
                      }`}
                    >
                      <div className="font-semibold text-sm">{t.name}</div>
                      <div className="text-xs text-text-muted mt-0.5">
                        {t.team_count} teams &middot; {t.rounds?.length || 0} rounds
                        {t.description && ` — ${t.description}`}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-text-muted">
                  No bracket templates available{sport !== 'all' ? ' for this sport' : ''}. An admin must create one first.
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Bracket Lock Date/Time</label>
              <input
                type="datetime-local"
                value={locksAt}
                onChange={(e) => setLocksAt(e.target.value)}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
              />
              <div className="text-[10px] text-text-muted mt-1">
                Users must submit brackets before this time
              </div>
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit || createLeague.isPending}
          className="w-full py-3 rounded-xl font-display text-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createLeague.isPending ? 'Creating...' : 'Create League'}
        </button>
      </form>
    </div>
  )
}
