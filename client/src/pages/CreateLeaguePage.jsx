import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateLeague, useBracketTemplatesActive } from '../hooks/useLeagues'
import { useGames } from '../hooks/useGames'
import { toast } from '../components/ui/Toast'

const FORMAT_OPTIONS = [
  { value: 'fantasy', label: 'Fantasy Football', description: 'Draft players, set lineups, and compete head-to-head each week' },
  { value: 'pickem', label: "Pick'em", description: 'Pick winners against the spread with odds-based scoring' },
  { value: 'survivor', label: 'Survivor', description: 'Pick one team per week — lose and you are eliminated' },
  { value: 'bracket', label: 'Bracket', description: 'Fill out a tournament bracket with escalating points per round' },
  { value: 'squares', label: 'Squares', description: '10x10 grid tied to a single game with quarter-by-quarter scoring' },
]

const SPORT_OPTIONS = [
  { value: 'americanfootball_nfl', label: 'NFL' },
  { value: 'basketball_nba', label: 'NBA' },
  { value: 'baseball_mlb', label: 'MLB' },
  { value: 'basketball_ncaab', label: 'NCAAB' },
  { value: 'basketball_wncaab', label: 'WNCAAB' },
  { value: 'americanfootball_ncaaf', label: 'NCAAF' },
  { value: 'basketball_wnba', label: 'WNBA' },
  { value: 'all', label: 'All Sports' },
]

const DAILY_ELIGIBLE_SPORTS = new Set(['basketball_nba', 'basketball_ncaab', 'basketball_wncaab', 'basketball_wnba', 'baseball_mlb', 'all'])

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

  // Squares game picker
  const [gameId, setGameId] = useState('')
  const squaresSport = format === 'squares' && sport && sport !== 'all' ? sport : undefined
  const { data: squaresGames } = useGames(squaresSport, 'upcoming', 7)

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
  const [assignmentMethod, setAssignmentMethod] = useState('self_select')
  const [pointsPerQuarter, setPointsPerQuarter] = useState([25, 25, 25, 50])
  const [rowTeamName, setRowTeamName] = useState('')
  const [colTeamName, setColTeamName] = useState('')

  // Auto-select NFL for fantasy format
  useEffect(() => {
    if (format === 'fantasy') setSport('americanfootball_nfl')
  }, [format])

  // Fantasy settings
  const [scoringFormat, setScoringFormat] = useState('half_ppr')
  const [numTeams, setNumTeams] = useState(10)
  const [draftPickTimer, setDraftPickTimer] = useState(90)
  const [waiverType, setWaiverType] = useState('priority')
  const [tradeReview, setTradeReview] = useState('commissioner')
  const [playoffTeams, setPlayoffTeams] = useState(4)

  async function handleSubmit(e) {
    e.preventDefault()

    const settings = {}
    if (format === 'pickem') {
      if (gamesPerWeek) settings.games_per_week = parseInt(gamesPerWeek, 10)
      if (lockOddsAt !== 'game_start') settings.lock_odds_at = lockOddsAt
      settings.pick_frequency = pickFrequency
    }
    if (format === 'survivor') {
      settings.lives = lives
      settings.pick_frequency = pickFrequency
      settings.all_eliminated_survive = allEliminatedSurvive
    }
    if (format === 'squares') {
      settings.game_id = gameId
      settings.assignment_method = assignmentMethod
      settings.points_per_quarter = pointsPerQuarter
      if (rowTeamName) settings.row_team_name = rowTeamName
      if (colTeamName) settings.col_team_name = colTeamName
    }
    if (format === 'bracket') {
      settings.template_id = templateId
      settings.locks_at = locksAt ? new Date(locksAt).toISOString() : undefined
    }

    // Fantasy settings passed separately
    const fantasySettings = format === 'fantasy' ? {
      scoring_format: scoringFormat,
      num_teams: numTeams,
      draft_pick_timer: draftPickTimer,
      waiver_type: waiverType,
      trade_review: tradeReview,
      playoff_teams: playoffTeams,
    } : undefined

    try {
      const league = await createLeague.mutateAsync({
        name,
        format,
        sport: format === 'fantasy' ? 'americanfootball_nfl' : sport,
        duration: format === 'fantasy' ? 'full_season' : duration,
        max_members: format === 'fantasy' ? numTeams : maxMembers ? parseInt(maxMembers, 10) : undefined,
        starts_at: startsAt || undefined,
        ends_at: endsAt || undefined,
        settings,
        fantasy_settings: fantasySettings,
      })
      toast('League created!', 'success')
      navigate(`/leagues/${league.id}?invite=1`)
    } catch (err) {
      toast(err.message || 'Failed to create league', 'error')
    }
  }

  const canSubmit = name && format && sport && (format === 'fantasy' || duration)
    && (format !== 'bracket' || (templateId && locksAt))
    && (format !== 'squares' || gameId)

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
            className="w-full bg-transparent border border-text-primary/20 rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
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
                    : 'border-text-primary/20 hover:border-text-primary/40'
                }`}
              >
                <div className="font-semibold text-sm text-text-primary">{opt.label}</div>
                <div className="text-xs text-text-secondary mt-1">{opt.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Sport */}
        <div>
          <label className="block text-sm font-semibold text-text-secondary mb-2">Sport</label>
          <div className="flex gap-2 flex-wrap">
            {SPORT_OPTIONS.map((opt) => {
              const isFantasyLocked = format === 'fantasy' && opt.value !== 'americanfootball_nfl'
              return (
              <button
                key={opt.value}
                type="button"
                disabled={isFantasyLocked}
                onClick={() => {
                  setSport(opt.value)
                  if (!DAILY_ELIGIBLE_SPORTS.has(opt.value)) setPickFrequency('weekly')
                }}
                className={`flex-shrink-0 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                  sport === opt.value
                    ? 'bg-accent text-white border-accent'
                    : isFantasyLocked
                    ? 'border-text-primary/10 text-text-muted/30 cursor-not-allowed'
                    : 'border-text-primary/20 text-text-primary hover:border-text-primary/40'
                }`}
              >
                {opt.label}
              </button>
              )
            })}
          </div>
        </div>

        {/* Duration (not for fantasy — always full season) */}
        {format !== 'fantasy' && <>
        <div>
          <label className="block text-sm font-semibold text-text-secondary mb-2">Duration</label>
          <div className="grid grid-cols-2 gap-2">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDuration(opt.value)}
                className={`px-4 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                  duration === opt.value
                    ? 'bg-accent text-white border-accent'
                    : 'border-text-primary/20 text-text-primary hover:border-text-primary/40'
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
        </>}

        {/* Max Members (not for fantasy — team count is in settings) */}
        {format !== 'fantasy' && <div>
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
        </div>}

        {/* Format-specific settings */}
        {format === 'pickem' && (
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">Pick'em Settings</h3>
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
                  <div className="text-[10px] text-text-muted mt-1">Periods are days instead of weeks</div>
                )}
              </div>
            )}
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Games per {pickFrequency === 'daily' ? 'day' : 'week'} <span className="text-text-muted">(leave empty for all games)</span>
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

        {format === 'fantasy' && (
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">Fantasy Settings</h3>
            <div>
              <label className="text-xs text-text-muted block mb-1">Scoring Format</label>
              <div className="flex gap-2">
                {[
                  { value: 'half_ppr', label: 'Half PPR' },
                  { value: 'ppr', label: 'PPR' },
                  { value: 'standard', label: 'Standard' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setScoringFormat(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      scoringFormat === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Number of Teams</label>
              <div className="flex gap-2">
                {[6, 8, 10, 12, 14, 16, 20].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNumTeams(n)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      numTeams === n ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Draft Pick Timer</label>
              <div className="flex gap-2">
                {[
                  { value: 60, label: '60s' },
                  { value: 90, label: '90s' },
                  { value: 120, label: '2min' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDraftPickTimer(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      draftPickTimer === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Waiver System</label>
              <div className="flex gap-2">
                {[
                  { value: 'priority', label: 'Priority' },
                  { value: 'rolling', label: 'Rolling' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setWaiverType(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      waiverType === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Trade Review</label>
              <div className="flex gap-2">
                {[
                  { value: 'commissioner', label: 'Commissioner' },
                  { value: 'league_vote', label: 'League Vote' },
                  { value: 'none', label: 'None' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTradeReview(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      tradeReview === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Playoff Teams</label>
              <div className="flex gap-2">
                {[4, 6, 8].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPlayoffTeams(n)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      playoffTeams === n ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    Top {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {format === 'survivor' && (
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">Survivor Settings</h3>
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
          </div>
        )}

        {format === 'squares' && (
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">Squares Settings</h3>
            <div>
              <label className="block text-xs text-text-muted mb-2">Game</label>
              {sport === 'all' ? (
                <div className="text-xs text-text-muted">Select a specific sport above to pick a game.</div>
              ) : squaresGames?.length > 0 ? (
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {squaresGames.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        setGameId(g.id)
                        setRowTeamName(g.away_team)
                        setColTeamName(g.home_team)
                      }}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
                        gameId === g.id
                          ? 'border-accent bg-accent/10'
                          : 'border-border bg-bg-primary hover:bg-bg-card-hover'
                      }`}
                    >
                      <div className="font-semibold text-sm">{g.away_team} @ {g.home_team}</div>
                      <div className="text-xs text-text-muted mt-0.5">
                        {new Date(g.commence_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' '}
                        {new Date(g.commence_time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-text-muted">No upcoming games found for this sport.</div>
              )}
            </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Row Team Name</label>
                <input
                  type="text"
                  value={rowTeamName}
                  onChange={(e) => setRowTeamName(e.target.value)}
                  placeholder="Away"
                  maxLength={50}
                  className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Column Team Name</label>
                <input
                  type="text"
                  value={colTeamName}
                  onChange={(e) => setColTeamName(e.target.value)}
                  placeholder="Home"
                  maxLength={50}
                  className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                />
              </div>
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
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">Bracket Settings</h3>
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
                      {t.picks_available_at && (
                        <div className="text-xs text-accent mt-1">
                          Picks open {new Date(t.picks_available_at).toLocaleString('en-US', {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                          })}
                        </div>
                      )}
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
