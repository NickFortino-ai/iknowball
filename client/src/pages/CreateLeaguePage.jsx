import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateLeague, useBracketTemplatesActive, useLeagueBackdrops } from '../hooks/useLeagues'
import { api } from '../lib/api'
import { useGames } from '../hooks/useGames'
import { toast } from '../components/ui/Toast'

const FORMAT_OPTIONS = [
  { value: 'fantasy', label: 'Fantasy Football', description: 'Draft players, set lineups, and compete head-to-head each week' },
  { value: 'nba_dfs', label: 'NBA Daily Fantasy', description: 'Build a nightly NBA lineup under a salary cap and compete for the highest score' },
  { value: 'mlb_dfs', label: 'MLB Daily Fantasy', description: 'Build a daily MLB lineup under a salary cap — scored on hits, HRs, RBIs, runs, and more' },
  { value: 'hr_derby', label: 'Home Run Derby', description: 'Pick 3 hitters per day — score points for every HR they hit, with distance as tiebreaker' },
  { value: 'pickem', label: "Pick'em", description: 'Pick game winners with odds-based scoring — your points reflect the real odds' },
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

// Sport-specific season end dates (approximate, updated yearly)
function getSeasonEndDate(sportKey) {
  const year = new Date().getFullYear()
  const dates = {
    basketball_nba: `${year}-06-20`,       // NBA Finals ~mid June
    americanfootball_nfl: `${year + 1}-02-10`, // Super Bowl ~early Feb next year
    baseball_mlb: `${year}-10-31`,          // World Series ~late October
    basketball_ncaab: `${year}-04-10`,      // Final Four ~early April
    basketball_wncaab: `${year}-04-10`,
    americanfootball_ncaaf: `${year + 1}-01-15`, // CFP Championship ~mid Jan
    basketball_wnba: `${year}-10-20`,       // WNBA Finals ~mid October
    icehockey_nhl: `${year}-06-25`,         // Stanley Cup ~late June
    soccer_usa_mls: `${year}-12-15`,        // MLS Cup ~mid December
  }
  // If we're past the end date for this sport, push to next year
  const endDate = dates[sportKey] || `${year}-12-31`
  if (new Date(endDate) < new Date()) {
    // Next season — add a year to the month-day
    const d = new Date(endDate)
    d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().split('T')[0]
  }
  return endDate
}

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
  const [squaresDate, setSquaresDate] = useState('')
  const squaresSport = format === 'squares' && sport && sport !== 'all' ? sport : undefined
  const { data: allSquaresGames } = useGames(squaresSport, 'upcoming', 90)
  const squaresGames = squaresDate
    ? (allSquaresGames || []).filter((g) => {
        const d = new Date(g.starts_at)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        return key === squaresDate
      })
    : []

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

  // Fantasy settings
  const [fantasyFormat, setFantasyFormat] = useState('traditional')

  // Auto-select sport for specific formats
  useEffect(() => {
    if (format === 'fantasy' && fantasyFormat === 'traditional') setSport('americanfootball_nfl')
    if (format === 'mlb_dfs' || format === 'hr_derby') setSport('baseball_mlb')
  }, [format, fantasyFormat])
  const [scoringFormat, setScoringFormat] = useState('half_ppr')
  const [numTeams, setNumTeams] = useState(10)
  const [draftPickTimer, setDraftPickTimer] = useState(90)
  const [waiverType, setWaiverType] = useState('priority')
  const [tradeReview, setTradeReview] = useState('commissioner')
  const [playoffTeams, setPlayoffTeams] = useState(4)
  const [salaryCap, setSalaryCap] = useState(60000)
  const [seasonType, setSeasonType] = useState('full_season')
  const [championMetric, setChampionMetric] = useState('total_points')
  const [singleWeek, setSingleWeek] = useState(1)

  // Visibility settings
  const [visibility, setVisibility] = useState('closed')
  const [backdropImage, setBackdropImage] = useState('')
  const [customBackdropFile, setCustomBackdropFile] = useState(null)
  const [customBackdropPreview, setCustomBackdropPreview] = useState(null)
  const fileInputRef = useRef(null)
  const backdropSport = format === 'nba_dfs' ? 'basketball_nba' : (format === 'mlb_dfs' || format === 'hr_derby') ? 'baseball_mlb' : sport || undefined
  const { data: availableBackdrops } = useLeagueBackdrops(backdropSport)
  const [joinsLockedAt, setJoinsLockedAt] = useState('')

  // NBA DFS start date
  const [dfsStartOption, setDfsStartOption] = useState('today')
  const [dfsStartCustom, setDfsStartCustom] = useState('')

  function getDfsStartDate() {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    if (dfsStartOption === 'today') return today
    if (dfsStartOption === 'tomorrow') {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    }
    return dfsStartCustom || today
  }

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
    const isFantasyFormat = ['fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby'].includes(format)
    const fantasySettings = isFantasyFormat ? {
      format: (format === 'nba_dfs' || format === 'mlb_dfs') ? 'salary_cap' : format === 'hr_derby' ? 'hr_derby' : fantasyFormat,
      scoring_format: (format === 'nba_dfs' || format === 'mlb_dfs' || fantasyFormat === 'salary_cap') ? 'ppr' : scoringFormat,
      num_teams: numTeams,
      draft_pick_timer: format === 'fantasy' && fantasyFormat === 'traditional' ? draftPickTimer : undefined,
      waiver_type: format === 'fantasy' && fantasyFormat === 'traditional' ? waiverType : undefined,
      trade_review: format === 'fantasy' && fantasyFormat === 'traditional' ? tradeReview : undefined,
      playoff_teams: format === 'fantasy' && fantasyFormat === 'traditional' ? playoffTeams : undefined,
      salary_cap: (format === 'nba_dfs' || fantasyFormat === 'salary_cap') ? salaryCap : undefined,
      season_type: (format === 'nba_dfs' || fantasyFormat === 'salary_cap') ? seasonType : undefined,
      champion_metric: (format === 'nba_dfs' || fantasyFormat === 'salary_cap') && seasonType === 'full_season' ? championMetric : undefined,
      single_week: (format === 'nba_dfs' || fantasyFormat === 'salary_cap') && seasonType === 'single_week' ? singleWeek : undefined,
    } : undefined

    try {
      const league = await createLeague.mutateAsync({
        name,
        format,
        sport: format === 'nba_dfs' ? 'basketball_nba' : (format === 'mlb_dfs' || format === 'hr_derby') ? 'baseball_mlb' : format === 'fantasy' ? 'americanfootball_nfl' : sport,
        duration: isFantasyFormat ? 'full_season' : format === 'squares' ? 'custom_range' : (endsAt === 'end_of_season' ? 'custom_range' : duration),
        max_members: format === 'nba_dfs'
          ? (maxMembers ? parseInt(maxMembers, 10) : undefined)
          : format === 'fantasy' ? numTeams : maxMembers ? parseInt(maxMembers, 10) : undefined,
        starts_at: ['nba_dfs', 'mlb_dfs', 'hr_derby'].includes(format) ? getDfsStartDate()
          : format === 'squares' && gameId ? squaresGames?.find((g) => g.id === gameId)?.starts_at || undefined
          : startsAt || undefined,
        ends_at: format === 'squares' && gameId ? squaresGames?.find((g) => g.id === gameId)?.starts_at || undefined
          : endsAt === 'end_of_season' ? getSeasonEndDate(format === 'nba_dfs' ? 'basketball_nba' : (format === 'mlb_dfs' || format === 'hr_derby') ? 'baseball_mlb' : sport)
          : endsAt || undefined,
        settings,
        fantasy_settings: fantasySettings,
        visibility,
        joins_locked_at: ['nba_dfs', 'mlb_dfs', 'hr_derby'].includes(format)
          ? getDfsStartDate()
          : format === 'squares' && gameId ? squaresGames?.find((g) => g.id === gameId)?.starts_at || undefined
          : visibility === 'open' && joinsLockedAt ? joinsLockedAt : undefined,
        backdrop_image: backdropImage || undefined,
      })
      // Upload custom backdrop if selected
      if (customBackdropFile) {
        try {
          const formData = new FormData()
          formData.append('image', customBackdropFile)
          formData.append('league_id', league.id)
          await api.postForm('/backdrops/submit', formData)
          toast('League created! Backdrop submitted for review.', 'success')
        } catch {
          toast('League created! Backdrop upload failed — you can try again later.', 'success')
        }
      } else {
        toast('League created!', 'success')
      }
      navigate(`/leagues/${league.id}?invite=1`)
    } catch (err) {
      toast(err.message || 'Failed to create league', 'error')
    }
  }

  const autoSportFormats = ['nba_dfs', 'mlb_dfs', 'hr_derby']
  const noDurationFormats = ['fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby', 'squares']
  const canSubmit = name && format && (sport || autoSportFormats.includes(format)) && (noDurationFormats.includes(format) || duration)
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

        {/* Sport (hidden for format-locked sports) */}
        {!['nba_dfs', 'mlb_dfs', 'hr_derby'].includes(format) && <div>
          <label className="block text-sm font-semibold text-text-secondary mb-2">Sport</label>
          <div className="flex gap-2 flex-wrap">
            {SPORT_OPTIONS.map((opt) => {
              const fantasySports = fantasyFormat === 'salary_cap' ? ['americanfootball_nfl', 'basketball_nba'] : ['americanfootball_nfl']
              const isFantasyLocked = format === 'fantasy' && !fantasySports.includes(opt.value)
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
        </div>}

        {/* Duration (not for fantasy/DFS formats — always full season) */}
        {!['fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby', 'squares'].includes(format) && <>
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
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setEndsAt('end_of_season')}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                    endsAt === 'end_of_season' ? 'bg-accent text-white' : 'bg-bg-input border border-border text-text-secondary hover:bg-bg-card-hover'
                  }`}
                >
                  End of Season
                </button>
                <button
                  type="button"
                  onClick={() => setEndsAt('')}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                    endsAt !== 'end_of_season' ? 'bg-accent text-white' : 'bg-bg-input border border-border text-text-secondary hover:bg-bg-card-hover'
                  }`}
                >
                  Custom Date
                </button>
              </div>
              {endsAt !== 'end_of_season' && (
                <input
                  type="date"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
                />
              )}
            </div>
          </div>
        )}
        </>}

        {/* Max Members — only standalone for formats without their own settings section */}
        {!['fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby', 'pickem', 'survivor', 'squares'].includes(format) && <div>
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

        {/* Visibility */}
        <div>
          <label className="block text-sm font-semibold text-text-secondary mb-2">League Visibility</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVisibility('closed')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                visibility === 'closed' ? 'bg-accent text-white' : 'bg-bg-input border border-border text-text-secondary hover:bg-bg-card-hover'
              }`}
            >
              Invite Only
            </button>
            <button
              type="button"
              onClick={() => setVisibility('open')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                visibility === 'open' ? 'bg-accent text-white' : 'bg-bg-input border border-border text-text-secondary hover:bg-bg-card-hover'
              }`}
            >
              Open
            </button>
          </div>
          <p className="text-xs text-text-muted mt-1.5">
            {visibility === 'open'
              ? 'Anyone can find and join this league.'
              : 'Only people with the invite code can join.'}
          </p>
        </div>

        {visibility === 'open' && (
          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">
              Open Until <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={joinsLockedAt}
              onChange={(e) => setJoinsLockedAt(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
            />
            <p className="text-xs text-text-muted mt-1.5">After this time, no new members can join.</p>
          </div>
        )}

        {/* Backdrop picker */}
        {format && (
          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">League Backdrop</label>
            <div className="grid grid-cols-3 gap-2 max-h-[320px] overflow-y-auto scrollbar-hide rounded-lg">
              {/* Submit your own */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`relative rounded-lg overflow-hidden border-2 border-dashed transition-all aspect-[16/9] flex flex-col items-center justify-center gap-1 ${
                  customBackdropFile ? 'border-accent bg-accent/10' : 'border-text-primary/20 hover:border-accent/50 bg-bg-primary'
                }`}
              >
                {customBackdropPreview ? (
                  <img src={customBackdropPreview} alt="Custom" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <>
                    <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-[9px] text-text-muted font-semibold leading-tight text-center px-1">Submit your own</span>
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 5 * 1024 * 1024) { toast('Image must be under 5MB', 'error'); return }
                  setCustomBackdropFile(file)
                  setCustomBackdropPreview(URL.createObjectURL(file))
                  setBackdropImage('')
                }}
              />
              {(availableBackdrops || []).map((b) => (
                <button
                  key={b.filename}
                  type="button"
                  onClick={() => { setBackdropImage(backdropImage === b.filename ? '' : b.filename); setCustomBackdropFile(null); setCustomBackdropPreview(null) }}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-[16/9] ${
                    backdropImage === b.filename ? 'border-accent ring-1 ring-accent' : 'border-text-primary/20 hover:border-text-primary/40'
                  }`}
                >
                  <img
                    src={`/backdrops/${b.filename}`}
                    alt={b.label}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                    <span className="text-[10px] text-white font-medium">{b.label}</span>
                  </div>
                  {backdropImage === b.filename && (
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-1.5">Optional. Custom images are submitted for admin review.</p>
          </div>
        )}

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
            <div>
              <label className="text-xs text-text-muted block mb-1">Max Members <span className="text-text-muted">(optional)</span></label>
              <input
                type="number"
                value={maxMembers}
                onChange={(e) => setMaxMembers(e.target.value)}
                placeholder="No limit"
                min={2}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        )}

        {format === 'fantasy' && (
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">Fantasy Settings</h3>

            {/* Format: Traditional vs Salary Cap */}
            <div>
              <label className="text-xs text-text-muted block mb-1">Format</label>
              <div className="space-y-2">
                {[
                  { value: 'traditional', label: 'Traditional', desc: 'Draft players and manage your roster all season. Make trades, work the waiver wire, and set your lineup each week.' },
                  { value: 'salary_cap', label: 'Salary Cap', desc: 'Build a new roster every week under a salary budget. No draft, no trades. Fresh start every week.' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFantasyFormat(opt.value)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      fantasyFormat === opt.value ? 'border-accent bg-accent/10' : 'border-text-primary/20 hover:border-text-primary/40'
                    }`}
                  >
                    <div className="font-semibold text-sm text-text-primary">{opt.label}</div>
                    <div className="text-xs text-text-secondary mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Salary Cap specific settings */}
            {fantasyFormat === 'salary_cap' && (
              <>
                <div>
                  <label className="text-xs text-text-muted block mb-1">Salary Cap</label>
                  <div className="flex gap-2">
                    {[50000, 60000, 75000].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSalaryCap(n)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          salaryCap === n ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                        }`}
                      >
                        ${n.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">Season Type</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'full_season', label: 'Full Season' },
                      { value: 'single_week', label: sport === 'basketball_nba' ? 'Single Night' : 'Single Week' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSeasonType(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          seasonType === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {seasonType === 'single_week' && (
                  <div>
                    <label className="text-xs text-text-muted block mb-1">{sport === 'basketball_nba' ? 'Game Date' : 'NFL Week'}</label>
                    <div className="flex gap-1 flex-wrap">
                      {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setSingleWeek(w)}
                          className={`w-9 h-9 rounded-lg text-xs font-semibold transition-colors ${
                            singleWeek === w ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                          }`}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {seasonType === 'full_season' && (
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Champion Determined By</label>
                    <div className="flex gap-2">
                      {[
                        { value: 'total_points', label: 'Most Total Points' },
                        { value: 'most_wins', label: 'Most Weekly Wins' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setChampionMetric(opt.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            championMetric === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Scoring Format (shared) */}
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
            {/* Traditional-only settings */}
            {fantasyFormat === 'traditional' && <>
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
            </>}
          </div>
        )}

        {format === 'nba_dfs' && (
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">NBA Daily Fantasy Settings</h3>
            <div>
              <label className="text-xs text-text-muted block mb-1">Salary Cap</label>
              <div className="flex gap-2">
                {[50000, 60000, 75000].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSalaryCap(n)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      salaryCap === n ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    ${n.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Season Type</label>
              <div className="flex gap-2">
                {[
                  { value: 'full_season', label: 'Full Season' },
                  { value: 'single_week', label: 'Single Night' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSeasonType(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      seasonType === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {seasonType === 'full_season' && (
              <div>
                <label className="text-xs text-text-muted block mb-1">Champion Determined By</label>
                <div className="flex gap-2">
                  {[
                    { value: 'total_points', label: 'Most Total Points' },
                    { value: 'most_wins', label: 'Most Nightly Wins' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setChampionMetric(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        championMetric === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-text-muted block mb-1">League Starts</label>
              <div className="flex gap-2">
                {[
                  { value: 'today', label: 'Today' },
                  { value: 'tomorrow', label: 'Tomorrow' },
                  { value: 'custom', label: 'Select Date' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDfsStartOption(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      dfsStartOption === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {dfsStartOption === 'custom' && (
                <input
                  type="date"
                  value={dfsStartCustom}
                  onChange={(e) => setDfsStartCustom(e.target.value)}
                  min={new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}
                  className="mt-2 w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
                />
              )}
              <p className="text-xs text-text-muted mt-1.5">
                {visibility === 'open'
                  ? 'League is open until the first game on this date. Rosters lock at first tip-off each day.'
                  : 'Members cannot join after this date. Rosters lock at first tip-off each day.'}
              </p>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Max Members</label>
              <input
                type="number"
                value={maxMembers}
                onChange={(e) => setMaxMembers(e.target.value)}
                placeholder="No limit"
                min={2}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        )}

        {(format === 'mlb_dfs' || format === 'hr_derby') && (
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">
              {format === 'mlb_dfs' ? 'MLB Daily Fantasy Settings' : 'Home Run Derby Settings'}
            </h3>
            {format === 'mlb_dfs' && (
              <div>
                <label className="text-xs text-text-muted block mb-1">Salary Cap</label>
                <div className="flex gap-2">
                  {[40000, 50000, 60000].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSalaryCap(n)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        salaryCap === n ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                      }`}
                    >
                      ${n.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-text-muted block mb-1">League Starts</label>
              <div className="flex gap-2">
                {[
                  { value: 'today', label: 'Today' },
                  { value: 'tomorrow', label: 'Tomorrow' },
                  { value: 'custom', label: 'Select Date' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDfsStartOption(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      dfsStartOption === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {dfsStartOption === 'custom' && (
                <input
                  type="date"
                  value={dfsStartCustom}
                  onChange={(e) => setDfsStartCustom(e.target.value)}
                  min={new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}
                  className="mt-2 w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
                />
              )}
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Season Type</label>
              <div className="flex gap-2">
                {[
                  { value: 'full_season', label: 'Full Season' },
                  { value: 'single_week', label: 'Single Night' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSeasonType(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      seasonType === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-muted mt-1.5">
                {seasonType === 'full_season' ? 'Runs through end of MLB regular season.' : 'One night only — highest score wins.'}
              </p>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Max Members</label>
              <input
                type="number"
                value={maxMembers}
                onChange={(e) => setMaxMembers(e.target.value)}
                placeholder="No limit"
                min={2}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
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
            <div>
              <label className="text-xs text-text-muted block mb-1">Max Members <span className="text-text-muted">(optional)</span></label>
              <input
                type="number"
                value={maxMembers}
                onChange={(e) => setMaxMembers(e.target.value)}
                placeholder="No limit"
                min={2}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        )}

        {format === 'squares' && (
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">Squares Settings</h3>
            <div>
              <label className="block text-xs text-text-muted mb-2">Game Date</label>
              {sport === 'all' ? (
                <div className="text-xs text-text-muted">Select a specific sport above to pick a game.</div>
              ) : (
                <>
                  <input
                    type="date"
                    value={squaresDate}
                    onChange={(e) => { setSquaresDate(e.target.value); setGameId('') }}
                    min={new Date().toLocaleDateString('en-CA')}
                    className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent mb-3"
                  />
                  {squaresDate && squaresGames.length > 0 ? (
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
                        {new Date(g.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </button>
                  ))}
                </div>
              ) : squaresDate ? (
                <div className="text-xs text-text-muted">No games found on this date for the selected sport.</div>
              ) : null}
                </>
              )}
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-2">How do you want users to claim squares?</label>
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
              {(() => {
                const total = pointsPerQuarter.reduce((sum, q) => sum + (q || 0), 0)
                if (!total) return null
                return (
                  <div className="mt-2 text-xs text-text-muted text-center">
                    Total: <span className="text-text-primary font-semibold">{total} pts</span> across 4 quarters · <span className="text-accent font-semibold">{(total / 100).toFixed(total % 100 === 0 ? 0 : 1)} pts</span> per square
                  </div>
                )
              })()}
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
