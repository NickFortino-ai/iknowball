import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useLeague, useLeagueStandings, useUpdateLeague, useDeleteLeague, useBracketTournament, useBracketEntries, useUpdateBracketTournament, useToggleAutoConnect, useThreadUnread, useFantasySettings, useUpdateFantasySettings, useNbaDfsLive, useMlbDfsLive, useLeagueBackdrops, useFantasyMatchupLive } from '../hooks/useLeagues'
import { useAuth } from '../hooks/useAuth'
import MembersList from '../components/leagues/MembersList'
import InvitePlayerModal from '../components/leagues/InvitePlayerModal'
import PickemView from '../components/leagues/PickemView'
import SurvivorView from '../components/leagues/SurvivorView'
import SurvivorStandings from '../components/leagues/SurvivorStandings'
import SquaresView from '../components/leagues/SquaresView'
import BracketView from '../components/leagues/BracketView'
import LeagueThread from '../components/leagues/LeagueThread'
import FantasyDraftRoom from '../components/leagues/FantasyDraftRoom'
import FantasyMyRankings from '../components/leagues/FantasyMyRankings'
import FantasyMyTeam from '../components/leagues/FantasyMyTeam'
import FantasyPlayerBrowser from '../components/leagues/FantasyPlayerBrowser'
import FantasyTrades from '../components/leagues/FantasyTrades'
import FantasyStandings from '../components/leagues/FantasyStandings'
import FantasyMatchup from '../components/leagues/FantasyMatchup'
import FantasyLiveView from '../components/leagues/FantasyLiveView'
import NbaDfsView from '../components/leagues/NbaDfsView'
import MlbDfsView from '../components/leagues/MlbDfsView'
import HrDerbyView from '../components/leagues/HrDerbyView'
import TdPassView from '../components/leagues/TdPassView'
import FantasyUnderfillBanner from '../components/leagues/FantasyUnderfillBanner'
import UserProfileModal from '../components/profile/UserProfileModal'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Avatar from '../components/ui/Avatar'
import { toast } from '../components/ui/Toast'
import { api } from '../lib/api'
import { getBackdropUrl } from '../lib/backdropUrl'

function getLeagueTabs(league, isBracketLocked, fantasySettings) {
  const isOpen = league.status === 'open'
  const memberOrStandings = isOpen ? 'Members' : 'Standings'

  if (league.format === 'pickem') {
    return ['Picks', memberOrStandings, 'Thread']
  }
  if (league.format === 'bracket') {
    return isBracketLocked ? ['Bracket', 'Standings', 'Thread'] : ['Bracket', memberOrStandings, 'Thread']
  }

  if (league.format === 'fantasy') {
    const draftDone = fantasySettings?.draft_status === 'completed'
    const isSalaryCap = fantasySettings?.format === 'salary_cap'
    let tabs
    if (isSalaryCap) {
      tabs = ['My Team', 'Players', 'Live', 'Matchups', 'Trades', memberOrStandings, 'Draft']
    } else {
      // Traditional: Matchups absorbs Live, no separate Live tab
      tabs = ['My Team', 'Matchups', memberOrStandings, 'Players', 'Trades', 'Draft']
    }
    if (!draftDone) tabs.splice(tabs.indexOf('Draft') + 1, 0, 'My Rankings')
    tabs.push('Thread')
    return tabs
  }

  const TABS = {
    survivor: ['Picks', memberOrStandings, 'Thread'],
    squares: ['Board', 'Members', 'Thread'],
    nba_dfs: ['Roster', 'Live', memberOrStandings, 'Thread'],
    mlb_dfs: ['Roster', 'Live', memberOrStandings, 'Thread'],
    hr_derby: ['Picks', memberOrStandings, 'Thread'],
    td_pass: ['Picks', 'History', memberOrStandings, 'Thread'],
  }
  return TABS[league.format] || [memberOrStandings, 'Thread']
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
  td_pass: 'TD Pass Competition',
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

function LeagueConditions({ league, isCommissioner, updateLeague, bracketTournament }) {
  const [editingNarrative, setEditingNarrative] = useState(false)
  const [narrativeText, setNarrativeText] = useState('')
  const settings = league.settings || {}
  const isDaily = settings.pick_frequency === 'daily'
  const toggleAutoConnect = useToggleAutoConnect()
  const { data: fantasySettings } = useFantasySettings(['nba_dfs', 'mlb_dfs', 'hr_derby', 'fantasy'].includes(league.format) ? league.id : null)
  const isTraditionalFantasy = league.format === 'fantasy' && fantasySettings?.format !== 'salary_cap'
  const currentNflWeek = fantasySettings?.current_week || fantasySettings?.single_week || 1
  const { data: liveMatchupData } = useFantasyMatchupLive(
    isTraditionalFantasy ? league.id : null,
    currentNflWeek,
    fantasySettings?.season || 2026
  )
  // Matchups tab glows when any player on either side of user's matchup has a live or in-progress game
  const matchupsLive = (() => {
    if (!liveMatchupData?.matchups || !isTraditionalFantasy) return false
    const myMatchup = liveMatchupData.matchups.find((m) =>
      m.home_user?.id === profile?.id || m.away_user?.id === profile?.id
    )
    if (!myMatchup) return false
    const allSlots = [...(myMatchup.home_roster || []), ...(myMatchup.away_roster || [])]
    const hasLive = allSlots.some((s) => s.game_status === 'live')
    const hasFinal = allSlots.some((s) => s.game_status === 'final')
    const hasUpcoming = allSlots.some((s) => s.game_status === 'upcoming')
    // Glow from first kickoff to last final: any game started (live or final) AND not all done
    return (hasLive || hasFinal) && (hasLive || hasUpcoming)
  })()
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

  // Build narrative description
  function buildNarrative() {
    const lives = settings.lives || 1
    // Use "day" for short leagues (≤7 days) even if pick_frequency is weekly
    const leagueDays = league.starts_at && league.ends_at
      ? Math.ceil((new Date(league.ends_at) - new Date(league.starts_at)) / (1000 * 60 * 60 * 24))
      : null
    const freq = isDaily || (leagueDays != null && leagueDays <= 7) ? 'day' : 'week'
    const dateRange = formatDateRange(league.starts_at, league.ends_at)

    function durationSentence(endCondition) {
      if (league.duration === 'full_season') {
        return `This league runs through the remainder of the season${endCondition ? ` or ${endCondition}` : ''}.`
      }
      if (league.duration === 'playoffs_only') {
        return `This league runs through the playoffs${endCondition ? ` or ${endCondition}` : ''}.`
      }
      if (dateRange) {
        // dateRange is "Starts Apr 5" (no end) or "Apr 5 – Apr 20" (range)
        const isStartOnly = dateRange.startsWith('Starts')
        if (isStartOnly) {
          return `This league starts ${dateRange.replace('Starts ', '')}${endCondition ? ` and runs until ${endCondition}` : ''}.`
        }
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
      const isSalaryCap = fantasySettings?.format === 'salary_cap'
      if (isSalaryCap) {
        const cap = fantasySettings?.salary_cap ? `$${fantasySettings.salary_cap.toLocaleString()}` : '$60,000'
        return `Build a new NFL lineup each week under a ${cap} salary cap. Set your starters, watch live scoring update throughout Sunday, and compete to win the most points each week. Tap any player headshot or name to view their stat line, weekly history, injury status, and the latest news and analysis. Top finishers earn bonus points on the global leaderboard.`
      }
      return `Draft your team, set your starting lineup each week, and compete head-to-head. Manage your roster with free-agent pickups (waivers process Wednesday 3 AM ET), trades, and IR moves. Tap any player headshot or name to view their stat line, weekly history, injury status, and the latest news and analysis. Top finishers earn bonus points on the global leaderboard.`
    }

    if (league.format === 'squares') {
      const ppq = settings.points_per_quarter || [10, 10, 10, 10]
      const totalPts = ppq.reduce((s, q) => s + (q || 0), 0)
      const gameDate = league.starts_at
        ? new Date(league.starts_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' })
        : null
      return `Claim squares on the 10x10 grid. Once all 100 are claimed, digits (0–9) are randomly assigned to each row and column. At the end of each quarter, the square where the last digits of each team's score intersect wins that quarter's payout (${ppq.map((p, i) => `Q${i + 1}: ${p}`).join(', ')} — ${totalPts} pts total).${gameDate ? ` Game day: ${gameDate}.` : ''}`
    }

    if (league.format === 'nba_dfs') {
      const cap = fantasySettings?.salary_cap ? `$${fantasySettings.salary_cap.toLocaleString()}` : '$60,000'
      const isSingleNight = fantasySettings?.season_type === 'single_week'
      if (isSingleNight) {
        return `Build a 9-player NBA lineup under a ${cap} salary cap. Each player locks when their game tips off, but you can swap unlocked players until their game starts. The player with the most fantasy points at the end of the night wins.`
      }
      const metric = fantasySettings?.champion_metric === 'most_wins' ? 'most nightly wins' : 'most total fantasy points'
      return `Build a new 9-player NBA lineup each night under a ${cap} salary cap. Each player locks when their game tips off, but you can swap unlocked players until their game starts. Players earn points based on their real stats — points, rebounds, assists, steals, blocks, and more. Tap a headshot to view player stats and injury info. The champion is determined by ${metric} over the season.`
    }

    if (league.format === 'mlb_dfs') {
      const cap = fantasySettings?.salary_cap ? `$${fantasySettings.salary_cap.toLocaleString()}` : '$50,000'
      const isSingleNight = fantasySettings?.season_type === 'single_week'
      if (isSingleNight) {
        return `Build a 10-player MLB lineup (1 SP, C, 1B, 2B, SS, 3B, 3 OF, UTIL) under a ${cap} salary cap. Each player locks when their game starts. The player with the most fantasy points at the end of the night wins.`
      }
      const metric = fantasySettings?.champion_metric === 'most_wins' ? 'most nightly wins' : 'most total fantasy points'
      return `Build a new 10-player MLB lineup each day — 1 starting pitcher plus 9 position players — under a ${cap} salary cap. Players lock when their game starts. Batters earn points from hits, home runs, RBIs, runs, stolen bases, and walks. Pitchers earn points from innings pitched, strikeouts, wins, and saves. The champion is determined by ${metric} over the season.`
    }

    if (league.format === 'hr_derby') {
      return `Pick MLB players you think will hit home runs each day. The more homers your picks hit, the more points you earn. Track your picks against the rest of the league and climb the standings.`
    }

    if (league.format === 'bracket') {
      const rounds = bracketTournament?.bracket_templates?.rounds || []
      const isBo7 = bracketTournament?.bracket_templates?.series_format === 'best_of_7'
      const roundScoring = rounds
        .filter((r) => r.round_number > 0)
        .sort((a, b) => a.round_number - b.round_number)
        .map((r) => `${r.name}: ${r.points_per_correct} pts`)
        .join(', ')
      const seriesBonus = isBo7 ? ' For each correct winner, predict the series length (4–7 games) for bonus points: +2 for exact, +1 for one game off.' : ''
      const globalImpact = `When the tournament ends, your finishing position affects your global score: top half earns points, bottom half loses points (N+1−2×rank), plus a +10 champion bonus for 1st place.`
      return `Fill out your bracket before the lock deadline. Earn points for each correct pick — later rounds are worth more. ${roundScoring ? `Scoring: ${roundScoring}.` : ''}${seriesBonus} A tiebreaker score prediction on the championship game breaks ties in the standings. ${globalImpact}`
    }

    return null
  }

  const autoNarrative = buildNarrative()
  const narrative = league.settings?.custom_narrative || autoNarrative

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
    <div className="rounded-xl border border-text-primary/20 p-4 mb-6">
        <div>
          <button onClick={toggleCollapsed} className="flex items-center justify-between w-full">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">How this league works</span>
            <svg className={`w-4 h-4 text-text-muted transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {!collapsed && narrative && !editingNarrative && (
            <div className="mt-3 flex items-start gap-2">
              <p className="text-sm text-text-primary leading-relaxed flex-1">{narrative}</p>
              {isCommissioner && (
                <button
                  onClick={(e) => { e.stopPropagation(); setNarrativeText(narrative); setEditingNarrative(true) }}
                  className="shrink-0 text-text-muted hover:text-accent transition-colors mt-0.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
            </div>
          )}
          {!collapsed && editingNarrative && (
            <div className="mt-3 space-y-2">
              <textarea
                value={narrativeText}
                onChange={(e) => setNarrativeText(e.target.value)}
                rows={4}
                className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent resize-none"
              />
              <div className="flex gap-2 justify-end">
                {league.settings?.custom_narrative && (
                  <button
                    onClick={async () => {
                      try {
                        await updateLeague.mutateAsync({ leagueId: league.id, settings: { ...league.settings, custom_narrative: null } })
                        setEditingNarrative(false)
                        toast('Reset to default', 'success')
                      } catch (err) { toast(err.message || 'Failed', 'error') }
                    }}
                    className="text-xs text-text-muted hover:text-text-secondary"
                  >
                    Reset to Default
                  </button>
                )}
                <button
                  onClick={() => setEditingNarrative(false)}
                  className="text-xs text-text-muted hover:text-text-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      await updateLeague.mutateAsync({ leagueId: league.id, settings: { ...league.settings, custom_narrative: narrativeText.trim() || null } })
                      setEditingNarrative(false)
                      toast('Description updated', 'success')
                    } catch (err) { toast(err.message || 'Failed', 'error') }
                  }}
                  className="text-xs font-semibold text-accent"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
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
  const { data: fantasySettings } = useFantasySettings(league.format === 'fantasy' ? league.id : null)
  const updateFantasySettings = useUpdateFantasySettings()

  async function saveIrSpots(n) {
    try {
      const newRoster = { ...(fantasySettings?.roster_slots || {}), ir: n }
      await updateFantasySettings.mutateAsync({ leagueId: league.id, roster_slots: newRoster })
      toast('IR spots saved', 'success')
    } catch (err) {
      toast(err.message || 'Failed to save', 'error')
    }
  }
  const backdropSport = league.sport === 'all' ? undefined : league.sport
  const { data: availableBackdrops } = useLeagueBackdrops(backdropSport)
  const [customBackdropFile, setCustomBackdropFile] = useState(null)
  const [customBackdropPreview, setCustomBackdropPreview] = useState(null)
  const backdropFileRef = useRef(null)

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
    <div className="bg-bg-primary/50 backdrop-blur-sm rounded-xl border border-text-primary/20 p-4 mb-6">
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

      {/* Squares: just show game date (read-only) */}
      {league.format === 'squares' ? (
        <div>
          <label className="block text-xs text-text-muted mb-1">Game Date</label>
          <div className="bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary">
            {league.starts_at
              ? new Date(league.starts_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
              : 'Not set'}
          </div>
        </div>
      ) : (<>
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
                league.duration === opt.value ? 'bg-accent text-white border border-accent' : 'bg-bg-primary text-text-secondary border border-text-primary/20'
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
      </>)}

      {league.format === 'fantasy' && fantasySettings?.format !== 'salary_cap' && fantasySettings?.draft_status !== 'completed' && (
        <>
          <div>
            <label className="block text-xs text-text-muted mb-2">IR Spots</label>
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => saveIrSpots(n)}
                  disabled={updateFantasySettings.isPending}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    (fantasySettings?.roster_slots?.ir ?? 1) === n
                      ? 'bg-accent text-white border border-accent'
                      : 'bg-bg-primary text-text-secondary border border-text-primary/20'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-text-muted mt-1">
              Locked once the draft is completed.
            </p>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-2">Draft Date & Time</label>
            <input
              type="datetime-local"
              defaultValue={toDateTimeLocalValue(fantasySettings?.draft_date)}
              onBlur={(e) => {
                const v = e.target.value
                updateFantasySettings.mutateAsync({
                  leagueId: league.id,
                  draft_date: v ? new Date(v).toISOString() : null,
                }).then(() => toast('Draft time updated', 'success'))
                  .catch((err) => toast(err.message || 'Failed to update', 'error'))
              }}
              className="w-full bg-bg-primary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="text-[10px] text-text-muted mt-1">
              Shown in your local time. Every member sees this in their own timezone. Leave blank to start the draft manually.
            </p>
          </div>
        </>
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
                      (settings.pick_frequency || 'weekly') === opt.value ? 'bg-accent text-white border border-accent' : 'bg-bg-primary text-text-secondary border border-text-primary/20'
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
                    (settings.lock_odds_at || 'game_start') === opt.value ? 'bg-accent text-white border border-accent' : 'bg-bg-primary text-text-secondary border border-text-primary/20'
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
                    (settings.lives || 1) === n ? 'bg-accent text-white border border-accent' : 'bg-bg-primary text-text-secondary border border-text-primary/20'
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
                      (settings.pick_frequency || 'weekly') === opt.value ? 'bg-accent text-white border border-accent' : 'bg-bg-primary text-text-secondary border border-text-primary/20'
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

      {/* Backdrop picker */}
      {expanded && (
        <div className="mt-4">
          <label className="block text-xs text-text-muted mb-2">League Backdrop</label>
          <div className="grid grid-cols-3 gap-2 max-h-[240px] overflow-y-auto scrollbar-hide rounded-lg">
            {/* Submit custom */}
            <button
              type="button"
              onClick={() => backdropFileRef.current?.click()}
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
              ref={backdropFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                if (file.size > 5 * 1024 * 1024) { toast('Image must be under 5MB', 'error'); return }
                setCustomBackdropFile(file)
                setCustomBackdropPreview(URL.createObjectURL(file))
                try {
                  const formData = new FormData()
                  formData.append('image', file)
                  formData.append('league_id', league.id)
                  await api.postForm('/backdrops/submit', formData)
                  toast('Backdrop submitted for review!', 'success')
                } catch (err) {
                  toast(err.message || 'Upload failed', 'error')
                }
              }}
            />
            {/* No backdrop option */}
            <button
              type="button"
              onClick={async () => {
                try {
                  await updateLeague.mutateAsync({ leagueId: league.id, backdrop_image: null })
                  setCustomBackdropFile(null)
                  setCustomBackdropPreview(null)
                  toast('Backdrop removed', 'success')
                } catch (err) { toast(err.message || 'Failed', 'error') }
              }}
              className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-[16/9] flex items-center justify-center ${
                !league.backdrop_image ? 'border-accent ring-1 ring-accent' : 'border-text-primary/20 hover:border-text-primary/40'
              } bg-bg-primary`}
            >
              <span className="text-[10px] text-text-muted font-semibold">None</span>
            </button>
            {(availableBackdrops || []).map((b) => (
              <button
                key={b.filename}
                type="button"
                onClick={async () => {
                  try {
                    await updateLeague.mutateAsync({ leagueId: league.id, backdrop_image: b.filename })
                    setCustomBackdropFile(null)
                    setCustomBackdropPreview(null)
                    toast('Backdrop updated!', 'success')
                  } catch (err) { toast(err.message || 'Failed', 'error') }
                }}
                className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-[16/9] ${
                  league.backdrop_image === b.filename ? 'border-accent ring-1 ring-accent' : 'border-text-primary/20 hover:border-text-primary/40'
                }`}
              >
                <img src={`/backdrops/${b.filename}`} alt={b.label} className="w-full h-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                  <span className="text-[10px] text-white font-medium">{b.label}</span>
                </div>
                {league.backdrop_image === b.filename && (
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-1.5">Custom images submitted for admin review.</p>
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
  const { data: fantasySettings } = useFantasySettings(league?.format === 'fantasy' ? id : null)
  const { data: standings } = useLeagueStandings(id)
  const { data: bracketTournament } = useBracketTournament(league?.format === 'bracket' ? id : null)
  const { data: bracketEntries } = useBracketEntries(league?.format === 'bracket' ? id : null)
  const { data: threadUnread } = useThreadUnread(id)
  const [activeTab, setActiveTab] = useState(0)
  const [tabInitialized, setTabInitialized] = useState(false)
  const todayDate = new Date().toLocaleDateString('en-CA')
  const isDfsFormat = ['nba_dfs', 'mlb_dfs', 'hr_derby'].includes(league?.format)
  const { data: nbaLiveData } = useNbaDfsLive(league?.format === 'nba_dfs' ? id : null, todayDate)
  const { data: mlbLiveData } = useMlbDfsLive(league?.format === 'mlb_dfs' ? id : null, todayDate)
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

  // Deep link via ?tab=Trades, ?tab=My+Team, ?tab=Live, etc.
  useEffect(() => {
    if (!league || tabInitialized) return
    const urlTab = searchParams.get('tab')
    if (urlTab) {
      const tabs = getLeagueTabs(league, false)
      // Match case-insensitively + accept '+' / spaces interchangeably
      const normalize = (s) => s.toLowerCase().replace(/[+_-]/g, ' ').trim()
      const idx = tabs.findIndex((t) => normalize(t) === normalize(urlTab))
      if (idx >= 0) {
        setActiveTab(idx)
        setTabInitialized(true)
        return
      }
    }
  }, [league, searchParams, tabInitialized])

  // Default tab selection
  useEffect(() => {
    if (!league || tabInitialized) return

    // Completed survivor → default to Standings
    if (league.format === 'survivor' && league.status === 'completed') {
      const tabs = getLeagueTabs(league, false)
      const standingsIdx = tabs.indexOf('Standings')
      if (standingsIdx >= 0) setActiveTab(standingsIdx)
      setTabInitialized(true)
      return
    }

    // DFS → default to Live tab when games have started
    const liveData = league.format === 'nba_dfs' ? nbaLiveData : league.format === 'mlb_dfs' ? mlbLiveData : null
    if (!liveData && isDfsFormat) return // still loading

    const hasLiveGames = liveData?.any_live || liveData?.all_final ||
      (liveData?.first_tipoff && new Date(liveData.first_tipoff) <= new Date())

    if (hasLiveGames) {
      const tabs = getLeagueTabs(league, false)
      const liveIdx = tabs.indexOf('Live')
      if (liveIdx >= 0) setActiveTab(liveIdx)
    }
    setTabInitialized(true)
  }, [league, tabInitialized, nbaLiveData, mlbLiveData, isDfsFormat])

  const [adjustingBackdrop, setAdjustingBackdrop] = useState(false)
  const [backdropY, setBackdropY] = useState(50)
  const backdropDragRef = useRef(null)

  // Sync local state when league data changes
  useEffect(() => {
    if (league?.backdrop_y != null) setBackdropY(league.backdrop_y)
  }, [league?.backdrop_y])

  const handleBackdropDrag = useCallback((e) => {
    if (e.cancelable) e.preventDefault()
    const ref = backdropDragRef.current
    if (!ref) return
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const rect = ref.getBoundingClientRect()
    const pct = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100))
    setBackdropY(pct)
  }, [])

  if (isLoading) return <div className="max-w-2xl mx-auto px-4 py-6"><LoadingSpinner /></div>
  if (!league) return null

  const isBracketLocked = league.format === 'bracket' && bracketTournament &&
    new Date(bracketTournament.locks_at) <= new Date()
  const tabs = getLeagueTabs(league, isBracketLocked, fantasySettings)
  const isCommissioner = league.commissioner_id === profile?.id
  // Bracket leagues don't auto-fallback to a default arena — they should be black
  // unless the commissioner explicitly picks a backdrop. The bracket centerpiece
  // image lives on the bracket itself, not as a page-wide backdrop.
  const hasBackdrop = league.backdrop_image || ['nba_dfs', 'mlb_dfs', 'hr_derby', 'fantasy'].includes(league.format)

  function startBackdropDrag(e) {
    e.preventDefault()
    handleBackdropDrag(e)
    const onUp = () => {
      document.removeEventListener('mousemove', handleBackdropDrag)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchmove', handleBackdropDrag)
      document.removeEventListener('touchend', onUp)
    }
    document.addEventListener('mousemove', handleBackdropDrag)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchmove', handleBackdropDrag, { passive: false })
    document.addEventListener('touchend', onUp)
  }

  async function saveBackdropY() {
    try {
      await updateLeague.mutateAsync({ leagueId: league.id, backdrop_y: Math.round(backdropY) })
      setAdjustingBackdrop(false)
      toast('Backdrop position saved', 'success')
    } catch {
      toast('Failed to save position', 'error')
    }
  }

  return (
    <div className={`mx-auto px-4 py-6 relative ${['nba_dfs', 'mlb_dfs', 'hr_derby', 'survivor', 'pickem', 'fantasy', 'squares', 'bracket'].includes(league.format) ? 'max-w-2xl lg:max-w-5xl' : 'max-w-2xl'}`}>
      {/* Full hero backdrop — shows for leagues with a backdrop_image or fantasy/DFS formats */}
      {hasBackdrop && (
        <div
          ref={backdropDragRef}
          className={`absolute inset-x-0 top-0 h-[520px] md:h-[480px] overflow-hidden ${adjustingBackdrop ? 'pointer-events-auto cursor-ns-resize' : 'pointer-events-none'}`}
          style={{ zIndex: adjustingBackdrop ? 30 : 0, touchAction: adjustingBackdrop ? 'none' : 'auto' }}
          onMouseDown={adjustingBackdrop ? startBackdropDrag : undefined}
          onTouchStart={adjustingBackdrop ? startBackdropDrag : undefined}
        >
          <img
            src={league.backdrop_image
              ? getBackdropUrl(league.backdrop_image)
              : league.format === 'nba_dfs' ? '/nba-dfs-bg.png' : '/fantasy-football-bg.png'
            }
            alt=""
            className={`w-full h-full object-cover ${adjustingBackdrop ? 'opacity-60' : 'opacity-30'}`}
            style={{ objectPosition: `center ${backdropY}%` }}
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-bg-primary/20 via-bg-primary/40 to-bg-primary" />
          {adjustingBackdrop && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-white/70 text-sm font-medium bg-black/40 px-3 py-1.5 rounded-lg">Drag up or down to reposition</p>
            </div>
          )}
        </div>
      )}
      {/* Backdrop adjust controls for commissioner */}
      {isCommissioner && hasBackdrop && league.backdrop_image && (
        <div className="absolute top-2 right-4 flex gap-1.5 z-40">
          {adjustingBackdrop ? (
            <>
              <button
                onClick={saveBackdropY}
                className="bg-accent/90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-accent transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => { setAdjustingBackdrop(false); setBackdropY(league.backdrop_y ?? 50) }}
                className="bg-bg-primary/70 text-text-primary text-xs font-semibold px-2 py-1.5 rounded-lg hover:bg-bg-primary transition-colors"
              >
                &times;
              </button>
            </>
          ) : (
            <button
              onClick={() => setAdjustingBackdrop(true)}
              className="bg-bg-primary/70 backdrop-blur-sm text-text-muted text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-bg-primary/90 hover:text-text-primary transition-colors border border-text-primary/20"
            >
              Adjust
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 relative z-10">
        <Link to="/leagues" className="text-xs text-text-muted hover:text-text-secondary transition-colors">
          &larr; My Leagues
        </Link>
        <div className={['bracket', 'fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby', 'survivor', 'pickem', 'squares'].includes(league.format) ? 'text-center' : ''}>
        <div className={`flex items-center gap-2 mt-2 ${['bracket', 'fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby', 'survivor', 'pickem', 'squares'].includes(league.format) ? 'justify-center' : ''}`}>
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
              <button
                onClick={() => setShowInviteModal(true)}
                className="p-2 text-text-primary hover:text-white transition-colors cursor-pointer"
                title="Invite Player"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </button>
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

      {/* Underfill banner — commish-only, only for traditional fantasy
          leagues that haven't drafted yet */}
      {isCommissioner && league.format === 'fantasy' && fantasySettings?.format !== 'salary_cap' && fantasySettings?.draft_status !== 'completed' && fantasySettings?.draft_status !== 'in_progress' && (
        <div className="mt-4">
          <FantasyUnderfillBanner league={league} />
        </div>
      )}

      {/* Champion Card */}
      {league.champion && (() => {
        const mc = league.members?.length || 0
        const sport = league.sport
        const lid = league.id
        const trophySrc = mc >= 14
          ? (['americanfootball_nfl', 'americanfootball_ncaaf'].includes(sport) ? '/trophies/large-football.webp' : ['baseball_mlb'].includes(sport) ? '/trophies/large-baseball.webp' : '/trophies/large-basketball.webp')
          : mc >= 9 ? `/trophies/medium-${(Math.abs([...lid].reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0)) % 3) + 1}.webp`
          : mc >= 5 ? `/trophies/small-${(Math.abs([...lid].reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0)) % 3) + 1}.webp`
          : `/trophies/medal-${(Math.abs([...lid].reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0)) % 3) + 1}.webp`
        // Match TrophyCase proportions so trophies feel consistent across the app
        const trophySizeClass = mc >= 14 ? 'w-36 h-44 md:w-56 md:h-64'
          : mc >= 9 ? 'w-32 h-40 md:w-48 md:h-56'
          : mc >= 5 ? 'w-28 h-32 md:w-40 md:h-48'
          : 'w-20 h-20 md:w-32 md:h-32'
        const outlasted = mc > 1 ? mc - 1 : 0
        return (
        <div className="mb-6 rounded-xl border-2 border-yellow-500 py-6 md:py-8 px-4 md:px-10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none" />
          {/* On mobile keep the existing trophy-left, content-fills layout.
              On desktop center trophy + content as a single tight cluster
              so the trophy doesn't drift to the far left edge. */}
          <div className="relative flex items-center gap-4 md:gap-12 md:justify-center">
            {/* Trophy — left of the content, sized to format */}
            <img
              src={trophySrc}
              alt="Trophy"
              className={`${trophySizeClass} object-contain shrink-0 animate-trophy-float drop-shadow-[0_0_16px_rgba(234,179,8,0.4)]`}
            />
            {/* Content — fills remaining space on mobile, fixed-width on desktop */}
            <div className="flex-1 md:flex-none md:w-80 min-w-0 flex flex-col items-center text-center">
            <button onClick={() => setSelectedUserId(league.champion.user.id)} className="cursor-pointer mb-3">
              {league.champion.user.avatar_url ? (
                <img
                  src={league.champion.user.avatar_url}
                  alt={league.champion.user.display_name}
                  className="w-20 h-20 md:w-28 md:h-28 rounded-full object-cover ring-4 ring-yellow-500"
                />
              ) : (
                <Avatar user={league.champion.user} size="2xl" className="!w-20 !h-20 md:!w-28 md:!h-28 !text-4xl" />
              )}
            </button>
            <div className="font-display text-2xl md:text-4xl text-white truncate max-w-full">
              {league.champion.user.display_name || league.champion.user.username}
            </div>
            <div className="text-sm md:text-base text-text-secondary mt-1">won this league!</div>
            <div className="text-base md:text-xl text-yellow-400 font-semibold mt-2">
              +{league.champion.points} pts earned
            </div>
            {outlasted > 0 && (
              <div className="text-sm md:text-base text-text-muted mt-1">
                Outlasted {outlasted} competitor{outlasted !== 1 ? 's' : ''}
              </div>
            )}
            </div>
          </div>
        </div>
        )
      })()}

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
            className="flex items-center gap-1.5 text-sm font-semibold text-text-primary hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
              className="flex items-center gap-1.5 text-sm font-semibold text-text-primary hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
              className="flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-hover transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
        <div className="rounded-xl border border-text-primary/20 p-4 mb-6 relative z-10 bg-bg-primary/50 backdrop-blur-sm">
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
        <div className="rounded-xl border border-text-primary/20 mb-6 relative z-10 bg-bg-primary/50 backdrop-blur-sm">
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
            className={`relative px-4 py-2 rounded-lg text-sm font-semibold transition-colors backdrop-blur-sm ${
              isLiveDisabled
                ? 'bg-bg-primary/10 text-text-muted/40 cursor-not-allowed border border-text-primary/10'
                : tab === 'Matchups' && matchupsLive && activeTab !== i
                  ? 'bg-bg-primary/20 text-orange-400 border-2 border-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.4)]'
                  : activeTab === i
                    ? 'bg-bg-primary/20 text-accent border-2 border-accent'
                    : 'bg-bg-primary/20 text-text-primary hover:bg-bg-primary/40 border border-text-primary/15'
            }`}
          >
            {tab}
            {tab === 'Matchups' && matchupsLive && activeTab !== i && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            )}
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
        <div className="relative z-10"><MembersList
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
        /></div>
      )}

      {tabs[activeTab] === 'Picks' && league.format === 'pickem' && (
        <div className="relative z-10"><PickemView league={league} standings={standings} mode="picks" /></div>
      )}

      {tabs[activeTab] === 'Standings' && league.format === 'pickem' && (
        <div className="relative z-10"><PickemView league={league} standings={standings} mode="standings" /></div>
      )}

      {tabs[activeTab] === 'Standings' && league.format === 'survivor' && (
        <div className="relative z-10"><SurvivorStandings league={league} onUserTap={setSelectedUserId} /></div>
      )}

      {tabs[activeTab] === 'Standings' && league.format === 'squares' && (
        <div className="relative z-10"><MembersList
          members={league.members}
          pendingInvitations={[]}
          commissionerId={league.commissioner_id}
          leagueId={league.id}
          isCommissioner={isCommissioner}
          onUserTap={setSelectedUserId}
        /></div>
      )}

      {tabs[activeTab] === 'Picks' && league.format === 'survivor' && (
        <div className="relative z-10"><SurvivorView league={league} /></div>
      )}

      {tabs[activeTab] === 'Board' && league.format === 'squares' && (
        <div className="relative z-10"><SquaresView league={league} isCommissioner={isCommissioner} onUserTap={setSelectedUserId} /></div>
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

      {tabs[activeTab] === 'My Rankings' && league.format === 'fantasy' && (
        <div className="relative z-10"><FantasyMyRankings league={league} /></div>
      )}

      {tabs[activeTab] === 'My Team' && league.format === 'fantasy' && (
        <div className="relative z-10"><FantasyMyTeam league={league} /></div>
      )}

      {tabs[activeTab] === 'Standings' && league.format === 'fantasy' && (
        <div className="relative z-10"><FantasyStandings league={league} /></div>
      )}

      {tabs[activeTab] === 'Live' && league.format === 'fantasy' && (
        <div className="relative z-10"><FantasyLiveView league={league} fantasySettings={fantasySettings} /></div>
      )}

      {tabs[activeTab] === 'Trades' && league.format === 'fantasy' && (
        <div className="relative z-10"><FantasyTrades league={league} /></div>
      )}

      {tabs[activeTab] === 'Matchups' && league.format === 'fantasy' && (
        <div className="relative z-10"><FantasyMatchup league={league} fantasySettings={fantasySettings} /></div>
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

      {(tabs[activeTab] === 'Picks' || tabs[activeTab] === 'Standings') && league.format === 'hr_derby' && (
        <div className="relative z-10">
          <HrDerbyView league={league} tab={tabs[activeTab] === 'Standings' ? 'standings' : 'picks'} />
        </div>
      )}

      {(tabs[activeTab] === 'Picks' || tabs[activeTab] === 'History' || tabs[activeTab] === 'Standings') && league.format === 'td_pass' && (
        <div className="relative z-10">
          <TdPassView
            league={league}
            tab={tabs[activeTab] === 'Standings' ? 'standings' : tabs[activeTab] === 'History' ? 'history' : 'picks'}
          />
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
            className="relative bg-bg-primary/80 backdrop-blur-md border border-text-primary/20 w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 max-h-[80vh] overflow-y-auto"
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

            <LeagueConditions league={league} isCommissioner={isCommissioner} updateLeague={updateLeague} bracketTournament={bracketTournament} />

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
