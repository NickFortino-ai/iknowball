import { useState, useRef, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useLeague, useLeagueStandings, useUpdateLeague, useDeleteLeague, useBracketTournament, useBracketEntries, useUpdateBracketTournament, useToggleAutoConnect, useThreadUnread, useFantasySettings } from '../hooks/useLeagues'
import { useAuth } from '../hooks/useAuth'
import MembersList from '../components/leagues/MembersList'
import InvitePlayerModal from '../components/leagues/InvitePlayerModal'
import PickemView from '../components/leagues/PickemView'
import SurvivorView from '../components/leagues/SurvivorView'
import SquaresView from '../components/leagues/SquaresView'
import BracketView from '../components/leagues/BracketView'
import LeagueThread from '../components/leagues/LeagueThread'
import FantasyDraftRoom from '../components/leagues/FantasyDraftRoom'
import FantasyMyTeam from '../components/leagues/FantasyMyTeam'
import FantasyPlayerBrowser from '../components/leagues/FantasyPlayerBrowser'
import FantasyStandings from '../components/leagues/FantasyStandings'
import FantasyMatchup from '../components/leagues/FantasyMatchup'
import NbaDfsView from '../components/leagues/NbaDfsView'
import MlbDfsView from '../components/leagues/MlbDfsView'
import UserProfileModal from '../components/profile/UserProfileModal'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Avatar from '../components/ui/Avatar'
import { toast } from '../components/ui/Toast'

function getLeagueTabs(league, isBracketLocked) {
  if (league.format === 'pickem' && league.use_league_picks) {
    return ['Picks', 'Standings', 'Members', 'Thread']
  }
  if (league.format === 'bracket') {
    return isBracketLocked ? ['Bracket', 'Standings', 'Thread'] : ['Bracket', 'Standings', 'Members', 'Thread']
  }
  const TABS = {
    pickem: ['Standings', 'Members', 'Thread'],
    survivor: ['Board', 'Members', 'Thread'],
    squares: ['Board', 'Members', 'Thread'],
    fantasy: ['My Team', 'Players', 'Matchups', 'Standings', 'Draft', 'Thread'],
    nba_dfs: ['Roster', 'Live', 'Standings'],
    mlb_dfs: ['Roster', 'Live', 'Standings'],
    hr_derby: ['Picks', 'Standings', 'Thread'],
  }
  return TABS[league.format] || ['Members', 'Thread']
}

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  squares: 'Squares',
  bracket: 'Bracket',
  fantasy: 'Fantasy Football',
  nba_dfs: 'NBA Daily Fantasy',
  mlb_dfs: 'MLB Daily Fantasy',
  hr_derby: 'Home Run Derby',
}

const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_ncaab: 'NCAAB',
  basketball_wncaab: 'WNCAAB',
  americanfootball_ncaaf: 'NCAAF',
  basketball_wnba: 'WNBA',
  all: 'All Sports',
}

const DAILY_ELIGIBLE_SPORTS = new Set(['basketball_nba', 'basketball_ncaab', 'basketball_wnba', 'baseball_mlb', 'all'])

function toDateInputValue(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

const DURATION_OPTIONS = [
  { value: 'this_week', label: 'This Week' },
  { value: 'custom_range', label: 'Custom Range' },
  { value: 'full_season', label: 'Full Season' },
  { value: 'playoffs_only', label: 'Playoffs Only' },
]

function formatDateRange(startsAt, endsAt) {
  const opts = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  const start = startsAt ? new Date(startsAt).toLocaleDateString('en-US', opts) : null
  const end = endsAt ? new Date(endsAt).toLocaleDateString('en-US', opts) : null
  if (start && end) return `${start} – ${end}`
  if (start) return `Starts ${start}`
  return null
}

function LeagueConditions({ league }) {
  const settings = league.settings || {}
  const isDaily = settings.pick_frequency === 'daily'
  const toggleAutoConnect = useToggleAutoConnect()
  const { data: fantasySettings } = useFantasySettings(['nba_dfs', 'mlb_dfs', 'hr_derby', 'fantasy'].includes(league.format) ? league.id : null)
  const items = []

  // Date range / duration
  const DURATION_LABELS = {
    full_season: 'Full Season',
    playoffs_only: 'Playoffs Only',
  }

  if (league.format === 'nba_dfs') {
    // NBA DFS specific items
    if (fantasySettings?.salary_cap) {
      items.push({ label: 'Salary Cap', value: `$${fantasySettings.salary_cap.toLocaleString()}` })
    }
    const seasonType = fantasySettings?.season_type
    items.push({ label: 'Type', value: seasonType === 'single_week' ? 'Single Night' : 'Full Season' })
    if (fantasySettings?.champion_metric && seasonType !== 'single_week') {
      items.push({ label: 'Champion', value: fantasySettings.champion_metric === 'most_wins' ? 'Most Nightly Wins' : 'Most Total Points' })
    }
    if (league.starts_at) {
      items.push({ label: 'Starts', value: new Date(league.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }) })
    }
    items.push({ label: 'Visibility', value: league.visibility === 'open' ? 'Open' : 'Invite Only' })
  } else {
    const durationLabel = DURATION_LABELS[league.duration]
    if (durationLabel) {
      items.push({ label: 'Duration', value: durationLabel })
    } else {
      const dateRange = formatDateRange(league.starts_at, league.ends_at)
      if (dateRange) items.push({ label: 'Dates', value: dateRange })
    }
  }

  // Pick frequency
  if (league.format === 'survivor' || league.format === 'pickem') {
    items.push({ label: 'Picks', value: isDaily ? 'Daily' : 'Weekly' })
  }

  // Lives (survivor)
  if (league.format === 'survivor') {
    const lives = settings.lives || 1
    items.push({ label: 'Lives', value: `${lives}` })
    if (settings.all_eliminated_survive) {
      items.push({ label: 'Rule', value: `All out same ${isDaily ? 'day' : 'week'} = all survive` })
    }
  }

  // Games per week (pickem)
  if (league.format === 'pickem' && settings.games_per_week) {
    items.push({ label: `Per ${isDaily ? 'day' : 'week'}`, value: `${settings.games_per_week} games` })
  }

  // Lock odds (pickem)
  if (league.format === 'pickem' && settings.lock_odds_at === 'submission') {
    items.push({ label: 'Odds', value: 'Locked at submission' })
  }

  const autoConnect = league.my_auto_connect ?? true
  const isBracket = league.format === 'bracket'

  // Build narrative description
  function buildNarrative() {
    const lives = settings.lives || 1
    const freq = isDaily ? 'day' : 'week'
    const dateRange = formatDateRange(league.starts_at, league.ends_at)

    function durationSentence(endCondition) {
      if (league.duration === 'full_season') {
        return `This league runs through the remainder of the season${endCondition ? ` or ${endCondition}` : ''}.`
      }
      if (league.duration === 'playoffs_only') {
        return `This league runs through the playoffs${endCondition ? ` or ${endCondition}` : ''}.`
      }
      if (dateRange) {
        return `This league runs ${dateRange}${endCondition ? ` or ${endCondition}` : ''}.`
      }
      return ''
    }

    if (league.format === 'survivor') {
      const lifeText = lives === 1 ? '1 life' : `${lives} lives`
      const allElimRule = settings.all_eliminated_survive
        ? ` If all remaining players are eliminated on the same ${freq}, everyone survives.`
        : ''
      const duration = durationSentence('until there is one last survivor')
      return `Pick one winning team each ${freq}. You can only pick each team once unless you've used them all. You have ${lifeText} — pick wrong and you're out.${allElimRule} The last player standing wins and earns bonus points on the global leaderboard. ${duration}`
    }

    if (league.format === 'pickem') {
      const gamesText = settings.games_per_week
        ? `Pick up to ${settings.games_per_week} games per ${freq}.`
        : `Pick as many games as you want each ${freq}.`
      const oddsText = settings.lock_odds_at === 'submission' ? ' Odds are locked at the time of submission.' : ''
      const duration = durationSentence(null)
      return `${gamesText}${oddsText} The player with the most points at the end wins and earns bonus points on the global leaderboard. ${duration}`
    }

    if (league.format === 'fantasy') {
      return `Draft your team, set your lineup each week, and compete head-to-head. Top finishers earn bonus points on the global leaderboard.`
    }

    if (league.format === 'squares') {
      const duration = durationSentence(null)
      return `Select your squares on the board. Payouts are awarded at the end of each quarter based on the last digit of each team's score. ${duration}`
    }

    if (league.format === 'nba_dfs') {
      const cap = fantasySettings?.salary_cap ? `$${fantasySettings.salary_cap.toLocaleString()}` : '$60,000'
      const isSingleNight = fantasySettings?.season_type === 'single_week'
      if (isSingleNight) {
        return `Build a 9-player NBA lineup under a ${cap} salary cap. Each player locks when their game tips off, but you can swap unlocked players until their game starts. The player with the most fantasy points at the end of the night wins.`
      }
      const metric = fantasySettings?.champion_metric === 'most_wins' ? 'most nightly wins' : 'most total fantasy points'
      return `Build a new 9-player NBA lineup each night under a ${cap} salary cap. Each player locks when their game tips off, but you can swap unlocked players until their game starts. Players earn points based on their real stats — points, rebounds, assists, steals, blocks, and more. The champion is determined by ${metric} over the season.`
    }

    return null
  }

  const narrative = buildNarrative()

  if (!narrative && items.length === 0) return null

  const storageKey = `league-conditions-collapsed-${league.id}`
  const [collapsed, setCollapsed] = useState(() => {
    if (league.status === 'completed') return true
    try { return localStorage.getItem(storageKey) === '1' } catch { return false }
  })

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(storageKey, next ? '1' : '0') } catch {}
  }

  return (
    <div className={isBracket ? 'mb-4' : 'rounded-xl border border-text-primary/20 p-4 mb-6'}>
      {isBracket ? (
        <div className="flex items-center gap-3 text-xs text-text-muted">
          {items.map((item, i) => (
            <span key={item.label}>
              {i > 0 && <span className="mr-3">·</span>}
              {item.label}: {item.value}
            </span>
          ))}
        </div>
      ) : (
        <div>
          <button onClick={toggleCollapsed} className="flex items-center justify-between w-full">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">How this league works</span>
            <svg className={`w-4 h-4 text-text-muted transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {!collapsed && narrative && (
            <p className="text-sm text-text-primary leading-relaxed mt-3">{narrative}</p>
          )}
        </div>
      )}
      {league.status !== 'completed' && !league.all_members_connected && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
          <span className="text-xs text-text-muted">Add league mates to squad when league ends</span>
          <button
            onClick={() => toggleAutoConnect.mutate({ leagueId: league.id, autoConnect: !autoConnect })}
            disabled={toggleAutoConnect.isPending}
            className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
              autoConnect ? 'bg-accent' : 'bg-bg-primary'
            }`}
          >
            <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform mx-0.5 ${
              autoConnect ? 'translate-x-4' : ''
            }`} />
          </button>
        </div>
      )}
    </div>
  )
}

function toDateTimeLocalValue(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function LeagueSettingsEditor({ league, updateLeague, hasLockedPicks }) {
  const [expanded, setExpanded] = useState(false)
  const settings = league.settings || {}
  const isDaily = league.settings?.pick_frequency === 'daily'
  const { data: tournament } = useBracketTournament(league.format === 'bracket' ? league.id : null)
  const updateTournament = useUpdateBracketTournament()

  async function saveBracketLockTime(value) {
    if (!value || !tournament) return
    try {
      await updateTournament.mutateAsync({
        leagueId: league.id,
        locks_at: new Date(value).toISOString(),
      })
      toast('Lock time saved', 'success')
    } catch (err) {
      toast(err.message || 'Failed to save lock time', 'error')
    }
  }

  async function save(newSettings) {
    try {
      await updateLeague.mutateAsync({
        leagueId: league.id,
        settings: { ...settings, ...newSettings },
      })
      toast('Settings saved', 'success')
    } catch (err) {
      toast(err.message || 'Failed to save settings', 'error')
    }
  }

  async function saveDate(field, value) {
    if (!value) return
    try {
      await updateLeague.mutateAsync({
        leagueId: league.id,
        [field]: new Date(value + 'T12:00:00Z').toISOString(),
      })
      toast('Date saved', 'success')
    } catch (err) {
      toast(err.message || 'Failed to save date', 'error')
    }
  }

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full"
      >
        <h3 className="font-display text-sm text-text-secondary">League Settings</h3>
        <div className="flex items-center gap-2">
          {hasLockedPicks && <span className="text-[10px] text-text-muted">Some settings locked</span>}
          <svg className={`w-4 h-4 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {!expanded ? null : <div className="space-y-4 mt-4">

      {/* Duration */}
      <div>
        <label className="block text-xs text-text-muted mb-2">Duration</label>
        <div className="grid grid-cols-2 gap-2">
          {DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={async () => {
                try {
                  await updateLeague.mutateAsync({
                    leagueId: league.id,
                    duration: opt.value,
                    ...(opt.value !== 'custom_range' ? { starts_at: undefined, ends_at: undefined } : {}),
                  })
                  toast('Duration saved', 'success')
                } catch (err) {
                  toast(err.message || 'Failed to save', 'error')
                }
              }}
              disabled={updateLeague.isPending}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                league.duration === opt.value ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range */}
      {league.duration === 'custom_range' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">
              Start Date
              {hasLockedPicks && <span className="ml-1 italic">Locked</span>}
            </label>
            <input
              type="date"
              defaultValue={toDateInputValue(league.starts_at)}
              onBlur={(e) => saveDate('starts_at', e.target.value)}
              disabled={hasLockedPicks}
              className={`w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent ${hasLockedPicks ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">End Date</label>
            <input
              type="date"
              defaultValue={toDateInputValue(league.ends_at)}
              onBlur={(e) => saveDate('ends_at', e.target.value)}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      )}

      {league.format === 'pickem' && (
        <>
          {DAILY_ELIGIBLE_SPORTS.has(league.sport) && (
            <div>
              <label className="block text-xs text-text-muted mb-2">
                Pick Frequency
                {hasLockedPicks && <span className="ml-2 text-text-muted italic">Locked — picks exist</span>}
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'daily', label: 'Daily' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => save({ pick_frequency: opt.value })}
                    disabled={updateLeague.isPending || hasLockedPicks}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      (settings.pick_frequency || 'weekly') === opt.value ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'
                    } ${hasLockedPicks ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs text-text-muted mb-1">
              Games per {isDaily ? 'day' : 'week'} <span className="text-text-muted">(empty = all)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                defaultValue={settings.games_per_week || ''}
                placeholder="All games"
                min={1}
                className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                onBlur={(e) => {
                  const val = e.target.value ? parseInt(e.target.value, 10) : null
                  if (val !== (settings.games_per_week || null)) {
                    save({ games_per_week: val })
                  }
                }}
              />
            </div>
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
                  onClick={() => save({ lock_odds_at: opt.value })}
                  disabled={updateLeague.isPending}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    (settings.lock_odds_at || 'game_start') === opt.value ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {league.format === 'survivor' && (
        <>
          <div>
            <label className="block text-xs text-text-muted mb-2">
              Lives
              {hasLockedPicks && <span className="ml-2 text-text-muted italic">Locked — picks exist</span>}
            </label>
            <div className="flex gap-2">
              {[1, 2].map((n) => (
                <button
                  key={n}
                  onClick={() => save({ lives: n })}
                  disabled={updateLeague.isPending || hasLockedPicks}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    (settings.lives || 1) === n ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'
                  } ${hasLockedPicks ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {n} {n === 1 ? 'Life' : 'Lives'}
                </button>
              ))}
            </div>
          </div>
          {DAILY_ELIGIBLE_SPORTS.has(league.sport) && (
            <div>
              <label className="block text-xs text-text-muted mb-2">
                Pick Frequency
                {hasLockedPicks && <span className="ml-2 text-text-muted italic">Locked — picks exist</span>}
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'daily', label: 'Daily' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => save({ pick_frequency: opt.value })}
                    disabled={updateLeague.isPending || hasLockedPicks}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      (settings.pick_frequency || 'weekly') === opt.value ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'
                    } ${hasLockedPicks ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-muted">
              If all eliminated in same {isDaily ? 'day' : 'week'}, all survive
            </label>
            <button
              onClick={() => save({ all_eliminated_survive: !settings.all_eliminated_survive })}
              disabled={updateLeague.isPending}
              className={`w-10 h-6 rounded-full transition-colors ${
                settings.all_eliminated_survive ? 'bg-accent' : 'bg-bg-primary'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-1 ${
                settings.all_eliminated_survive ? 'translate-x-4' : ''
              }`} />
            </button>
          </div>
        </>
      )}

      {league.format === 'bracket' && tournament && (
        <>
          <div>
            <label className="block text-xs text-text-muted mb-1">Bracket Lock Time</label>
            <input
              type="datetime-local"
              defaultValue={toDateTimeLocalValue(tournament.locks_at)}
              onBlur={(e) => saveBracketLockTime(e.target.value)}
              className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            <div className="text-[10px] text-text-muted mt-1">Users must submit brackets before this time</div>
          </div>
        </>
      )}
      {/* Visibility toggle — all formats */}
      {expanded && (
        <div className="mt-4">
          <label className="block text-xs text-text-muted mb-1">League Visibility</label>
          <div className="flex gap-2">
            {['closed', 'open'].map((v) => (
              <button
                key={v}
                onClick={async () => {
                  try {
                    await updateLeague.mutateAsync({ leagueId: league.id, visibility: v })
                    toast('Visibility updated', 'success')
                  } catch (err) { toast(err.message || 'Failed to update', 'error') }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  league.visibility === v ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                }`}
              >
                {v === 'closed' ? 'Invite Only' : 'Open'}
              </button>
            ))}
          </div>
        </div>
      )}
      </div>}
    </div>
  )
}

export default function LeagueDetailPage() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { data: league, isLoading } = useLeague(id)
  const { data: standings } = useLeagueStandings(id)
  const { data: bracketTournament } = useBracketTournament(league?.format === 'bracket' ? id : null)
  const { data: bracketEntries } = useBracketEntries(league?.format === 'bracket' ? id : null)
  const { data: threadUnread } = useThreadUnread(id)
  const [activeTab, setActiveTab] = useState(0)
  const [showInviteModal, setShowInviteModal] = useState(searchParams.get('invite') === '1')
  const [editingNote, setEditingNote] = useState(false)
  const [noteExpanded, setNoteExpanded] = useState(() => {
    try {
      const stored = localStorage.getItem(`note-collapsed-${id}`)
      return stored !== '1' // default expanded unless user explicitly collapsed
    } catch { return true }
  })
  const [noteSeenAt, setNoteSeenAt] = useState(() => {
    try { return localStorage.getItem(`note-seen-${id}`) || null } catch { return null }
  })

  // Mark note as seen when rendered expanded
  useEffect(() => {
    if (noteExpanded && league?.commissioner_note && league?.updated_at) {
      const now = new Date().toISOString()
      try {
        localStorage.setItem(`note-seen-${id}`, now)
        setNoteSeenAt(now)
      } catch {}
    }
  }, [noteExpanded, league?.commissioner_note, league?.updated_at, id])
  const [noteText, setNoteText] = useState('')
  const noteRef = useRef(null)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showMembersModal, setShowMembersModal] = useState(false)
  const updateLeague = useUpdateLeague()
  const deleteLeague = useDeleteLeague()

  useEffect(() => {
    if (editingNote && noteRef.current) {
      noteRef.current.focus()
    }
  }, [editingNote])

  if (isLoading) return <div className="max-w-2xl mx-auto px-4 py-6"><LoadingSpinner /></div>
  if (!league) return null

  const isBracketLocked = league.format === 'bracket' && bracketTournament &&
    new Date(bracketTournament.locks_at) <= new Date()
  const tabs = getLeagueTabs(league, isBracketLocked)
  const isCommissioner = league.commissioner_id === profile?.id

  return (
    <div className={`mx-auto px-4 py-6 relative ${['nba_dfs', 'mlb_dfs', 'hr_derby', 'survivor', 'pickem', 'fantasy'].includes(league.format) ? 'max-w-2xl lg:max-w-5xl' : 'max-w-2xl'}`}>
      {/* Full hero backdrop — shows for leagues with a backdrop_image or fantasy/DFS formats */}
      {(league.backdrop_image || ['nba_dfs', 'mlb_dfs', 'hr_derby', 'fantasy'].includes(league.format)) && (
        <div className="absolute inset-x-0 top-0 h-[520px] md:h-[480px] overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
          <img
            src={league.backdrop_image
              ? `/backdrops/${league.backdrop_image}`
              : league.format === 'nba_dfs' ? '/nba-dfs-bg.png' : '/fantasy-football-bg.png'
            }
            alt=""
            className="w-full h-full object-cover object-center opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-bg-primary/20 via-bg-primary/40 to-bg-primary" />
        </div>
      )}

      {/* Header */}
      <div className="mb-6 relative z-10">
        <Link to="/leagues" className="text-xs text-text-muted hover:text-text-secondary transition-colors">
          &larr; My Leagues
        </Link>
        <div className={['bracket', 'fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby', 'survivor', 'pickem'].includes(league.format) ? 'text-center' : ''}>
        <div className={`flex items-center gap-2 mt-2 ${['bracket', 'fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby', 'survivor', 'pickem'].includes(league.format) ? 'justify-center' : ''}`}>
          <h1 className="font-display text-3xl">{league.name}</h1>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="text-text-muted hover:text-text-secondary transition-colors p-1"
            title="League Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
        <div className="flex items-center justify-center gap-5 mt-2">
          <button
            onClick={() => setShowMembersModal(true)}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          >
            {league.members?.length || 0} member{league.members?.length !== 1 ? 's' : ''}
            {league.status === 'open' && league.pending_invitations?.length > 0 && (
              <span className="text-text-muted"> + {league.pending_invitations.length} pending</span>
            )}
          </button>
          {isCommissioner && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-tier-hof/20 text-tier-hof">
              Commissioner
            </span>
          )}
          {/* Invite action icons */}
          {(league.status === 'open' || (league.status === 'active' && league.joins_locked_at && new Date(league.joins_locked_at) > new Date())) && league.format !== 'bracket' && (
            <div className="flex items-center gap-5">
              <button
                onClick={async () => {
                  const url = `${window.location.origin}/join/${league.invite_code}`
                  await navigator.clipboard.writeText(url)
                  toast('Invite link copied!', 'success')
                }}
                className="p-2 text-accent hover:text-accent-hover transition-colors cursor-pointer"
                title="Copy Invite Link"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
                </svg>
              </button>
              {navigator.share && (
                <button
                  onClick={async () => {
                    const url = `${window.location.origin}/join/${league.invite_code}`
                    try {
                      await navigator.share({ title: `Join ${league.name}`, url })
                    } catch {}
                  }}
                  className="p-2 text-text-primary hover:text-white transition-colors cursor-pointer"
                  title="Share"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                </button>
              )}
              {isCommissioner && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="p-2 text-text-primary hover:text-white transition-colors cursor-pointer"
                  title="Invite Player"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
        {league.status === 'open' && league.starts_at && (
          <div className="mt-2 text-sm text-yellow-500 font-semibold">
            Starts {new Date(league.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
          </div>
        )}
        </div>
      </div>

      {/* Champion Card */}
      {league.champion && (
        <div className="mb-6 rounded-xl border-2 border-yellow-500 p-5 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-center gap-4 mb-2">
              <div className="text-4xl">{'\uD83C\uDFC6'}</div>
              <button onClick={() => setSelectedUserId(league.champion.user.id)} className="cursor-pointer">
                {league.champion.user.avatar_url ? (
                  <img
                    src={league.champion.user.avatar_url}
                    alt={league.champion.user.display_name}
                    className="w-20 h-20 rounded-full object-cover ring-2 ring-yellow-500"
                  />
                ) : (
                  <Avatar user={league.champion.user} size="2xl" />
                )}
              </button>
            </div>
            <div className="font-display text-xl text-yellow-400">
              {league.champion.user.display_name || league.champion.user.username}
            </div>
            <div className="text-sm text-text-secondary">won this league!</div>
            <div className="text-sm text-yellow-400 font-semibold mt-2">
              +{league.champion.points} pts earned
            </div>
            {league.champion.label && (
              <div className="text-xs text-text-muted mt-1">{league.champion.label}</div>
            )}
          </div>
        </div>
      )}

      {/* Bracket invite actions — centered below header */}
      {(league.status === 'open' || (league.status === 'active' && league.joins_locked_at && new Date(league.joins_locked_at) > new Date()))
      && league.format === 'bracket' && !isBracketLocked && (
        <div className="flex items-center justify-center gap-3 mb-4">
          <button
            onClick={async () => {
              const url = `${window.location.origin}/join/${league.invite_code}?t=bracket`
              await navigator.clipboard.writeText(url)
              toast('Invite link copied!', 'success')
            }}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
            </svg>
            Copy Link
          </button>
          {navigator.share && (
            <button
              onClick={async () => {
                const url = `${window.location.origin}/join/${league.invite_code}?t=bracket`
                try {
                  await navigator.share({ title: `Join ${league.name}`, url })
                } catch {}
              }}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share
            </button>
          )}
          {isCommissioner && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Invite
            </button>
          )}
        </div>
      )}

      {/* League Conditions (hidden for bracket leagues) */}

      {selectedUserId && (
        <UserProfileModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      )}

      {showMembersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowMembersModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative bg-bg-card rounded-2xl border border-text-primary/20 w-full max-w-sm max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-text-primary/10 sticky top-0 bg-bg-card z-10">
              <h3 className="text-sm font-semibold text-text-primary">Members ({league.members?.length || 0})</h3>
              <button onClick={() => setShowMembersModal(false)} className="text-text-muted hover:text-text-secondary text-lg leading-none">&times;</button>
            </div>
            <div>
              {league.members?.map((m) => (
                <button
                  key={m.user_id}
                  onClick={() => { setSelectedUserId(m.user_id); setShowMembersModal(false) }}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-text-primary/10 last:border-b-0 hover:bg-text-primary/5 transition-colors text-left"
                >
                  <Avatar user={m.users} size="md" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-text-primary truncate block">
                      {m.users?.display_name || m.users?.username}
                    </span>
                    {m.role === 'commissioner' && (
                      <span className="text-[10px] text-tier-hof font-semibold">Commissioner</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showInviteModal && (
        <InvitePlayerModal leagueId={league.id} inviteCode={league.invite_code} leagueName={league.name} format={league.format} memberIds={league.members?.map(m => m.user_id) || []} onClose={() => {
          setShowInviteModal(false)
          if (searchParams.has('invite')) {
            searchParams.delete('invite')
            setSearchParams(searchParams, { replace: true })
          }
        }} />
      )}

      {/* Commissioner's Note */}
      {editingNote ? (
        <div className="rounded-xl border border-text-primary/20 p-4 mb-6 relative z-10">
          <div className="text-xs font-semibold text-text-secondary mb-2">Commissioner's Note</div>
          <textarea
            ref={noteRef}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            maxLength={1000}
            rows={4}
            className="w-full bg-bg-primary border border-border rounded-lg p-3 text-sm text-white placeholder-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="Write a note for your league members..."
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-text-muted">{noteText.length}/1000</span>
            <div className="flex gap-2">
              <button
                onClick={() => setEditingNote(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await updateLeague.mutateAsync({
                      leagueId: league.id,
                      commissioner_note: noteText || null,
                    })
                    setEditingNote(false)
                    toast('Note saved', 'success')
                  } catch (err) {
                    toast(err.message || 'Failed to save note', 'error')
                  }
                }}
                disabled={updateLeague.isPending}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {updateLeague.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : league.commissioner_note ? (
        <div className="rounded-xl border border-text-primary/20 mb-6 relative z-10">
          <button
            onClick={() => {
              setNoteExpanded((v) => {
                const next = !v
                try {
                  localStorage.setItem(`note-collapsed-${league.id}`, next ? '0' : '1')
                  if (next) {
                    // Mark as seen when expanding
                    const now = new Date().toISOString()
                    localStorage.setItem(`note-seen-${league.id}`, now)
                    setNoteSeenAt(now)
                  }
                } catch {}
                return next
              })
            }}
            className="w-full flex items-center justify-between p-4"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-text-secondary">Commissioner's Note</span>
              {league.updated_at && (!noteSeenAt || new Date(league.updated_at) > new Date(noteSeenAt)) && !noteExpanded && (
                <span className="w-2 h-2 rounded-full bg-accent" />
              )}
            </div>
            <div className="flex items-center gap-2">
              {isCommissioner && (
                <span
                  onClick={(e) => { e.stopPropagation(); setNoteText(league.commissioner_note); setEditingNote(true) }}
                  className="text-xs text-accent hover:text-accent-hover transition-colors"
                >
                  Edit
                </span>
              )}
              <svg
                className={`w-4 h-4 text-text-muted transition-transform ${noteExpanded ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {noteExpanded && (
            <div className="px-4 pb-4">
              <p className="text-sm text-text-primary whitespace-pre-wrap">{league.commissioner_note}</p>
            </div>
          )}
        </div>
      ) : isCommissioner ? (
        <div className="mb-6 relative z-10">
          <button
            onClick={() => { setNoteText(''); setEditingNote(true) }}
            className="text-xs text-accent hover:text-accent-hover transition-colors"
          >
            + Add a note for your league members
          </button>
        </div>
      ) : null}


      {/* Tabs (hidden for locked bracket leagues — rendered inside BracketView hero instead) */}
      {!(league.format === 'bracket' && isBracketLocked) && (
      <div className="relative z-10 mb-6 flex justify-center gap-2 overflow-x-auto no-scrollbar">
        {tabs.map((tab, i) => {
          const isLiveDisabled = tab === 'Live' && league.format === 'nba_dfs' && league.starts_at &&
            new Date(league.starts_at).toISOString().split('T')[0] > new Date().toLocaleDateString('en-CA')

          return (
          <button
            key={tab}
            onClick={() => !isLiveDisabled && setActiveTab(i)}
            className={`relative px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              isLiveDisabled
                ? 'bg-bg-card text-text-muted/40 cursor-not-allowed'
                : activeTab === i
                  ? 'bg-accent text-white'
                  : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            {tab}
            {tab === 'Thread' && threadUnread?.unread && activeTab !== i && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent" />
            )}
          </button>
          )
        })}
      </div>
      )}

      {/* Tab content */}
      {tabs[activeTab] === 'Members' && (
        <MembersList
          members={league.members}
          pendingInvitations={
            league.status === 'open' || (league.status === 'active' && league.joins_locked_at && new Date(league.joins_locked_at) > new Date())
              ? league.pending_invitations
              : []
          }
          commissionerId={league.commissioner_id}
          leagueId={league.id}
          isCommissioner={isCommissioner}
          onUserTap={setSelectedUserId}
          bracketSubmittedIds={!isBracketLocked && league.format === 'bracket' ? new Set((bracketEntries || []).map(e => e.user_id)) : null}
        />
      )}

      {tabs[activeTab] === 'Picks' && league.format === 'pickem' && league.use_league_picks && (
        <PickemView league={league} standings={standings} mode="picks" />
      )}

      {tabs[activeTab] === 'Standings' && league.format === 'pickem' && (
        <PickemView league={league} standings={standings} mode="standings" />
      )}

      {tabs[activeTab] === 'Board' && league.format === 'survivor' && (
        <SurvivorView league={league} />
      )}

      {tabs[activeTab] === 'Board' && league.format === 'squares' && (
        <SquaresView league={league} isCommissioner={isCommissioner} />
      )}

      {league.format === 'bracket' && (isBracketLocked ? (
        /* When locked, always render BracketView so court bg + tabs persist across all tabs */
        <>
          <BracketView
            league={league}
            tab={tabs[activeTab] === 'Standings' ? 'standings' : tabs[activeTab] === 'Thread' ? null : 'bracket'}
            onTabChange={(t) => {
              const idx = tabs.indexOf(t === 'bracket' ? 'Bracket' : 'Standings')
              if (idx !== -1) setActiveTab(idx)
            }}
            tabs={tabs}
            activeTabIndex={activeTab}
            threadUnread={threadUnread?.unread}
            onTabSelect={setActiveTab}
          />
        </>
      ) : (tabs[activeTab] === 'Bracket' || tabs[activeTab] === 'Standings') ? (
        <BracketView
          league={league}
          tab={tabs[activeTab] === 'Standings' ? 'standings' : 'bracket'}
          onTabChange={(t) => {
            const idx = tabs.indexOf(t === 'bracket' ? 'Bracket' : 'Standings')
            if (idx !== -1) setActiveTab(idx)
          }}
          tabs={null}
          activeTabIndex={activeTab}
          threadUnread={threadUnread?.unread}
          onTabSelect={setActiveTab}
        />
      ) : null)}

      {tabs[activeTab] === 'Players' && league.format === 'fantasy' && (
        <div className="relative z-10"><FantasyPlayerBrowser league={league} /></div>
      )}

      {tabs[activeTab] === 'Draft' && league.format === 'fantasy' && (
        <div className="relative z-10"><FantasyDraftRoom league={league} /></div>
      )}

      {tabs[activeTab] === 'My Team' && league.format === 'fantasy' && (
        <div className="relative z-10"><FantasyMyTeam league={league} /></div>
      )}

      {tabs[activeTab] === 'Standings' && league.format === 'fantasy' && (
        <div className="relative z-10"><FantasyStandings league={league} /></div>
      )}

      {tabs[activeTab] === 'Matchups' && league.format === 'fantasy' && (
        <div className="relative z-10"><FantasyMatchup league={league} /></div>
      )}

      {(tabs[activeTab] === 'Roster' || tabs[activeTab] === 'Live' || tabs[activeTab] === 'Standings') && league.format === 'nba_dfs' && (
        <div className="relative z-10">
          <NbaDfsView league={league} tab={tabs[activeTab] === 'Standings' ? 'standings' : tabs[activeTab] === 'Live' ? 'live' : 'roster'} />
        </div>
      )}

      {(tabs[activeTab] === 'Roster' || tabs[activeTab] === 'Live' || tabs[activeTab] === 'Standings') && league.format === 'mlb_dfs' && (
        <div className="relative z-10">
          <MlbDfsView league={league} tab={tabs[activeTab] === 'Standings' ? 'standings' : tabs[activeTab] === 'Live' ? 'live' : 'roster'} />
        </div>
      )}

      {tabs[activeTab] === 'Thread' && (
        <div className="relative z-10"><LeagueThread league={league} /></div>
      )}

      {/* Delete League */}
      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={() => setShowSettingsModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative bg-bg-primary border border-text-primary/20 w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-text-primary">League Settings</h2>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-text-muted hover:text-text-primary text-xl leading-none"
              >
                &times;
              </button>
            </div>

            <LeagueConditions league={league} />

            {isCommissioner && league.settings_editable && (
              <div className="mt-4">
                <LeagueSettingsEditor league={league} updateLeague={updateLeague} hasLockedPicks={league.has_locked_picks} />
              </div>
            )}
          </div>
        </div>
      )}

      {isCommissioner && (
        <div className="mt-12 pt-6 border-t border-border">
          <button
            onClick={async () => {
              if (!window.confirm('Are you sure? All data will be erased.')) return
              try {
                await deleteLeague.mutateAsync(league.id)
                toast('League deleted', 'success')
                navigate('/leagues')
              } catch (err) {
                toast(err.message || 'Failed to delete league', 'error')
              }
            }}
            disabled={deleteLeague.isPending}
            className="text-xs text-text-muted hover:text-incorrect transition-colors disabled:opacity-50"
          >
            {deleteLeague.isPending ? 'Deleting...' : 'Delete League'}
          </button>
        </div>
      )}
    </div>
  )
}
