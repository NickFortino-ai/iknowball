import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useLeague, useLeagueStandings, useUpdateLeague, useDeleteLeague, useBracketTournament, useBracketEntries, useUpdateBracketTournament, useToggleAutoConnect, useThreadUnread, useFantasySettings, useUpdateFantasySettings, useNbaDfsLive, useMlbDfsLive, useWnbaDfsLive, useLeagueBackdrops, useFantasyMatchupLive, useFantasyTrades, useJoinOpenLeague, useRequestInvite, useSurveyStatus, useFantasyWeekProjections } from '../hooks/useLeagues'
import SurveyModal from '../components/leagues/SurveyModal'
import { useAcceptInvitation } from '../hooks/useInvitations'
import { buildJoinLink } from '../lib/shareLink'
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
import NflSalaryCapView from '../components/leagues/NflSalaryCapView'
import LeagueMockDraft from '../components/leagues/LeagueMockDraft'
import FantasyMyRankings from '../components/leagues/FantasyMyRankings'
import FantasyMyTeam from '../components/leagues/FantasyMyTeam'
import FantasyPlayerBrowser from '../components/leagues/FantasyPlayerBrowser'
import FantasyTrades from '../components/leagues/FantasyTrades'
import FantasyStandings from '../components/leagues/FantasyStandings'
import FantasyMatchup from '../components/leagues/FantasyMatchup'
import FantasyLiveView from '../components/leagues/FantasyLiveView'
import NbaDfsView from '../components/leagues/NbaDfsView'
import WnbaDfsView from '../components/leagues/WnbaDfsView'
import MlbDfsView from '../components/leagues/MlbDfsView'
import HrDerbyView from '../components/leagues/HrDerbyView'
import StrikeoutsView from '../components/leagues/StrikeoutsView'
import ThreePointView from '../components/leagues/ThreePointView'
import WnbaThreePointView from '../components/leagues/WnbaThreePointView'
import SacksView from '../components/leagues/SacksView'
import IntsView from '../components/leagues/IntsView'
import TacklesView from '../components/leagues/TacklesView'
import ReceptionsView from '../components/leagues/ReceptionsView'
import TdPassView from '../components/leagues/TdPassView'
import LeagueReport from '../components/leagues/LeagueReport'
import FantasyUnderfillBanner from '../components/leagues/FantasyUnderfillBanner'
import FantasyDraftLiveBanner from '../components/leagues/FantasyDraftLiveBanner'
import UserProfileModal from '../components/profile/UserProfileModal'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Avatar from '../components/ui/Avatar'
import { toast } from '../components/ui/Toast'
import { api } from '../lib/api'
import { getBackdropUrl, getBackdropFilterKey } from '../lib/backdropUrl'
import { getSeasonEndDate, isSeasonUnderway } from '../lib/seasonDates'
import { formatStartDateShort, formatEndDateShort, formatEndDateLong } from '../lib/leagueDate'

const REPORT_FORMATS = ['fantasy', 'nba_dfs', 'wnba_dfs', 'mlb_dfs']

function getLeagueTabs(league, isBracketLocked, fantasySettings, isMember = true, salaryCapLiveStarted = false) {
  const isOpen = league.status === 'open'
  const isCompleted = league.status === 'completed'
  const memberOrStandings = isOpen ? 'Members' : 'Standings'
  const reportTab = isCompleted && REPORT_FORMATS.includes(league.format) ? ['Report'] : []

  // Non-member preview tabs — strip member-only surfaces (own-pick entry,
  // private chat, draft room, transactions). Standings/members/bracket/live
  // are public-ish info that gives a real feel for the league.
  if (!isMember) {
    if (league.format === 'bracket') {
      return isBracketLocked ? ['Bracket', 'Standings'] : ['Bracket', memberOrStandings]
    }
    if (league.format === 'squares') {
      return ['Board', 'Members']
    }
    if (league.format === 'fantasy') {
      const isSalaryCap = fantasySettings?.format === 'salary_cap'
      // Hide Live on salary cap until at least one game in the league's
      // relevant week has kicked off — there's nothing to look at before
      // then. Other tabs unaffected.
      return isSalaryCap
        ? [...(salaryCapLiveStarted ? ['Live'] : []), memberOrStandings, ...reportTab]
        : ['Matchups', memberOrStandings, 'Players', ...reportTab]
    }
    if (['nba_dfs', 'wnba_dfs', 'mlb_dfs'].includes(league.format)) {
      return ['Live', memberOrStandings, ...reportTab]
    }
    // pickem, survivor, single-stat contests, td_pass — show standings only
    return [memberOrStandings]
  }

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
      // Hide Live until at least one game in the league's relevant week
      // has kicked off — nothing to look at before then.
      tabs = ['Roster', ...(salaryCapLiveStarted ? ['Live'] : []), memberOrStandings, ...reportTab, 'Thread']
    } else {
      // Traditional: Matchups absorbs Live, no separate Live tab
      tabs = ['My Team', 'Matchups', memberOrStandings, 'Players', 'Transactions', 'Draft']
    }
    if (!isSalaryCap && !draftDone && tabs.includes('Draft')) {
      tabs.splice(tabs.indexOf('Draft') + 1, 0, 'Mock Draft')
    }
    if (!isSalaryCap) tabs.push(...reportTab, 'Thread')
    return tabs
  }

  const TABS = {
    survivor: ['Picks', memberOrStandings, 'Thread'],
    squares: ['Board', 'Members', 'Thread'],
    nba_dfs: ['Roster', 'Live', memberOrStandings, ...reportTab, 'Thread'],
    wnba_dfs: ['Roster', 'Live', memberOrStandings, ...reportTab, 'Thread'],
    mlb_dfs: ['Roster', 'Live', memberOrStandings, ...reportTab, 'Thread'],
    hr_derby: ['Picks', memberOrStandings, 'Thread'],
    strikeouts: ['Picks', memberOrStandings, 'Thread'],
    three_point: ['Picks', memberOrStandings, 'Thread'],
    wnba_three_point: ['Picks', memberOrStandings, 'Thread'],
    sacks: ['Picks', memberOrStandings, 'Thread'],
    ints: ['Picks', memberOrStandings, 'Thread'],
    tackles: ['Picks', memberOrStandings, 'Thread'],
    receptions: ['Picks', memberOrStandings, 'Thread'],
    td_pass: ['Picks', memberOrStandings, 'Thread'],
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
  wnba_dfs: 'WNBA Daily Fantasy',
  mlb_dfs: 'MLB Daily Fantasy',
  hr_derby: 'Home Run Derby',
  strikeouts: 'Strikeouts Contest',
  three_point: 'NBA 3-Point Contest',
  wnba_three_point: 'WNBA 3-Point Contest',
  sacks: 'Sacks Contest',
  ints: 'Interceptions Contest',
  tackles: 'Tackles Contest',
  receptions: 'Receptions Contest',
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
  americanfootball_ufl: 'UFL',
  all: 'All Sports',
}

const DAILY_ELIGIBLE_SPORTS = new Set(['basketball_nba', 'basketball_ncaab', 'basketball_wnba', 'baseball_mlb', 'all'])

function toDateInputValue(isoStr) {
  if (!isoStr) return ''
  // Stored end dates use "end of sports day PT" — next-day 10:00 UTC
  // (= 3 AM PT next day). UTC getters would show that next day, not the
  // commissioner-picked date. Shift back 12h so both that convention AND
  // noon-PT-anchored start dates land squarely in the picked PT day, then
  // format in the PT calendar.
  const d = new Date(new Date(isoStr).getTime() - 12 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

const DURATION_OPTIONS = [
  { value: 'this_week', label: 'This Week' },
  { value: 'custom_range', label: 'Custom Range' },
  { value: 'full_season', label: 'Full Season' },
  { value: 'playoffs_only', label: 'Playoffs Only' },
]

function formatDateRange(startsAt, endsAt) {
  const start = formatStartDateShort(startsAt)
  const end = formatEndDateShort(endsAt)
  if (start && end) return `${start} – ${end}`
  if (start) return `Starts ${start}`
  return null
}

function ScoringRulesDisplay({ rules, format }) {
  const [open, setOpen] = useState(false)
  if (!rules) return null

  const formatLabel = format === 'ppr' ? 'PPR' : format === 'half_ppr' ? 'Half PPR' : format === 'standard' ? 'Standard' : 'Custom'

  const Row = ({ label, value }) => (
    <div className="flex justify-between py-1.5 border-b border-text-primary/5 last:border-0">
      <span className="text-sm text-text-primary">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${value > 0 ? 'text-correct' : value < 0 ? 'text-incorrect' : 'text-text-muted'}`}>
        {value > 0 ? '+' : ''}{value}
      </span>
    </div>
  )

  return (
    <div className="mt-3 pt-3 border-t border-text-primary/10">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full">
        <span className="text-xs font-semibold text-text-secondary">Scoring Rules <span className="text-text-muted font-normal">({formatLabel})</span></span>
        <svg className={`w-4 h-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-text-primary font-bold mb-1.5">Passing</div>
            <Row label="Passing Yard" value={rules.pass_yd} />
            <Row label="Passing TD" value={rules.pass_td} />
            <Row label="Interception" value={rules.pass_int} />
            <Row label="2-Pt Conversion" value={rules.pass_2pt} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-text-primary font-bold mb-1.5">Rushing</div>
            <Row label="Rushing Yard" value={rules.rush_yd} />
            <Row label="Rushing TD" value={rules.rush_td} />
            <Row label="2-Pt Conversion" value={rules.rush_2pt} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-text-primary font-bold mb-1.5">Receiving</div>
            <Row label="Reception" value={rules.rec} />
            <Row label="Receiving Yard" value={rules.rec_yd} />
            <Row label="Receiving TD" value={rules.rec_td} />
            <Row label="2-Pt Conversion" value={rules.rec_2pt} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-text-primary font-bold mb-1.5">Misc</div>
            <Row label="Fumble Lost" value={rules.fum_lost} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-text-primary font-bold mb-1.5">Kicking</div>
            <Row label="FG 0-39 Yards" value={rules.fgm_0_39} />
            <Row label="FG 40-49 Yards" value={rules.fgm_40_49} />
            <Row label="FG 50+ Yards" value={rules.fgm_50_plus} />
            <Row label="Extra Point" value={rules.xpm} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-text-primary font-bold mb-1.5">Team Defense</div>
            <Row label="Sack" value={rules.def_sack} />
            <Row label="Interception" value={rules.def_int} />
            <Row label="Fumble Recovery" value={rules.def_fum_rec} />
            <Row label="Defensive TD" value={rules.def_td} />
            <Row label="Safety" value={rules.def_safety} />
            {rules.def_pa_brackets?.length > 0 && (
              <div className="mt-1.5">
                <div className="text-xs text-text-secondary mb-1">Points Allowed</div>
                {rules.def_pa_brackets.map((b, i) => (
                  <div key={i} className="flex justify-between py-1.5 border-b border-text-primary/5 last:border-0">
                    <span className="text-sm text-text-primary">
                      {b.max >= 999
                        ? `${(rules.def_pa_brackets[i - 1]?.max ?? 0) + 1}+`
                        : `${i === 0 ? '0' : (rules.def_pa_brackets[i - 1].max + 1)}–${b.max}`}
                      {' pts allowed'}
                    </span>
                    <span className={`text-sm font-semibold tabular-nums ${b.pts > 0 ? 'text-correct' : b.pts < 0 ? 'text-incorrect' : 'text-text-muted'}`}>
                      {b.pts > 0 ? '+' : ''}{b.pts}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {rules.bonuses_enabled && (
            <div>
              <div className="text-xs uppercase tracking-wider text-text-primary font-bold mb-1.5">Yardage Bonuses</div>
              {(rules.pass_yd_bonuses || []).map((b, i) => (
                <Row key={`p${i}`} label={`${b.threshold}+ Pass Yards`} value={b.points} />
              ))}
              {(rules.rush_yd_bonuses || []).map((b, i) => (
                <Row key={`r${i}`} label={`${b.threshold}+ Rush Yards`} value={b.points} />
              ))}
              {(rules.rec_yd_bonuses || []).map((b, i) => (
                <Row key={`c${i}`} label={`${b.threshold}+ Rec Yards`} value={b.points} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Mirrors `scaledWinnerBonus` in server/src/jobs/completeLeagues.js — used by
// bracket, NBA DFS, MLB DFS, HR Derby, and TD Pass leagues. Keep in sync.
function scaledWinnerBonusClient(n) {
  if (n >= 41) return 110
  if (n >= 31) return 85
  if (n >= 16) return 60
  if (n >= 11) return 40
  if (n >= 6) return 30
  return 20
}

// Mirrors TRADITIONAL_FANTASY_BONUSES in server/src/jobs/completeLeagues.js
const TRADITIONAL_FANTASY_BONUSES = {
  6:  { 1: 50,  2: 20, 3: 10 },
  8:  { 1: 75,  2: 30, 3: 15 },
  10: { 1: 90,  2: 36, 3: 18 },
  12: { 1: 120, 2: 48, 3: 24 },
  14: { 1: 165, 2: 66, 3: 33 },
  16: { 1: 195, 2: 78, 3: 39 },
  20: { 1: 225, 2: 90, 3: 45 },
}

// Mirrors SALARY_CAP_FULL_SEASON_BONUSES in server/src/jobs/completeLeagues.js
const SALARY_CAP_FULL_SEASON_BONUSES = {
  6:  { 1: 35,  2: 14, 3: 7 },
  8:  { 1: 60,  2: 24, 3: 12 },
  10: { 1: 75,  2: 30, 3: 15 },
  12: { 1: 90,  2: 36, 3: 18 },
  14: { 1: 105, 2: 42, 3: 21 },
  16: { 1: 120, 2: 48, 3: 24 },
  20: { 1: 150, 2: 60, 3: 30 },
}

function snapToClosestSize(table, n) {
  if (table[n]) return n
  const sizes = Object.keys(table).map(Number)
  return sizes.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a))
}

function getTraditionalFantasyBonusClient(rank, n) {
  if (rank > 3) return 0
  return TRADITIONAL_FANTASY_BONUSES[snapToClosestSize(TRADITIONAL_FANTASY_BONUSES, n)][rank]
}

function getSalaryCapFullSeasonBonusClient(rank, n) {
  if (rank > 3) return 0
  return SALARY_CAP_FULL_SEASON_BONUSES[snapToClosestSize(SALARY_CAP_FULL_SEASON_BONUSES, n)][rank]
}

function buildBonusForRank({ leagueFormat, fantasyFormat, seasonType, prorationFraction = 1 }) {
  const fraction = Math.min(1, Math.max(0, prorationFraction))
  if (leagueFormat === 'fantasy' && fantasyFormat === 'salary_cap') {
    if (seasonType === 'single_week') {
      // Server: rank === 1 ? n + 1 : 0 — no proration in single-week mode.
      return (rank, n) => (rank === 1 ? n + 1 : 0)
    }
    // Full season run renders the table values as-is; a mid-season run
    // prorates each row by weeksPlayed / 18 to match the server's
    // getSalaryCapBonus().
    return (rank, n) => Math.round(getSalaryCapFullSeasonBonusClient(rank, n) * fraction)
  }
  if (leagueFormat === 'fantasy') {
    return getTraditionalFantasyBonusClient
  }
  // Default: scaled winner bonus (bracket, NBA DFS, MLB DFS, WNBA DFS,
  // HR Derby, TD Pass, NFL stat contests). Multi-night/week formats
  // prorate the bonus by their fraction of a full regular season to
  // match the server's awardPositionBasedPoints math.
  return (rank, n) => (rank === 1 ? Math.round(scaledWinnerBonusClient(n) * fraction) : 0)
}

// Full-season denominators (in nights for DFS, weeks for NFL stat
// contests) that the server uses to prorate the winner bonus. Mirror of
// completeLeagues.js — keep in sync if those denominators move.
const FULL_SEASON_DENOMINATOR = {
  nba_dfs: { unit: 'days', value: 180 },
  mlb_dfs: { unit: 'days', value: 180 },
  wnba_dfs: { unit: 'days', value: 120 },
  hr_derby: { unit: 'days', value: 180 },
  strikeouts: { unit: 'days', value: 180 },
  three_point: { unit: 'days', value: 180 },
  wnba_three_point: { unit: 'days', value: 120 },
  sacks: { unit: 'weeks', value: 18 },
  ints: { unit: 'weeks', value: 18 },
  tackles: { unit: 'weeks', value: 18 },
  receptions: { unit: 'weeks', value: 18 },
  td_pass: { unit: 'weeks', value: 18 },
}

function computeProrationFraction(league, leagueFormat, fantasySettings) {
  // Salary-cap fantasy: mirror getSalaryCapBonus's mid-season branch —
  // prorate by weeksPlayed / 18 when not a full-season run. We approximate
  // weeksPlayed from the configured date range. A full-season run (>=17
  // weeks starting at week 1) renders the table values as-is.
  const sType = fantasySettings?.season_type
  if (leagueFormat === 'fantasy' && fantasySettings?.format === 'salary_cap' && sType !== 'single_week') {
    if (!league?.starts_at || !league?.ends_at) return 1
    const start = new Date(league.starts_at)
    const end = new Date(league.ends_at)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1
    const days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
    const weeks = Math.max(1, Math.ceil(days / 7))
    if (weeks >= 17) return 1
    return Math.min(1, weeks / 18)
  }
  const denom = FULL_SEASON_DENOMINATOR[leagueFormat]
  if (!denom || !league?.starts_at || !league?.ends_at) return 1
  const start = new Date(league.starts_at)
  const end = new Date(league.ends_at)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1
  const days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
  const span = denom.unit === 'weeks' ? Math.ceil(days / 7) : days
  return Math.min(1, span / denom.value)
}

function ordinalSuffix(r) {
  const v = r % 100
  if (v >= 11 && v <= 13) return `${r}th`
  const last = r % 10
  return `${r}${last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'}`
}

// Survivor bonus structure is tier-based, not rank-based — only the
// winner earns points, scaled to league size. Mirrors the table logic
// in survivorService.js (`winnerBonus`).
const SURVIVOR_BONUS_TIERS = [
  { min: 41, label: '41+ members', bonus: 100 },
  { min: 31, max: 40, label: '31–40 members', bonus: 75 },
  { min: 16, max: 30, label: '16–30 members', bonus: 50 },
  { min: 11, max: 15, label: '11–15 members', bonus: 30 },
  { min: 6,  max: 10, label: '6–10 members', bonus: 20 },
  { min: 0,  max: 5,  label: '5 or fewer members', bonus: 10 },
]

function SurvivorBonusTable({ memberCount }) {
  return (
    <div className="mt-3 rounded-lg border border-border overflow-hidden">
      <div className="px-3 py-1.5 bg-bg-secondary text-xs font-semibold text-text-secondary uppercase tracking-wider">
        Winner Bonus by League Size
      </div>
      <div className="px-3 py-2 text-sm space-y-0.5">
        {SURVIVOR_BONUS_TIERS.map((tier) => {
          const inTier = memberCount >= tier.min && (tier.max == null || memberCount <= tier.max)
          return (
            <div key={tier.label} className={`flex justify-between py-0.5 ${inTier ? '' : 'opacity-50'}`}>
              <span className={inTier ? 'text-text-primary font-semibold' : 'text-text-muted'}>{tier.label}</span>
              <span className={inTier ? 'text-correct font-semibold' : 'text-text-muted'}>+{tier.bonus}</span>
            </div>
          )
        })}
      </div>
      <div className="px-3 py-1.5 border-t border-border bg-bg-secondary text-[11px] text-text-muted">
        Only the last survivor earns points — eliminated players don't lose anything from their global score.
      </div>
    </div>
  )
}

function GlobalPointsTable({ memberCount, bonusForRank, footnote }) {
  if (!memberCount || memberCount < 2) return null
  const computeBonus = bonusForRank || ((rank, n) => (rank === 1 ? scaledWinnerBonusClient(n) : 0))
  const rows = []
  for (let r = 1; r <= memberCount; r++) {
    const positionPts = memberCount + 1 - 2 * r
    const total = positionPts + computeBonus(r, memberCount)
    rows.push({ rank: r, total })
  }
  return (
    <div className="mt-3 rounded-lg border border-border overflow-hidden">
      <div className="px-3 py-1.5 bg-bg-secondary text-xs font-semibold text-text-secondary uppercase tracking-wider">
        Global IKB Points by Finish
      </div>
      <div className="grid grid-cols-2 gap-x-6 px-3 py-2 text-sm">
        {rows.map((row) => (
          <div key={row.rank} className="flex justify-between py-0.5">
            <span className="text-text-primary">{ordinalSuffix(row.rank)}</span>
            <span className={
              row.total > 0 ? 'text-correct font-semibold'
              : row.total < 0 ? 'text-incorrect font-semibold'
              : 'text-text-muted'
            }>
              {row.total > 0 ? `+${row.total}` : row.total}
            </span>
          </div>
        ))}
      </div>
      {footnote && (
        <div className="px-3 py-1.5 border-t border-border bg-bg-secondary text-[11px] text-text-muted">
          {footnote}
        </div>
      )}
    </div>
  )
}

function LeagueConditions({ league, isCommissioner, updateLeague, bracketTournament, bracketEntries, fantasySettings: parentFantasySettings }) {
  const [editingNarrative, setEditingNarrative] = useState(false)
  const [narrativeText, setNarrativeText] = useState('')
  const { profile } = useAuth()
  const settings = league.settings || {}
  const isDaily = settings.pick_frequency === 'daily'
  const toggleAutoConnect = useToggleAutoConnect()
  const { data: fantasySettings } = useFantasySettings(['nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point', 'sacks', 'ints', 'tackles', 'receptions', 'fantasy'].includes(league.format) ? league.id : null)
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

  if (league.format === 'nba_dfs' || league.format === 'wnba_dfs') {
    // NBA / WNBA DFS specific items
    if (fantasySettings?.salary_cap) {
      items.push({ label: 'Salary Cap', value: `$${fantasySettings.salary_cap.toLocaleString()}` })
    }
    const seasonType = fantasySettings?.season_type
    items.push({ label: 'Type', value: seasonType === 'single_week' ? 'Single Night' : 'Full Season' })
    if (fantasySettings?.champion_metric && seasonType !== 'single_week') {
      items.push({ label: 'Champion', value: fantasySettings.champion_metric === 'most_wins' ? 'Most Nightly Wins' : 'Most Total Points' })
    }
    if (league.starts_at) {
      items.push({ label: 'Starts', value: league.format === 'fantasy' ? 'NFL Week 1' : formatStartDateShort(league.starts_at) })
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

    const memberCount = league.members?.length || 0
    function winnerBonus() {
      if (memberCount >= 41) return 110
      if (memberCount >= 31) return 85
      if (memberCount >= 16) return 60
      if (memberCount >= 11) return 40
      if (memberCount >= 6) return 30
      return 20
    }
    const bonusText = `The winner earns a +${winnerBonus()} point bonus.`

    function durationSentence(endCondition) {
      // All-Sports leagues span every sport, so "remainder of the season"
      // doesn't fit. Fall back to the explicit date range instead.
      if (league.duration === 'full_season' && league.sport !== 'all') {
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
      // All-Sports with no explicit range — describe by end date alone
      if (league.ends_at) {
        // Use the shared end-date formatter (shifts back 12h for the
        // end-of-sports-day convention) and append the year for context.
        const shifted = new Date(new Date(league.ends_at).getTime() - 12 * 60 * 60 * 1000)
        const endStr = shifted.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })
        return `This league runs through ${endStr}${endCondition ? ` or ${endCondition}` : ''}.`
      }
      return ''
    }

    if (league.format === 'survivor') {
      const isTouchdown = settings.survivor_mode === 'touchdown'
      const lifeText = lives === 1 ? '1 life' : `${lives} lives`
      const wrongCountText = lives === 1 ? 'wrong' : lives === 2 ? 'wrong twice' : `wrong ${lives} times`
      const tdMissText = lives === 1
        ? "if your player doesn't score, you're out"
        : lives === 2
          ? "if your player doesn't score twice, you're out"
          : `if your player doesn't score ${lives} times, you're out`
      const allElimRule = settings.all_eliminated_survive
        ? ` If all remaining players are eliminated on the same ${freq}, everyone survives.`
        : ''
      const duration = durationSentence('until there is one last survivor')
      if (isTouchdown) {
        return `Pick one player each week to score a non-passing touchdown. You can never pick the same player twice. You have ${lifeText} — ${tdMissText}.${allElimRule} The last player standing wins and earns bonus points on the global leaderboard. ${duration}`
      }
      return `Pick one winning team each ${freq}. You can only pick each team once unless you've used them all. You have ${lifeText} — pick ${wrongCountText} and you're out.${allElimRule} The last player standing wins and earns bonus points on the global leaderboard. ${duration}`
    }

    if (league.format === 'pickem') {
      const gamesText = settings.games_per_week
        ? `Pick up to ${settings.games_per_week} games per ${freq}.`
        : `Pick as many games as you want each ${freq}.`
      const oddsText = settings.lock_odds_at === 'submission' ? ' Odds are locked at the time of submission.' : ''
      const duration = durationSentence(null)
      return `${gamesText}${oddsText} Your net points from picks count toward your global score. The league winner also earns a bonus equal to the number of members. ${duration}`
    }

    if (league.format === 'fantasy') {
      const isSalaryCap = fantasySettings?.format === 'salary_cap'
      if (isSalaryCap) {
        const cap = fantasySettings?.salary_cap ? `$${fantasySettings.salary_cap.toLocaleString()}` : '$60,000'
        return `Build a new NFL lineup each week under a ${cap} salary cap. Set your starters, watch live scoring update throughout Sunday, and compete to win the most points each week. Tap any player headshot or name to view their stat line, weekly history, injury status, and the latest news and analysis. Your finishing position impacts your global IKB score — see the table below.`
      }
      const waiverType = fantasySettings?.waiver_type
      let winnerRule = 'highest waiver priority wins'
      if (waiverType === 'faab') winnerRule = 'highest FAAB bid wins'
      else if (waiverType === 'priority') winnerRule = 'team with the worst record wins (waiver order resets each run based on inverse standings)'
      else if (waiverType === 'rolling') winnerRule = 'best waiver priority wins (winner drops to last in priority for next time)'

      const waiverText = `Dropped players go on waivers — any manager can place a claim during the clearing window, and the ${winnerRule}. Drops Sunday-Tuesday hold for the Wednesday 3 AM ET weekly clearing; drops Wednesday-Saturday clear in 24 hours. Pre-season drops and players on a roster less than 48 hours skip waivers and go straight to free agents.`

      const tradeReview = fantasySettings?.trade_review === 'commissioner' ? ' Trades require commissioner approval.' : ''

      return `Draft your team, set your starting lineup each week, and compete head-to-head. Manage your roster through trades, free-agent pickups, and IR moves.${tradeReview} ${waiverText} Tap any player to view their stats, game log, injury status, and analysis. Your finishing position impacts your global IKB score — see the table below.`
    }

    if (league.format === 'squares') {
      const ppq = settings.points_per_quarter || [10, 10, 10, 10]
      const totalPts = ppq.reduce((s, q) => s + (q || 0), 0)
      const gameDate = league.starts_at
        ? new Date(league.starts_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })
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
      return `Build a new 9-player NBA lineup each night under a ${cap} salary cap. Each player locks when their game tips off, but you can swap unlocked players until their game starts. Players earn points based on their real stats — points, rebounds, assists, steals, blocks, and more. Tap a headshot to view player stats and injury info. The champion is determined by ${metric} over the season. Your finishing position impacts your global IKB score — see the table below.`
    }

    if (league.format === 'wnba_dfs') {
      const cap = fantasySettings?.salary_cap ? `$${fantasySettings.salary_cap.toLocaleString()}` : '$60,000'
      const isSingleNight = fantasySettings?.season_type === 'single_week'
      if (isSingleNight) {
        return `Build a 9-player WNBA lineup under a ${cap} salary cap. Each player locks when their game tips off, but you can swap unlocked players until their game starts. The player with the most fantasy points at the end of the night wins.`
      }
      const metric = fantasySettings?.champion_metric === 'most_wins' ? 'most nightly wins' : 'most total fantasy points'
      return `Build a new 9-player WNBA lineup each night under a ${cap} salary cap. Each player locks when their game tips off, but you can swap unlocked players until their game starts. Players earn points based on their real stats — points, rebounds, assists, steals, blocks, and more. Tap a headshot to view player stats and injury info. The champion is determined by ${metric} over the season. Your finishing position impacts your global IKB score — see the table below.`
    }

    if (league.format === 'mlb_dfs') {
      const cap = fantasySettings?.salary_cap ? `$${fantasySettings.salary_cap.toLocaleString()}` : '$40,000'
      const isSingleNight = fantasySettings?.season_type === 'single_week'
      if (isSingleNight) {
        return `Build a 10-player MLB lineup (1 SP, C, 1B, 2B, SS, 3B, 3 OF, UTIL) under a ${cap} salary cap. Each player locks when their game starts. The player with the most fantasy points at the end of the night wins.`
      }
      const metric = fantasySettings?.champion_metric === 'most_wins' ? 'most nightly wins' : 'most total fantasy points'
      return `Build a new 10-player MLB lineup each day — 1 starting pitcher plus 9 position players — under a ${cap} salary cap. Players lock when their game starts. Batters earn points from hits, home runs, RBIs, runs, stolen bases, and walks. Pitchers earn points from innings pitched, strikeouts, wins, and saves. The champion is determined by ${metric} over the season. Your finishing position impacts your global IKB score — see the table below.`
    }

    if (league.format === 'hr_derby') {
      return [
        'Pick up to 3 MLB hitters each day that you think will hit a home run.',
        'Each player can only be used once per week (Monday–Sunday). All players reset on Monday.',
        'You can change your picks for the current day until games start.',
        'The more homers your picks hit, the more points you earn.',
        'Your finishing position impacts your global IKB score — see the table below.',
      ]
    }

    if (league.format === 'strikeouts') {
      const reuseRule = fantasySettings?.pick_reuse === 'unlimited'
        ? 'No reuse limit — pick the same pitcher on back-to-back days if you want.'
        : 'Each pitcher can only be used once per week (Monday–Sunday). All players reset on Monday.'
      return [
        'Pick up to 3 MLB pitchers each day that you think will rack up strikeouts.',
        reuseRule,
        'You can change your picks for the current day until games start.',
        'Every strikeout your picks throw adds to your league total.',
        'Your finishing position impacts your global IKB score — see the table below.',
      ]
    }

    if (league.format === 'three_point' || league.format === 'wnba_three_point') {
      const isWnba = league.format === 'wnba_three_point'
      const reuseRule = fantasySettings?.pick_reuse === 'unlimited'
        ? 'No reuse limit — pick the same shooter on back-to-back nights if you want.'
        : 'Each player can only be used once per week (Monday–Sunday). All players reset on Monday.'
      return [
        `Pick up to 3 ${isWnba ? 'WNBA' : 'NBA'} shooters each night that you think will hit threes.`,
        reuseRule,
        'You can change your picks for the current day until games start.',
        'The more 3-pointers your picks hit, the more points you earn.',
        'Your finishing position impacts your global IKB score — see the table below.',
      ]
    }

    if (league.format === 'sacks' || league.format === 'ints' || league.format === 'tackles' || league.format === 'receptions') {
      const raw = fantasySettings?.pick_reuse
      const maxUses = raw === 'unlimited' ? Infinity
        : raw === 'season' ? 1
        : (parseInt(raw, 10) || 1)
      const isOffense = league.format === 'receptions'
      const poolNoun = isOffense ? 'pass catcher' : 'defender'
      const reuseRule = maxUses === Infinity
        ? `No reuse limit — pick the same ${poolNoun} as many weeks as you want.`
        : maxUses === 1
          ? `Each ${poolNoun} can only be used once all season.`
          : `Each ${poolNoun} can be used up to ${maxUses} times this season.`
      const stat = league.format === 'sacks' ? 'sack'
        : league.format === 'ints' ? 'interception'
        : league.format === 'tackles' ? 'tackle'
        : 'reception'
      return [
        `Pick up to 3 NFL ${poolNoun}s each week that you think will record ${stat}s.`,
        reuseRule,
        'You can change your picks until each player\'s game starts.',
        `Every ${stat} your picks record adds to your league total.`,
        'Your finishing position impacts your global IKB score — see the table below.',
      ]
    }

    if (league.format === 'td_pass') {
      return `Pick one quarterback each week — you can only pick a QB once all season. Standings rank by total passing touchdowns accumulated across all your picks. Most TDs by end of the regular season wins. Your finishing position impacts your global IKB score — see the table below.`
    }

    if (league.format === 'bracket') {
      const rounds = bracketTournament?.bracket_templates?.rounds || []
      const isBo7 = bracketTournament?.bracket_templates?.series_format === 'best_of_7'
      const roundScoring = rounds
        .filter((r) => r.round_number > 0)
        .sort((a, b) => a.round_number - b.round_number)
        .map((r) => `${r.name}: ${r.points_per_correct} pts`)
        .join(', ')
      const seriesBonus = isBo7 ? ' For each correct winner, predict the series length (4–7 games) for bonus points: +4 for exact, +2 for one game off.' : ''
      const globalImpact = `When the tournament ends, your finishing position impacts your global IKB score — see the table below.`
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
            <>
              <div className="mt-3 flex items-start gap-2">
                {Array.isArray(narrative) ? (
                  <ul className="text-sm text-text-primary leading-relaxed flex-1 space-y-1.5 list-disc list-outside pl-5">
                    {narrative.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                ) : (
                  <p className="text-sm text-text-primary leading-relaxed flex-1">{narrative}</p>
                )}
                {isCommissioner && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      // Array narratives render as bulleted lists. To preserve
                      // that shape when round-tripping through the textarea,
                      // join with newlines on enter, split on newlines on save.
                      // This also fixes the "x.trim is not a function" crash that
                      // happened when the array was passed straight to .trim().
                      setNarrativeText(Array.isArray(narrative) ? narrative.join('\n') : (narrative || ''))
                      setEditingNarrative(true)
                    }}
                    className="shrink-0 text-text-muted hover:text-accent transition-colors mt-0.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>
              {(() => {
                const f = league.format
                const sType = fantasySettings?.season_type
                const fFormat = fantasySettings?.format
                const isMultiNight = (f === 'nba_dfs' || f === 'wnba_dfs' || f === 'mlb_dfs') && sType !== 'single_week'
                const showTable = isMultiNight || f === 'hr_derby' || f === 'strikeouts' || f === 'three_point' || f === 'wnba_three_point' || f === 'sacks' || f === 'ints' || f === 'tackles' || f === 'receptions' || f === 'td_pass' || f === 'bracket' || f === 'fantasy'
                if (f === 'survivor') {
                  // Survivor uses tier-based winner bonus instead of the
                  // rank-tiered table used by DFS / bracket / fantasy. Render
                  // the dedicated SurvivorBonusTable showing the active tier.
                  const distinct = Array.isArray(league.members)
                    ? new Set(league.members.map((m) => m.user_id).filter(Boolean)).size
                    : 0
                  const n = distinct > 0 ? distinct : (league.member_count || 0)
                  return <SurvivorBonusTable memberCount={n} />
                }
                if (!showTable) return null
                // Prefer the actual member array; if the detail endpoint
                // didn't include it (some flows skip it), fall back to
                // league.member_count, then to a reasonable preview count
                // so the modal never silently drops the bonus table after
                // saying "see the table below." A brand-new league has
                // member_count=1 (just the commissioner) which would also
                // be filtered out by GlobalPointsTable's <2 guard, so
                // bump anything <2 up to the 8-row preview.
                const distinctMemberCount = Array.isArray(league.members)
                  ? new Set(league.members.map((m) => m.user_id).filter(Boolean)).size
                  : 0
                const liveMemberCount = distinctMemberCount > 0
                  ? distinctMemberCount
                  : (league.member_count >= 2 ? league.member_count : 8)
                // For fantasy, prefer the configured roster size. For brackets
                // post-lock, use the count of submitted entries — the server's
                // awardBracketStandings runs off standings.length (only entrants),
                // so the displayed table needs to match or the +bonus tier and
                // row count both lie. Members who joined but never submitted
                // a bracket aren't actually competing.
                const isBracketLocked = bracketTournament?.locks_at && new Date(bracketTournament.locks_at) <= new Date()
                const submittedBrackets = Array.isArray(bracketEntries) ? bracketEntries.length : 0
                const tableMemberCount = f === 'fantasy'
                  ? (fantasySettings?.num_teams || liveMemberCount)
                  : f === 'bracket' && isBracketLocked && submittedBrackets >= 2
                    ? submittedBrackets
                    : liveMemberCount
                const prorationFraction = computeProrationFraction(league, f, fantasySettings)
                const bonusFn = buildBonusForRank({ leagueFormat: f, fantasyFormat: fFormat, seasonType: sType, prorationFraction })
                const denom = FULL_SEASON_DENOMINATOR[f]
                const isMidSeasonSalaryCap = f === 'fantasy' && fFormat === 'salary_cap' && sType !== 'single_week' && prorationFraction < 1
                let footnote = null
                if (isMidSeasonSalaryCap) {
                  footnote = 'Winner bonus prorated by weeks played in this mid-season run (~18-week NFL regular season).'
                } else if (denom && prorationFraction < 1) {
                  footnote = `Winner bonus prorated by league duration (${denom.unit === 'weeks' ? '~18-week NFL regular season' : `~${denom.value}-${denom.unit} ${f === 'wnba_dfs' ? 'WNBA' : f === 'mlb_dfs' ? 'MLB' : 'NBA'} regular season`}).`
                }
                return <GlobalPointsTable memberCount={tableMemberCount} bonusForRank={bonusFn} footnote={footnote} />
              })()}
            </>
          )}
          {!collapsed && editingNarrative && (
            <div className="mt-3 space-y-2">
              <textarea
                value={narrativeText}
                onChange={(e) => setNarrativeText(e.target.value)}
                rows={Math.max(4, narrativeText.split('\n').length + 1)}
                className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent resize-none"
              />
              <p className="text-[10px] text-text-muted">
                Each line renders as a bullet point. Single line shows as a paragraph.
              </p>
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
                      // Multi-line → store as array (renders as bulleted list).
                      // Single line → store as string (renders as paragraph).
                      // Empty → null (revert to default narrative).
                      const raw = (narrativeText || '').trim()
                      const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean)
                      const saved = lines.length === 0
                        ? null
                        : lines.length === 1
                          ? lines[0]
                          : lines
                      await updateLeague.mutateAsync({ leagueId: league.id, settings: { ...league.settings, custom_narrative: saved } })
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
      {/* Scoring rules display — visible to all members in fantasy leagues */}
      {league.format === 'fantasy' && fantasySettings?.scoring_rules && !collapsed && (
        <ScoringRulesDisplay rules={fantasySettings.scoring_rules} format={fantasySettings.scoring_format} />
      )}

      {league.is_member !== false && league.status !== 'completed' && !league.all_members_connected && (
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

function EndDateEditor({ league, saveDate }) {
  const seasonEnd = league.sport && league.sport !== 'all' ? getSeasonEndDate(league.sport) : null
  const currentEndsAt = toDateInputValue(league.ends_at)
  const [mode, setMode] = useState(seasonEnd && currentEndsAt === seasonEnd ? 'season' : 'custom')
  const seasonLabel = isSeasonUnderway(league.sport) ? 'Remainder of Regular Season' : 'Full Season'

  function handleSeasonClick() {
    if (!seasonEnd) return
    setMode('season')
    if (currentEndsAt !== seasonEnd) saveDate('ends_at', seasonEnd)
  }

  return (
    <div>
      <label className="block text-xs text-text-muted mb-1">End Date</label>
      {seasonEnd && (
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={handleSeasonClick}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              mode === 'season' ? 'bg-accent text-white' : 'bg-bg-input border border-border text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            {seasonLabel}
          </button>
          <button
            type="button"
            onClick={() => setMode('custom')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              mode === 'custom' ? 'bg-accent text-white' : 'bg-bg-input border border-border text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            Custom Date
          </button>
        </div>
      )}
      {mode === 'custom' && (
        <>
          <input
            type="date"
            defaultValue={currentEndsAt}
            max={seasonEnd || undefined}
            onBlur={(e) => {
              if (!e.target.value) return
              if (seasonEnd && e.target.value > seasonEnd) {
                toast(`End date can't be later than the ${league.sport.split('_').pop().toUpperCase()} regular-season end (${new Date(seasonEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}).`, 'error')
                e.target.value = currentEndsAt
                return
              }
              saveDate('ends_at', e.target.value)
            }}
            className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          />
          {seasonEnd && (
            <p className="text-[10px] text-text-muted mt-1">Capped at the {league.sport.split('_').pop().toUpperCase()} regular-season end ({new Date(seasonEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}).</p>
          )}
        </>
      )}
      <p className="text-[10px] text-text-primary mt-1">All games on this date are included. The league closes after the last game goes final.</p>
    </div>
  )
}

function LeagueSettingsEditor({ league, updateLeague, hasLockedPicks }) {
  const [expanded, setExpanded] = useState(false)
  const settings = league.settings || {}
  const isDaily = league.settings?.pick_frequency === 'daily'
  const { data: tournament } = useBracketTournament(league.format === 'bracket' ? league.id : null)
  const updateTournament = useUpdateBracketTournament()
  const { data: fantasySettings } = useFantasySettings(['fantasy', 'mlb_dfs', 'sacks', 'ints', 'tackles', 'receptions', 'three_point', 'wnba_three_point', 'hr_derby', 'strikeouts'].includes(league.format) ? league.id : null)
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
  const backdropSport = getBackdropFilterKey(league)
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
        [field]: value,
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
      ) : league.format === 'survivor' ? (
        // Survivor: only the Start Date is editable up until the first pick
        // is locked. The settings editor for other formats includes Duration
        // and End Date pickers, but those don't apply here — survivor always
        // runs to the season end date / All-Sports end date by design.
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
          <p className="text-[10px] text-text-muted mt-1">Picks open when the first game on this date loads.</p>
        </div>
      ) : (league.format === 'bracket' || league.format === 'td_pass' || league.format === 'sacks' || league.format === 'ints' || league.format === 'tackles' || league.format === 'receptions' || (league.format === 'fantasy' && fantasySettings?.format !== 'salary_cap')) ? null : (<>
      {/* Duration — options match what was offered in Create League for
          this format. Daily-pick contests (3-Point, HR Derby, Strikeouts,
          MLB DFS) only ever offered Full Season + Select Date. Generic
          formats (Pick'em, Squares, NBA DFS Salary Cap) keep the full
          set with This Week + Playoffs Only. */}
      {(() => {
      const dailyContestFormats = ['three_point', 'wnba_three_point', 'hr_derby', 'strikeouts', 'mlb_dfs', 'wnba_dfs', 'nba_dfs']
      const formatDurationOptions = dailyContestFormats.includes(league.format)
        ? [
            { value: 'full_season', label: 'Full Season' },
            { value: 'custom_range', label: 'Select Date' },
          ]
        : DURATION_OPTIONS
      return (
      <div>
        <label className="block text-xs text-text-muted mb-2">Duration</label>
        <div className="grid grid-cols-2 gap-2">
          {formatDurationOptions.map((opt) => (
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
      )
      })()}

      {/* Custom date range — full pickers */}
      {league.duration === 'custom_range' && (
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
      )}

      {/* End Date — hidden for traditional fantasy (completion is driven by championship matchup) */}
      {league.ends_at && !(league.format === 'fantasy' && fantasySettings?.format !== 'salary_cap') && (
        <EndDateEditor
          league={league}
          saveDate={saveDate}
        />
      )}
      </>)}

      {league.format === 'mlb_dfs' && (
        <div>
          <label className="block text-xs text-text-muted mb-2">Salary Cap</label>
          <div className="flex flex-wrap gap-2">
            {[40000, 45000, 50000].map((n) => {
              const current = fantasySettings?.salary_cap ?? 40000
              return (
                <button
                  key={n}
                  onClick={async () => {
                    try {
                      await updateFantasySettings.mutateAsync({ leagueId: league.id, salary_cap: n })
                      toast('Salary cap updated', 'success')
                    } catch (err) {
                      toast(err.message || 'Failed to update', 'error')
                    }
                  }}
                  disabled={updateFantasySettings.isPending}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    current === n
                      ? 'bg-accent text-white border border-accent'
                      : 'bg-bg-primary text-text-secondary border border-text-primary/20'
                  } ${updateFantasySettings.isPending && current !== n ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  ${n.toLocaleString()}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-text-primary mt-1">
            Applies to every member's next roster submission. Existing rosters keep the cap they were saved with.
          </p>
        </div>
      )}

      {(league.format === 'sacks' || league.format === 'ints' || league.format === 'tackles' || league.format === 'receptions') && (() => {
        const isOffense = league.format === 'receptions'
        const noun = isOffense ? 'Pass Catcher' : 'Defender'
        // Server stores 'season' as the legacy alias for '1'. Treat both as the same active state.
        const raw = fantasySettings?.pick_reuse
        const current = raw === 'season' ? '1' : (raw || '1')
        const options = [
          { value: '1', label: '1x' },
          { value: '2', label: '2x' },
          { value: '3', label: '3x' },
          { value: '4', label: '4x' },
          { value: 'unlimited', label: 'Unlimited' },
        ]
        return (
          <div>
            <label className="block text-xs text-text-muted mb-2">Max Uses per {noun}</label>
            <div className="flex flex-wrap gap-2">
              {options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={async () => {
                    try {
                      await updateFantasySettings.mutateAsync({ leagueId: league.id, pick_reuse: opt.value })
                      toast('Reuse limit updated', 'success')
                    } catch (err) {
                      toast(err.message || 'Failed to update', 'error')
                    }
                  }}
                  disabled={updateFantasySettings.isPending}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    current === opt.value
                      ? 'bg-accent text-white border border-accent'
                      : 'bg-bg-primary text-text-secondary border border-text-primary/20'
                  } ${updateFantasySettings.isPending && current !== opt.value ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-text-primary mt-1">
              How many times a single {noun.toLowerCase()} can be picked across the season.
            </p>
          </div>
        )
      })()}

      {league.format === 'fantasy' && fantasySettings?.format !== 'salary_cap' && fantasySettings?.draft_status !== 'completed' && (
        <>
          <div>
            <label className="block text-xs text-text-muted mb-2">Number of Teams</label>
            <div className="flex flex-wrap gap-2">
              {[6, 8, 10, 12, 14, 16, 20].map((n) => {
                const memberCount = league.members?.length ?? league.member_count ?? 0
                const disabled = updateFantasySettings.isPending || n < memberCount
                return (
                  <button
                    key={n}
                    onClick={async () => {
                      try {
                        await updateFantasySettings.mutateAsync({ leagueId: league.id, num_teams: n })
                        toast('Number of teams updated', 'success')
                      } catch (err) {
                        toast(err.message || 'Failed to update', 'error')
                      }
                    }}
                    disabled={disabled}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      (fantasySettings?.num_teams ?? 10) === n
                        ? 'bg-accent text-white border border-accent'
                        : 'bg-bg-primary text-text-secondary border border-text-primary/20'
                    } ${disabled && (fantasySettings?.num_teams ?? 10) !== n ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-text-primary mt-1">
              Can't shrink below the current member count. Locked once the draft completes.
            </p>
          </div>
          {fantasySettings?.draft_mode !== 'offline' && (
            <div>
              <label className="block text-xs text-text-muted mb-2">Draft Pick Timer</label>
              <div className="flex gap-2">
                {[
                  { value: 60, label: '60s' },
                  { value: 90, label: '90s' },
                  { value: 120, label: '2min' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={async () => {
                      try {
                        await updateFantasySettings.mutateAsync({ leagueId: league.id, draft_pick_timer: opt.value })
                        toast('Draft pick timer updated', 'success')
                      } catch (err) {
                        toast(err.message || 'Failed to update', 'error')
                      }
                    }}
                    disabled={updateFantasySettings.isPending}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      (fantasySettings?.draft_pick_timer ?? 90) === opt.value
                        ? 'bg-accent text-white border border-accent'
                        : 'bg-bg-primary text-text-secondary border border-text-primary/20'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-text-primary mt-1">
                Time each manager has on the clock per pick. Auto-pick fires when the timer runs out.
              </p>
            </div>
          )}
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
            <p className="text-[10px] text-text-primary mt-1">
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
            <p className="text-[10px] text-text-primary mt-1">
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
              className="w-full max-w-full box-border bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent appearance-none [-webkit-appearance:none]"
            />
            <div className="text-[10px] text-text-primary mt-1">Users must submit brackets before this time</div>
          </div>
        </>
      )}
      {/* Visibility toggle — hidden once the league is active because it
          stops affecting joinability and just confuses the commish. */}
      {expanded && league.status !== 'active' && (
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[240px] overflow-y-auto scrollbar-hide rounded-lg">
            {/* Submit custom */}
            <div className="relative" style={{ paddingBottom: '56.25%' }}>
              <button
                type="button"
                onClick={() => backdropFileRef.current?.click()}
                className={`absolute inset-0 rounded-lg overflow-hidden border-2 border-dashed transition-all flex flex-col items-center justify-center gap-1 ${
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
            </div>
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
            <div className="relative" style={{ paddingBottom: '56.25%' }}>
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
                className={`absolute inset-0 rounded-lg overflow-hidden border-2 transition-all flex items-center justify-center ${
                  !league.backdrop_image ? 'border-accent ring-1 ring-accent' : 'border-text-primary/20 hover:border-text-primary/40'
                } bg-bg-primary`}
              >
                <span className="text-[10px] text-text-muted font-semibold">None</span>
              </button>
            </div>
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
                className={`relative block w-full rounded-lg overflow-hidden border-2 transition-all ${
                  league.backdrop_image === b.filename ? 'border-accent ring-1 ring-accent' : 'border-text-primary/20 hover:border-text-primary/40'
                }`}
              >
                <img
                  src={getBackdropUrl(b.filename)}
                  alt={b.label}
                  width={1920}
                  height={1080}
                  loading="lazy"
                  decoding="async"
                  className="block w-full h-auto"
                />
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
  // For salary cap leagues, drive Live-tab visibility on whether the
  // league's relevant week has any kicked-off game. Single-week leagues
  // scope to their single_week; full-season scope to the current week.
  const salaryCapRelevantWeek = (() => {
    if (league?.format !== 'fantasy') return null
    if (fantasySettings?.format !== 'salary_cap') return null
    if (fantasySettings?.season_type === 'single_week') return fantasySettings?.single_week || null
    return fantasySettings?.current_week || null
  })()
  const { data: salaryCapWeekContext } = useFantasyWeekProjections(league?.id, salaryCapRelevantWeek)
  const salaryCapLiveStarted = !!salaryCapWeekContext?.liveStarted
  const { data: standings } = useLeagueStandings(id)
  const { data: bracketTournament } = useBracketTournament(league?.format === 'bracket' ? id : null)
  const { data: bracketEntries } = useBracketEntries(league?.format === 'bracket' ? id : null)
  const { data: threadUnread } = useThreadUnread(id)
  const { data: fantasyTradesData } = useFantasyTrades(league?.format === 'fantasy' ? id : null)
  const pendingReviewCount = Array.isArray(fantasyTradesData) ? fantasyTradesData.filter((t) => t.status === 'pending_review').length : 0
  const acceptInvitation = useAcceptInvitation()
  const joinOpenLeague = useJoinOpenLeague()
  const requestInvite = useRequestInvite()
  const { data: surveyStatus } = useSurveyStatus(id)
  const [surveyOpen, setSurveyOpen] = useState(true)
  const [inviteRequested, setInviteRequested] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [tabInitialized, setTabInitialized] = useState(false)
  const todayDate = new Date().toLocaleDateString('en-CA')
  const isDfsFormat = ['nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'three_point', 'wnba_three_point'].includes(league?.format)
  const { data: nbaLiveData } = useNbaDfsLive(league?.format === 'nba_dfs' ? id : null, todayDate)
  const { data: wnbaLiveData } = useWnbaDfsLive(league?.format === 'wnba_dfs' ? id : null, todayDate)
  const { data: mlbLiveData } = useMlbDfsLive(league?.format === 'mlb_dfs' ? id : null, todayDate)
  // ?invite=1 opens the modal; ?invite=<username> opens it pre-filled.
  const inviteParam = searchParams.get('invite')
  const [showInviteModal, setShowInviteModal] = useState(!!inviteParam)
  const initialInviteUsername = inviteParam && inviteParam !== '1' ? inviteParam : null
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

  // Fantasy team name
  const isTraditionalFantasy = league?.format === 'fantasy' && fantasySettings?.format !== 'salary_cap'
  const currentNflWeek = fantasySettings?.current_week || fantasySettings?.single_week || 1
  const { data: liveMatchupData } = useFantasyMatchupLive(
    isTraditionalFantasy ? id : null,
    currentNflWeek,
    fantasySettings?.season || 2026
  )
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
    return (hasLive || hasFinal) && (hasLive || hasUpcoming)
  })()
  const backdropSport = getBackdropFilterKey(league)
  const { data: availableBackdrops } = useLeagueBackdrops(backdropSport)
  const myMembership = league?.members?.find((m) => m.user_id === profile?.id)
  const [showTeamNameModal, setShowTeamNameModal] = useState(false)
  const [teamNameInput, setTeamNameInput] = useState('')
  const [noteText, setNoteText] = useState('')
  const noteRef = useRef(null)
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showBackdropPicker, setShowBackdropPicker] = useState(false)
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
    const liveData = league.format === 'nba_dfs' ? nbaLiveData : league.format === 'wnba_dfs' ? wnbaLiveData : league.format === 'mlb_dfs' ? mlbLiveData : null
    if (!liveData && isDfsFormat) return // still loading

    const hasLiveGames = liveData?.any_live || liveData?.all_final ||
      (liveData?.first_tipoff && new Date(liveData.first_tipoff) <= new Date())

    if (hasLiveGames) {
      const tabs = getLeagueTabs(league, false)
      const liveIdx = tabs.indexOf('Live')
      if (liveIdx >= 0) setActiveTab(liveIdx)
    }
    setTabInitialized(true)
  }, [league, tabInitialized, nbaLiveData, wnbaLiveData, mlbLiveData, isDfsFormat])

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
  const isCommissioner = league.commissioner_id === profile?.id
  // Non-members can preview a league before committing. The server returns
  // a stripped-but-useful detail payload with `is_member: false` so the page
  // can render normally; we just gate write-action UI and show a prominent
  // Join CTA at the top.
  const isMember = league.is_member !== false
  const pendingInvitation = league.my_pending_invitation
  const tabs = getLeagueTabs(league, isBracketLocked, fantasySettings, isMember, salaryCapLiveStarted)
  // Bracket leagues don't auto-fallback to a default arena — they should be black
  // unless the commissioner explicitly picks a backdrop. The bracket centerpiece
  // image lives on the bracket itself, not as a page-wide backdrop.
  const hasBackdrop = league.backdrop_image || ['nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point', 'sacks', 'ints', 'tackles', 'receptions', 'fantasy'].includes(league.format)

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

  async function handleJoinFromPreview() {
    try {
      if (pendingInvitation) {
        await acceptInvitation.mutateAsync(pendingInvitation.id)
        toast(`You've joined ${league.name}!`, 'success')
      } else if (league.visibility === 'open') {
        await joinOpenLeague.mutateAsync(league.id)
        toast(`You've joined ${league.name}!`, 'success')
      }
    } catch (err) {
      toast(err.message || 'Failed to join league', 'error')
    }
  }

  async function handleRequestInvite() {
    try {
      const result = await requestInvite.mutateAsync(league.id)
      setInviteRequested(true)
      if (result?.status === 'invitation_pending') {
        toast('You already have a pending invitation — check your notifications', 'info')
      } else if (result?.status === 'already_sent') {
        toast('Already sent — the commissioner will follow up', 'info')
      } else {
        toast('Request sent! The commissioner will be notified.', 'success')
      }
    } catch (err) {
      toast(err.message || 'Failed to send request', 'error')
    }
  }

  // Only show the preview banner when the user has a way to join: either
  // they have a pending invitation, or the league is publicly open.
  const canJoinFromPreview = !isMember && (pendingInvitation || league.visibility === 'open')
  const joinButtonLabel = pendingInvitation ? 'Accept Invitation' : 'Join League'
  const joinPending = acceptInvitation.isPending || joinOpenLeague.isPending

  return (
    <div className="relative">
      {/* Non-member preview banner — sticky to the top so it stays visible
          while the user scrolls through standings, members, and settings.
          Tucks under the global navbar (z-40) via z-30. */}
      {!isMember && canJoinFromPreview && (
        <div className="sticky top-14 z-30 bg-accent text-white shadow-lg" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider opacity-80">Previewing this league</div>
              <div className="text-sm font-semibold truncate">
                {pendingInvitation
                  ? `Invited by @${pendingInvitation.inviter?.username || 'someone'}`
                  : `Check it out — open to all`}
              </div>
            </div>
            <button
              onClick={handleJoinFromPreview}
              disabled={joinPending}
              className="bg-white text-accent font-display text-base px-5 py-2 rounded-lg hover:bg-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
            >
              {joinPending ? 'Joining…' : joinButtonLabel}
            </button>
          </div>
        </div>
      )}
      {!isMember && !canJoinFromPreview && (
        <div className="sticky top-14 z-30 bg-bg-card border-b border-text-primary/15">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-text-muted">Previewing this league</div>
              <div className="text-sm text-text-secondary truncate">Invite-only — ask the commissioner to invite you</div>
            </div>
            <button
              onClick={handleRequestInvite}
              disabled={requestInvite.isPending || inviteRequested}
              className="bg-accent text-white font-display text-base px-5 py-2 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
            >
              {inviteRequested ? 'Request Sent' : requestInvite.isPending ? 'Sending…' : 'Request Invite'}
            </button>
          </div>
        </div>
      )}
      {/* Full hero backdrop — full viewport width, positioned absolutely behind content */}
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
              : (league.format === 'nba_dfs' || league.format === 'wnba_dfs') ? '/nba-dfs-bg.png' : '/fantasy-football-bg.png'
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
      {/* Backdrop adjust controls for commissioner — desktop only.
          On mobile the league hero image fills width-first, so the Y offset
          rarely has any visible effect; the user profile modal keeps it
          since avatar tiles do crop vertically on phones. */}
      {isCommissioner && hasBackdrop && league.backdrop_image && (
        <div className="absolute top-2 right-4 hidden md:flex gap-1.5 z-40">
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

      <div className="mx-auto px-4 py-6 relative max-w-2xl lg:max-w-6xl lg:overflow-x-visible overflow-x-hidden">

      {/* Header */}
      <div className="mb-6 relative z-10">
        <Link to="/leagues" className="text-xs text-text-muted hover:text-text-secondary transition-colors">
          &larr; My Leagues
        </Link>
        <div className={['bracket', 'fantasy', 'nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point', 'sacks', 'ints', 'tackles', 'receptions', 'pickem', 'squares', 'survivor', 'td_pass'].includes(league.format) ? 'text-center' : ''}>
        <div className={`flex items-center gap-2 mt-2 ${['bracket', 'fantasy', 'nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point', 'sacks', 'ints', 'tackles', 'receptions', 'pickem', 'squares', 'survivor', 'td_pass'].includes(league.format) ? 'justify-center' : ''}`}>
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
        <div className={`flex items-center gap-5 mt-2 ${['bracket', 'fantasy', 'nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point', 'sacks', 'ints', 'tackles', 'receptions', 'pickem', 'squares', 'survivor', 'td_pass'].includes(league.format) ? 'justify-center' : ''}`}>
          {isCommissioner && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded text-tier-hof">
              Commissioner
            </span>
          )}
          {/* Invite action icons. Any member can copy/share the invite link
              for open-visibility leagues (the banner explicitly tells them to);
              only the commissioner sees the "Invite Player" autocomplete that
              creates server-side invitations. */}
          {(isCommissioner || league.visibility === 'open') && (
            league.status === 'open'
            || (league.format === 'fantasy' && fantasySettings?.draft_status === 'pending')
            || (league.status === 'active' && league.joins_locked_at && new Date(league.joins_locked_at) > new Date())
          ) && league.format !== 'bracket' && (
            <div className="flex items-center gap-5">
              <button
                onClick={async () => {
                  const url = buildJoinLink(league.invite_code)
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
              {navigator.share && league.status !== 'open' && !(league.format === 'fantasy' && fantasySettings?.draft_status === 'pending') && (
                <button
                  onClick={async () => {
                    const url = buildJoinLink(league.invite_code)
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
            {league.format === 'fantasy' && fantasySettings?.format === 'salary_cap'
              ? 'Starts with NFL Week 1'
              : `Starts ${formatStartDateShort(league.starts_at)}`}
          </div>
        )}
        </div>
      </div>

      {/* Underfill banner — commish-only, only for traditional fantasy
          leagues that haven't drafted yet */}
      {isCommissioner && league.format === 'fantasy' && fantasySettings?.format !== 'salary_cap' && fantasySettings?.draft_status !== 'completed' && fantasySettings?.draft_status !== 'in_progress' && (
        <div className="mt-4">
          <FantasyUnderfillBanner league={league} fantasySettings={fantasySettings} />
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
              const url = buildJoinLink(league.invite_code, { isBracket: true })
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
                const url = buildJoinLink(league.invite_code, { isBracket: true })
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
        <InvitePlayerModal leagueId={league.id} inviteCode={league.invite_code} leagueName={league.name} format={league.format} memberIds={league.members?.map(m => m.user_id) || []} initialUsername={initialInviteUsername} onClose={() => {
          setShowInviteModal(false)
          if (searchParams.has('invite')) {
            searchParams.delete('invite')
            setSearchParams(searchParams, { replace: true })
          }
        }} />
      )}

      {isMember && surveyOpen && surveyStatus?.surveyType && (
        <SurveyModal
          leagueId={league.id}
          surveyType={surveyStatus.surveyType}
          questions={surveyStatus.questions}
          sportLabel={surveyStatus.sportLabel}
          topNote={surveyStatus.topNote}
          onClose={() => setSurveyOpen(false)}
        />
      )}

      {/* Commissioner's Note */}
      {editingNote ? (
        <div className="rounded-xl border border-text-primary/20 p-4 mb-6 relative z-10 bg-bg-primary/30 backdrop-blur-sm">
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
        <div className="rounded-xl border border-text-primary/20 mb-6 relative z-10 bg-bg-primary/30 backdrop-blur-sm">
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


      {/* Fantasy team name (traditional only) */}
      {isTraditionalFantasy && profile && (
        <div className="relative z-10 text-center mb-4">
          <button
            onClick={() => { setTeamNameInput(myMembership?.fantasy_team_name || ''); setShowTeamNameModal(true) }}
            className="inline-flex items-center gap-1.5 group"
          >
            {myMembership?.fantasy_team_name ? (
              <span className="font-display text-xl italic text-text-primary uppercase tracking-wide">
                {myMembership.fantasy_team_name}
              </span>
            ) : (
              <span className="text-sm text-text-muted">+ Set team name</span>
            )}
            <svg className="w-3 h-3 text-text-muted group-hover:text-text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>
      )}

      {/* Team name settings modal */}
      {showTeamNameModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={() => setShowTeamNameModal(false)}>
          <div className="bg-bg-primary border border-text-primary/20 rounded-2xl p-6 max-w-sm mx-4 w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg text-text-primary mb-4">Team Name</h3>
            <input
              type="text"
              value={teamNameInput}
              onChange={(e) => setTeamNameInput(e.target.value)}
              placeholder="Enter your team name"
              maxLength={30}
              className="w-full px-3 py-2 rounded-lg bg-bg-card border border-text-primary/20 text-text-primary text-sm mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowTeamNameModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-text-muted hover:text-text-primary"
              >Cancel</button>
              <button
                onClick={async () => {
                  try {
                    await api.patch(`/leagues/${id}/fantasy/team-name`, { team_name: teamNameInput })
                    toast('Team name updated!', 'success')
                    setShowTeamNameModal(false)
                    // Refresh league data
                    window.location.reload()
                  } catch (err) {
                    toast(err.message || 'Failed to update', 'error')
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white"
              >Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Global "draft is live" banner — visible on every tab inside the league */}
      <FantasyDraftLiveBanner
        league={league}
        fantasySettings={fantasySettings}
        isOnDraftTab={tabs[activeTab] === 'Draft'}
        onGoToDraft={() => {
          const idx = tabs.indexOf('Draft')
          if (idx >= 0) setActiveTab(idx)
        }}
      />

      {/* Tabs (hidden for locked bracket leagues — rendered inside BracketView hero instead) */}
      {!(league.format === 'bracket' && isBracketLocked) && (
      <div className="relative z-10 mb-6 flex gap-2 overflow-x-auto no-scrollbar scroll-smooth -mx-4 px-4 md:mx-0 md:px-0 md:justify-center md:flex-wrap" style={{ WebkitOverflowScrolling: 'touch' }}>
        {tabs.map((tab, i) => {
          const isLiveDisabled = tab === 'Live' && (league.format === 'nba_dfs' || league.format === 'wnba_dfs') && league.starts_at &&
            new Date(league.starts_at).toISOString().split('T')[0] > new Date().toLocaleDateString('en-CA')

          return (
          <button
            key={tab}
            onClick={() => !isLiveDisabled && setActiveTab(i)}
            className={`relative shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors backdrop-blur-sm whitespace-nowrap ${
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
            {tab === 'Transactions' && isCommissioner && pendingReviewCount > 0 && activeTab !== i && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] bg-incorrect text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                {pendingReviewCount}
              </span>
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

      {tabs[activeTab] === 'Picks' && league.format === 'survivor' && (() => {
        // Once the league is active, Day 1 is live (the activation cron flips
        // status when either leagues.starts_at OR the first league_week has
        // started — the latter matters because the ET-anchor fix can pull
        // Day 1 earlier than leagues.starts_at). Suppress the "starts later"
        // banner in that case.
        const notStartedYet = league.status === 'open' && league.starts_at && new Date(league.starts_at) > new Date()
        return (
          <div className="relative z-10">
            {notStartedYet && (
              <div className="rounded-xl border border-accent/30 bg-accent/5 backdrop-blur-sm p-4 mb-4 text-center max-w-md mx-auto">
                <div className="text-sm text-text-primary font-semibold">
                  League starts {new Date(league.starts_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })}
                </div>
                <div className="text-xs text-text-muted mt-1">You can pick early — picks lock when each game starts.</div>
              </div>
            )}
            <SurvivorView league={league} />
          </div>
        )
      })()}

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

      {tabs[activeTab] === 'Mock Draft' && league.format === 'fantasy' && (
        <div className="relative z-10"><LeagueMockDraft league={league} fantasySettings={fantasySettings} /></div>
      )}

      {tabs[activeTab] === 'My Team' && league.format === 'fantasy' && (
        <div className="relative z-10"><FantasyMyTeam league={league} /></div>
      )}
      {tabs[activeTab] === 'Roster' && league.format === 'fantasy' && fantasySettings?.format === 'salary_cap' && (
        <div className="relative z-10"><NflSalaryCapView league={league} /></div>
      )}

      {tabs[activeTab] === 'Standings' && league.format === 'fantasy' && (
        <div className="relative z-10"><FantasyStandings league={league} isSalaryCap={fantasySettings?.format === 'salary_cap'} championMetric={fantasySettings?.champion_metric || 'total_points'} /></div>
      )}

      {tabs[activeTab] === 'Live' && league.format === 'fantasy' && (
        <div className="relative z-10"><FantasyLiveView league={league} fantasySettings={fantasySettings} /></div>
      )}

      {(tabs[activeTab] === 'Trades' || tabs[activeTab] === 'Transactions') && league.format === 'fantasy' && (
        <div className="relative z-10"><FantasyTrades league={league} fantasySettings={fantasySettings} /></div>
      )}

      {tabs[activeTab] === 'Matchups' && league.format === 'fantasy' && (
        <div className="relative z-10"><FantasyMatchup league={league} fantasySettings={fantasySettings} /></div>
      )}

      {(tabs[activeTab] === 'Roster' || tabs[activeTab] === 'Live' || tabs[activeTab] === 'Standings') && league.format === 'nba_dfs' && (
        <div className="relative z-10">
          <NbaDfsView league={league} tab={tabs[activeTab] === 'Standings' ? 'standings' : tabs[activeTab] === 'Live' ? 'live' : 'roster'} />
        </div>
      )}

      {(tabs[activeTab] === 'Roster' || tabs[activeTab] === 'Live' || tabs[activeTab] === 'Standings') && league.format === 'wnba_dfs' && (
        <div className="relative z-10">
          <WnbaDfsView league={league} tab={tabs[activeTab] === 'Standings' ? 'standings' : tabs[activeTab] === 'Live' ? 'live' : 'roster'} />
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

      {(tabs[activeTab] === 'Picks' || tabs[activeTab] === 'Standings') && league.format === 'strikeouts' && (
        <div className="relative z-10">
          <StrikeoutsView league={league} tab={tabs[activeTab] === 'Standings' ? 'standings' : 'picks'} />
        </div>
      )}

      {(tabs[activeTab] === 'Picks' || tabs[activeTab] === 'Standings') && league.format === 'three_point' && (
        <div className="relative z-10">
          <ThreePointView league={league} tab={tabs[activeTab] === 'Standings' ? 'standings' : 'picks'} />
        </div>
      )}

      {(tabs[activeTab] === 'Picks' || tabs[activeTab] === 'Standings') && league.format === 'wnba_three_point' && (
        <div className="relative z-10">
          <WnbaThreePointView league={league} tab={tabs[activeTab] === 'Standings' ? 'standings' : 'picks'} />
        </div>
      )}

      {(tabs[activeTab] === 'Picks' || tabs[activeTab] === 'Standings') && league.format === 'sacks' && (
        <div className="relative z-10">
          <SacksView league={league} tab={tabs[activeTab] === 'Standings' ? 'standings' : 'picks'} />
        </div>
      )}

      {(tabs[activeTab] === 'Picks' || tabs[activeTab] === 'Standings') && league.format === 'ints' && (
        <div className="relative z-10">
          <IntsView league={league} tab={tabs[activeTab] === 'Standings' ? 'standings' : 'picks'} />
        </div>
      )}

      {(tabs[activeTab] === 'Picks' || tabs[activeTab] === 'Standings') && league.format === 'tackles' && (
        <div className="relative z-10">
          <TacklesView league={league} tab={tabs[activeTab] === 'Standings' ? 'standings' : 'picks'} />
        </div>
      )}

      {(tabs[activeTab] === 'Picks' || tabs[activeTab] === 'Standings') && league.format === 'receptions' && (
        <div className="relative z-10">
          <ReceptionsView league={league} tab={tabs[activeTab] === 'Standings' ? 'standings' : 'picks'} />
        </div>
      )}

      {(tabs[activeTab] === 'Picks' || tabs[activeTab] === 'Standings') && league.format === 'td_pass' && (
        <div className="relative z-10">
          <TdPassView
            league={league}
            tab={tabs[activeTab] === 'Standings' ? 'standings' : 'picks'}
          />
        </div>
      )}

      {tabs[activeTab] === 'Report' && (
        <LeagueReport leagueId={league.id} leagueName={league.name} memberCount={league.member_count} inline />
      )}

      {tabs[activeTab] === 'Thread' && (
        <div className="relative z-10"><LeagueThread league={league} /></div>
      )}

      {/* Delete League */}
      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowSettingsModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative bg-bg-primary/80 backdrop-blur-md border border-text-primary/20 w-full max-w-lg rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-text-primary">League Settings</h2>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="w-10 h-10 -m-2 flex items-center justify-center text-text-muted hover:text-text-primary text-xl leading-none rounded-full hover:bg-bg-secondary transition-colors"
              >
                &times;
              </button>
            </div>

            {league.ends_at && !(league.format === 'fantasy' && fantasySettings?.format !== 'salary_cap') && (
              <div className="flex items-baseline justify-between mb-4 px-1">
                <span className="text-xs uppercase tracking-wider text-text-muted">Runs until</span>
                <span className="text-sm font-semibold text-text-primary">
                  {league.format === 'survivor'
                    ? 'Last one standing'
                    : formatEndDateLong(league.ends_at)}
                </span>
              </div>
            )}

            <LeagueConditions league={league} isCommissioner={isCommissioner} updateLeague={updateLeague} bracketTournament={bracketTournament} bracketEntries={bracketEntries} fantasySettings={fantasySettings} />

            {isCommissioner && league.settings_editable && (
              <div className="mt-4">
                <LeagueSettingsEditor league={league} updateLeague={updateLeague} hasLockedPicks={league.has_locked_picks} />
              </div>
            )}

            {isCommissioner && (
              <div className="mt-10 pt-4 border-t border-border text-center">
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
        </div>
      )}
    </div>
    </div>
  )
}
