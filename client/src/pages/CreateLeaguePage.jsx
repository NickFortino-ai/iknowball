import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateLeague, useBracketTemplatesActive, useLeagueBackdrops, useNflSeasonOpener } from '../hooks/useLeagues'
import { api } from '../lib/api'
import { getBackdropUrl } from '../lib/backdropUrl'
import { useGames } from '../hooks/useGames'
import { toast } from '../components/ui/Toast'
import ScoringRulesEditor from '../components/leagues/ScoringRulesEditor'

const FORMAT_OPTIONS = [
  {
    value: 'fantasy',
    label: 'Fantasy Football',
    description: 'Traditional draft leagues or weekly salary cap — set lineups and compete head-to-head',
    details: `Two flavors: Traditional season-long with a snake draft, head-to-head matchups, waivers, trades, and an end-of-season playoff bracket — or Weekly Salary Cap, where you build a fresh lineup every week under a budget with no draft and no roster carryover. There's also a single-week mode for one-and-done contests.

When the season ends, your final position converts to global IKB points using the position formula on top of a top-3 bonus structure.

Salary cap leagues generate a League Report at the end with most played player, pick of the year, best value plays, worst investments, and league-wide awards.

Commissioner controls: scoring format (PPR, half-PPR, standard, or fully custom per-stat), roster configuration (or salary cap amount), team count, draft date and pick timer, waiver system (priority, rolling, or FAAB with starting budget), trade review method, playoff team count, playoff start week, and championship week. Custom backdrop from a curated library or upload your own.`,
    bonusTable: {
      title: 'Traditional Fantasy Bonus Structure',
      intro: `Traditional fantasy leagues require effort and intelligence to win. We honor that with an appropriate point-bonus structure for winning leagues. Traditional fantasy football with people who pay attention, try, and have a deep understanding of the sport, is a serious competition of strategy and knowledge. Winning a league is genuinely respectable as a life achievement — I know that may sound silly... but only to people who have never won a serious league. It's a legitimate brain test, doused in dramatic unpredictability and luck of course. But to be in the mix year in and year out, and to win championships against serious fantasy football players bestows major credibility upon a person. I can only win a serious league if and only if I KNOW BALL. To honor the feat of winning a fantasy football league, we offer the following bonus structure.`,
      rows: [
        { size: '6 teams', first: '+50', second: '+20', third: '+10' },
        { size: '8 teams', first: '+75', second: '+30', third: '+15' },
        { size: '10 teams', first: '+90', second: '+36', third: '+18' },
        { size: '12 teams', first: '+120', second: '+48', third: '+24' },
        { size: '14 teams', first: '+165', second: '+66', third: '+33' },
        { size: '16 teams', first: '+195', second: '+78', third: '+39' },
        { size: '20 teams', first: '+225', second: '+90', third: '+45' },
      ],
    },
    bonusTable2: {
      title: 'Salary Cap Bonus Structure (Full Season, Week 1 Start)',
      rows: [
        { size: '6 members', first: '+35', second: '+14', third: '+7' },
        { size: '8 members', first: '+60', second: '+24', third: '+12' },
        { size: '10 members', first: '+75', second: '+30', third: '+15' },
        { size: '12 members', first: '+90', second: '+36', third: '+18' },
        { size: '14 members', first: '+105', second: '+42', third: '+21' },
        { size: '16 members', first: '+120', second: '+48', third: '+24' },
        { size: '20 members', first: '+150', second: '+60', third: '+30' },
      ],
      footnote: 'Salary cap leagues that start mid-season use the same shape but prorated by weeks played. Single-week leagues (one-and-done) use position-ranked scoring with a winner bonus — the winner takes home members × 2, the bottom half earns negative points.',
    },
  },
  {
    value: 'nba_dfs',
    label: 'NBA Daily Fantasy',
    description: 'Build a nightly NBA lineup under a salary cap and compete for the highest score',
    details: `Build a nightly 9-man NBA lineup (PG, PG, SG, SG, SF, SF, PF, PF, C) under a salary cap. Players are priced using a weighted algorithm that factors in recent performance and opponent defensive strength — so salaries shift nightly based on matchups and form. Scoring follows DraftKings-style NBA rules. Your league tracks wins across every night of the duration.

When the league ends, your final position converts to global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner earns a bonus on top of their position-based points that scales with league size: 5 or fewer members +10, 6–10 members +20, 11–15 members +30, 16–30 members +50, 31–40 members +75, 41+ members +100. The winner's bonus is prorated by how long the league actually ran — a full NBA regular season is ~180 game nights, so a league that runs 90 nights earns 50% of the bonus, a league that runs 18 nights earns 10%, and a full-season league earns 100%. For example, if you win a 20-member full-season league, you'd earn 19 position points + 20 bonus = 39 total points added to your global IKB score.

At the end of the season, the league generates a League Report — a full breakdown of every member's season including most played player, pick of the year, best value plays, worst investments, and league-wide awards for top scorer, most rostered player, and the most contrarian hit of the season.

Commissioner controls: salary cap, team count, league duration, and lineup lock time. Custom backdrop from a curated library or upload your own.`,
  },
  {
    value: 'mlb_dfs',
    label: 'MLB Daily Fantasy',
    description: 'Build a daily MLB lineup under a salary cap — scored on hits, HRs, RBIs, runs, and more',
    details: `Build a daily 10-man MLB lineup (SP, C, 1B, 2B, SS, 3B, OF, OF, OF, UTIL) under a salary cap. Scored on hits, home runs, RBIs, runs, stolen bases, and walks. Player pricing uses recent game logs and opponent pitching and defensive strength. Compete each night with your league across the full slate.

When the league ends, your final position converts to global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner earns a bonus on top of their position-based points that scales with league size: 5 or fewer members +10, 6–10 members +20, 11–15 members +30, 16–30 members +50, 31–40 members +75, 41+ members +100. For example, if you win a 10-member league, you'd earn 9 position points + 20 bonus = 29 total points added to your global IKB score.

At the end of the season, the league generates a League Report — a full breakdown of every member's season including most played player, pick of the year, best value plays, worst investments, and league-wide awards for top scorer, most rostered player, and the most contrarian hit of the season.

Commissioner controls: salary cap, team count, league duration, lineup lock time. Custom backdrop from a curated library or upload your own.`,
  },
  {
    value: 'hr_derby',
    label: 'Home Run Derby',
    description: 'Pick 3 hitters per day — score points for every HR they hit, with distance as tiebreaker',
    details: `Pick up to 3 hitters per day who you think will go yard. Each player can only be used once per week. Total home runs determine standings — HR distance is the tiebreaker. No salaries, no lineups, no optimization required. Just: will this guy hit one tonight?

When the league ends, your final position converts to global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner earns a bonus on top of their position-based points that scales with league size: 5 or fewer members +10, 6–10 members +20, 11–15 members +30, 16–30 members +50, 31–40 members +75, 41+ members +100. For example, if you win a 15-member league, you'd earn 14 position points + 30 bonus = 44 total points added to your global IKB score.

Commissioner controls: league length, team count. Custom backdrop from a curated library or upload your own.`,
  },
  {
    value: 'td_pass',
    label: 'TD Pass Competition',
    description: 'Pick one QB per week — never repeat a QB. Most passing TDs across the season wins',
    details: `Season-long NFL league where you pick one quarterback per week — and you can never pick the same QB twice all season. Standings rank by total passing touchdowns accumulated across all your picks. Most TDs by season's end wins. Rushing TDs don't count. Ties split the bonus.

When the season ends, your final position converts to global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner earns a bonus on top of their position-based points that scales with league size: 5 or fewer members +10, 6–10 members +20, 11–15 members +30, 16–30 members +50, 31–40 members +75, 41+ members +100. For example, if you win a 30-member league, you'd earn 29 position points + 50 bonus = 79 total points added to your global IKB score.

Commissioner controls: league length (defaults to full NFL season), team count. Custom backdrop from a curated library or upload your own.`,
  },
  {
    value: 'pickem',
    label: "Pick'em",
    description: 'Pick game winners with odds-based scoring — your points reflect the real odds',
    details: `A picks league where everyone chooses winners from the same slate of games. The twist: IKB scores on odds, not just right or wrong. A chalk pick on the favorite pays less; nailing an underdog pays big. That means one gutsy upset call can leapfrog you over someone who played it safe all week. League picks live on their own leaderboard throughout the duration.

When the league ends, all the pick points you earned during play transfer to your global IKB score. On top of that, the winner gets a bonus equal to the number of members in the league. For example, in a 25-member Pick'em league, the winner would receive all their accumulated pick points plus a 25-point bonus added to their global IKB score.

Commissioner controls: sport (single or all), duration (this week, custom range, or full season), pick frequency (daily or weekly), games per period, lock time (game start or submission), and open vs invite-only. Custom backdrop from a curated library or upload your own.`,
  },
  {
    value: 'survivor',
    label: 'Survivor',
    description: 'Pick one team per period. If they win, you survive. Last one standing wins. TD Survivor also available',
    details: `Pick one team to win each period. Win and you survive. Lose and you burn a life. The catch: you can never pick the same team twice. Use all your lives and you're out. Last one standing wins.

When the league ends, only survivors earn global IKB points — scaled by league size from 10 points for small leagues up to 100 for 41+ members. If multiple players survive to the end of the season, the bonus points are split evenly.

NFL leagues can also be set up as a Touchdown Survivor Pool — instead of picking a team, pick one player you think will score a non-passing TD (rush, reception, return, or fumble recovery). Same survivor engine, same global scoring. Comes with the TD Legends backdrop set (Jerry, Emmitt, LaDainian).

Commissioner controls: sport, period frequency (daily or weekly), lives per player, what happens if everyone gets eliminated in the same period (all-survive or reset), and league length. Custom backdrop from a curated library or upload your own.`,
  },
  {
    value: 'bracket',
    label: 'Bracket',
    description: 'Fill out a tournament bracket with escalating points per round',
    details: `Tournament-style competition. The commissioner selects a template — NCAA Tournament, NBA Playoffs, NHL Playoffs, NFL Playoffs, and more — members fill out their bracket before the lock, and points scale dramatically by round. A correct championship pick is worth multiples of a first-round call. NBA and NHL playoff brackets include a series length prediction for each matchup — nail the exact number of games for bonus points.

When the bracket completes, your finishing position determines your global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner earns a bonus on top of their position-based points that scales with league size: 5 or fewer members +10, 6–10 members +20, 11–15 members +30, 16–30 members +50, 31–40 members +75, 41+ members +100. For example, if you win a 50-member bracket league, you'd earn 49 position points + 100 bonus = 149 total points added to your global IKB score. Ties split the bonus.

Commissioner controls: bracket template, lock time, and visibility. Custom backdrop or upload your own, plus a centerpiece image behind the bracket.`,
  },
  {
    value: 'squares',
    label: 'Squares',
    description: '10x10 grid tied to a single game with quarter-by-quarter scoring',
    details: `The classic 10×10 grid game tied to a real game. Claim your squares, numbers get randomly assigned to the axes, and every quarter the owner of the square matching the last digit of each team's score wins points. Squares transforms any watch party into a shared experience — suddenly everyone in the room has a stake in every score, every quarter, every last-second field goal. No sports knowledge required.

Squares is pure side action — it does not affect your global IKB score. What happens in the grid stays in the grid.

Commissioner controls: which game, max squares per user, points per quarter, and whether numbers are auto-assigned when the board fills or commissioner-triggered. Custom backdrop from a curated library or upload your own.`,
  },
]

const SPORT_OPTIONS = [
  { value: 'americanfootball_nfl', label: 'NFL' },
  { value: 'basketball_nba', label: 'NBA' },
  { value: 'baseball_mlb', label: 'MLB' },
  { value: 'basketball_ncaab', label: 'NCAAB' },
  { value: 'basketball_wncaab', label: 'WNCAAB' },
  { value: 'americanfootball_ufl', label: 'UFL' },
  { value: 'americanfootball_ncaaf', label: 'NCAAF' },
  { value: 'basketball_wnba', label: 'WNBA' },
  { value: 'icehockey_nhl', label: 'NHL' },
  { value: 'all', label: 'All Sports' },
]

// Sports where daily picks make sense (games happen most days during season)
const DAILY_ELIGIBLE_SPORTS = new Set(['basketball_nba', 'basketball_ncaab', 'basketball_wncaab', 'basketball_wnba', 'baseball_mlb', 'icehockey_nhl', 'all'])
// Sports where weekly picks make sense (NFL is the obvious one — games only on weekends)
const WEEKLY_ELIGIBLE_SPORTS = new Set(['americanfootball_nfl', 'americanfootball_ncaaf', 'americanfootball_ufl', 'all'])

function allowedFrequencies(sport) {
  const allowed = []
  if (WEEKLY_ELIGIBLE_SPORTS.has(sport)) allowed.push('weekly')
  if (DAILY_ELIGIBLE_SPORTS.has(sport)) allowed.push('daily')
  return allowed
}

const DURATION_OPTIONS = [
  { value: 'this_week', label: 'This Week Only' },
  { value: 'custom_range', label: 'Custom Date Range' },
  { value: 'full_season', label: 'Full Season' },
  { value: 'playoffs_only', label: 'Playoffs Only' },
]

// Sport-specific season end dates (approximate, updated yearly)
// REGULAR-season end dates (NOT playoff finales). Full-season leagues
// run through the regular season only. Playoff games don't count toward
// these leagues — they end naturally on the last day of the regular season.
function getSeasonEndDate(sportKey) {
  const year = new Date().getFullYear()
  const dates = {
    basketball_nba: `${year}-04-12`,        // NBA reg season ends ~April 12 (before play-in)
    americanfootball_nfl: `${year + 1}-01-05`, // NFL Week 18 ends ~Jan 5
    baseball_mlb: `${year}-09-29`,          // MLB reg season ends ~Sept 29
    basketball_ncaab: `${year}-03-08`,      // NCAAB reg season ends ~early March (before conf tourneys)
    basketball_wncaab: `${year}-03-08`,
    americanfootball_ufl: `${year}-06-15`,   // UFL reg season ends ~mid June
    americanfootball_ncaaf: `${year}-12-07`, // NCAAF reg season ends ~Dec 7
    basketball_wnba: `${year}-09-14`,       // WNBA reg season ends ~mid Sept
    icehockey_nhl: `${year}-04-18`,         // NHL reg season ends ~April 18
    soccer_usa_mls: `${year}-10-18`,        // MLS reg season ends ~mid October
  }
  // If we're past the end date for this sport, push to next year
  const endDate = dates[sportKey] || `${year}-12-31`
  if (new Date(endDate) < new Date()) {
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
  const [expandedFormat, setExpandedFormat] = useState(null)
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
  const [survivorMode, setSurvivorMode] = useState('standard')
  const [assignmentMethod, setAssignmentMethod] = useState('self_select')
  const [pointsPerQuarter, setPointsPerQuarter] = useState([25, 25, 25, 50])
  const [maxSquaresPerUser, setMaxSquaresPerUser] = useState('')
  const [rowTeamName, setRowTeamName] = useState('')
  const [colTeamName, setColTeamName] = useState('')

  // Fantasy settings
  const [fantasyFormat, setFantasyFormat] = useState('traditional')
  // Traditional fantasy can only be created BEFORE the NFL season opener
  // kicks off. Once the first Week 1 game starts, only Salary Cap is
  // available.
  const { data: openerData } = useNflSeasonOpener()
  const traditionalLocked = !!(
    openerData?.opener && new Date(openerData.opener).getTime() <= Date.now()
  )
  // Auto-flip the toggle to salary cap once we know the season has started
  useEffect(() => {
    if (traditionalLocked && fantasyFormat === 'traditional') {
      setFantasyFormat('salary_cap')
    }
  }, [traditionalLocked, fantasyFormat])

  // Auto-select sport for specific formats
  useEffect(() => {
    if (format === 'fantasy' && fantasyFormat === 'traditional') setSport('americanfootball_nfl')
    if (format === 'mlb_dfs' || format === 'hr_derby') setSport('baseball_mlb')
    if (format === 'td_pass') setSport('americanfootball_nfl')
  }, [format, fantasyFormat])
  const [scoringFormat, setScoringFormat] = useState('ppr')
  const [scoringRules, setScoringRules] = useState(null) // null = use preset
  const [numTeams, setNumTeams] = useState(10)
  const [draftMode, setDraftMode] = useState('live') // 'live' or 'offline'
  const [draftPickTimer, setDraftPickTimer] = useState(90)
  const [draftDate, setDraftDate] = useState('') // datetime-local string in user's local TZ
  const [draftLocation, setDraftLocation] = useState('')
  const [irSpots, setIrSpots] = useState(1)
  const [waiverType, setWaiverType] = useState('priority')
  const [faabStartingBudget, setFaabStartingBudget] = useState(100)
  const [tradeReview, setTradeReview] = useState('commissioner')
  const [playoffTeams, setPlayoffTeams] = useState(4)
  const [playoffStartWeek, setPlayoffStartWeek] = useState(16)
  const [championshipWeek, setChampionshipWeek] = useState(17)
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
  const backdropSport = format === 'nba_dfs' ? 'basketball_nba' : (format === 'mlb_dfs' || format === 'hr_derby') ? 'baseball_mlb' : (format === 'survivor' && survivorMode === 'touchdown') ? 'touchdown_survivor' : format === 'td_pass' ? 'td_pass_competition' : sport || undefined
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
      settings.survivor_mode = survivorMode // 'standard' or 'touchdown'
    }
    if (format === 'squares') {
      settings.game_id = gameId
      settings.assignment_method = assignmentMethod
      settings.points_per_quarter = pointsPerQuarter
      if (maxSquaresPerUser) settings.max_squares_per_user = parseInt(maxSquaresPerUser, 10)
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
      // NFL salary cap (DFS) leagues use half-PPR — that's what FanDuel
      // uses and what the salary algorithm is calibrated against. Keeping
      // them on full PPR while salaries assume half-PPR systematically
      // underprices high-target pass-catchers (they get 50% more receiving
      // credit at scoring time than their salary anticipates).
      // NBA/MLB DFS use 'ppr' as a placeholder — their scoring is computed
      // in their own services (nbaDfsService / mlbDfsService) and ignores
      // this column.
      scoring_format: fantasyFormat === 'salary_cap'
        ? 'half_ppr'
        : (format === 'nba_dfs' || format === 'mlb_dfs')
          ? 'ppr'
          : scoringFormat,
      num_teams: numTeams,
      draft_mode: format === 'fantasy' && fantasyFormat === 'traditional' ? draftMode : undefined,
      draft_pick_timer: format === 'fantasy' && fantasyFormat === 'traditional' && draftMode === 'live' ? draftPickTimer : undefined,
      draft_location: format === 'fantasy' && fantasyFormat === 'traditional' && draftLocation ? draftLocation : undefined,
      // datetime-local returns a naive string in the user's local timezone.
      // new Date() interprets it as local time and .toISOString() converts to
      // UTC for storage. Every other member's browser converts it back to
      // their own local timezone on display.
      draft_date: format === 'fantasy' && fantasyFormat === 'traditional' && draftDate
        ? new Date(draftDate).toISOString()
        : undefined,
      roster_slots: format === 'fantasy' && fantasyFormat === 'traditional'
        ? { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, k: 1, def: 1, bench: 6, ir: irSpots }
        : undefined,
      waiver_type: format === 'fantasy' && fantasyFormat === 'traditional' ? waiverType : undefined,
      faab_starting_budget: format === 'fantasy' && fantasyFormat === 'traditional' && waiverType === 'faab' ? faabStartingBudget : undefined,
      trade_review: format === 'fantasy' && fantasyFormat === 'traditional' ? tradeReview : undefined,
      playoff_teams: format === 'fantasy' && fantasyFormat === 'traditional' ? playoffTeams : undefined,
      playoff_start_week: format === 'fantasy' && fantasyFormat === 'traditional' ? playoffStartWeek : undefined,
      championship_week: format === 'fantasy' && fantasyFormat === 'traditional' ? championshipWeek : undefined,
      scoring_rules: format === 'fantasy' && fantasyFormat === 'traditional' && scoringRules ? scoringRules : undefined,
      salary_cap: (format === 'nba_dfs' || format === 'mlb_dfs' || fantasyFormat === 'salary_cap') ? salaryCap : undefined,
      season_type: (format === 'nba_dfs' || fantasyFormat === 'salary_cap') ? seasonType : undefined,
      champion_metric: (format === 'nba_dfs' || fantasyFormat === 'salary_cap') && seasonType === 'full_season' ? championMetric : undefined,
      single_week: (format === 'nba_dfs' || fantasyFormat === 'salary_cap') && seasonType === 'single_week' ? singleWeek : undefined,
    } : undefined

    try {
      const league = await createLeague.mutateAsync({
        name,
        format,
        sport: format === 'nba_dfs' ? 'basketball_nba' : (format === 'mlb_dfs' || format === 'hr_derby') ? 'baseball_mlb' : (format === 'fantasy' || format === 'td_pass') ? 'americanfootball_nfl' : sport,
        duration: isFantasyFormat ? 'full_season' : format === 'td_pass' ? 'full_season' : format === 'survivor' ? 'full_season' : format === 'squares' ? 'custom_range' : format === 'bracket' ? 'custom_range' : (endsAt === 'end_of_season' ? 'custom_range' : duration),
        max_members: format === 'nba_dfs'
          ? (maxMembers ? parseInt(maxMembers, 10) : undefined)
          : format === 'fantasy' ? numTeams : maxMembers ? parseInt(maxMembers, 10) : undefined,
        starts_at: ['nba_dfs', 'mlb_dfs', 'hr_derby'].includes(format) ? getDfsStartDate()
          : format === 'td_pass' ? new Date().toISOString()
          : format === 'squares' && gameId ? squaresGames?.find((g) => g.id === gameId)?.starts_at || undefined
          : format === 'bracket' ? (locksAt ? new Date(locksAt).toISOString() : undefined)
          : startsAt || undefined,
        ends_at: format === 'td_pass' ? getSeasonEndDate('americanfootball_nfl')
          : format === 'survivor' ? getSeasonEndDate(sport)
          : format === 'squares' && gameId ? squaresGames?.find((g) => g.id === gameId)?.starts_at || undefined
          : endsAt === 'end_of_season' ? getSeasonEndDate(format === 'nba_dfs' ? 'basketball_nba' : (format === 'mlb_dfs' || format === 'hr_derby') ? 'baseball_mlb' : sport)
          // DFS and fantasy salary-cap leagues with full_season run through
          // the regular season only — auto-set ends_at to the regular-season end
          : (isFantasyFormat && seasonType === 'full_season')
            ? getSeasonEndDate(
                format === 'nba_dfs' ? 'basketball_nba'
                : (format === 'mlb_dfs' || format === 'hr_derby') ? 'baseball_mlb'
                : 'americanfootball_nfl'
              )
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

  const autoSportFormats = ['nba_dfs', 'mlb_dfs', 'hr_derby', 'td_pass']
  const noDurationFormats = ['fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby', 'squares', 'bracket', 'td_pass', 'survivor']
  const canSubmit = name && format && (sport || autoSportFormats.includes(format)) && (noDurationFormats.includes(format) || duration)
    && (format !== 'bracket' || (templateId && locksAt))
    && (format !== 'squares' || gameId)

  return (
    <div className="max-w-2xl md:max-w-3xl mx-auto px-4 py-6">
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
            {FORMAT_OPTIONS.map((opt) => {
              const isExpanded = expandedFormat === opt.value
              const isSelected = format === opt.value
              return (
                <div
                  key={opt.value}
                  className={`rounded-xl border transition-colors ${
                    isSelected
                      ? 'border-accent bg-accent/10'
                      : 'border-text-primary/20 hover:border-text-primary/40'
                  }`}
                >
                  <div className="flex items-stretch">
                    {/* Left side: tap to select */}
                    <button
                      type="button"
                      onClick={() => setFormat(opt.value)}
                      className="flex-1 text-left p-4 md:p-5 min-w-0"
                    >
                      <div className="font-semibold text-base md:text-lg text-text-primary">{opt.label}</div>
                      <div className="text-sm md:text-base text-text-primary mt-1">{opt.description}</div>
                    </button>
                    {/* Right side: tap to toggle the description dropdown */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedFormat(isExpanded ? null : opt.value)
                      }}
                      className="px-4 flex items-center text-text-muted hover:text-text-primary border-l border-text-primary/10 transition-colors"
                      aria-label={isExpanded ? 'Hide details' : 'Show details'}
                      aria-expanded={isExpanded}
                    >
                      <svg
                        className={`w-6 h-6 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="px-4 md:px-5 pb-4 md:pb-5 pt-3 text-sm md:text-base leading-relaxed text-text-primary border-t border-text-primary/10">
                      <div className="whitespace-pre-line">{opt.details}</div>
                      {[opt.bonusTable, opt.bonusTable2].filter(Boolean).map((tbl) => (
                        <div key={tbl.title} className="mt-4 rounded-xl bg-bg-primary border border-text-primary/20 overflow-hidden">
                          <div className="px-4 py-3 border-b border-text-primary/20 text-sm md:text-base font-display text-text-primary">
                            {tbl.title}
                          </div>
                          {tbl.intro && (
                            <div className="px-4 py-3 text-sm md:text-base leading-7 text-text-primary border-b border-text-primary/20">
                              {tbl.intro}
                            </div>
                          )}
                          <div className="grid grid-cols-4 text-sm md:text-base">
                            <div className="px-4 py-2 font-semibold text-text-primary">League Size</div>
                            <div className="px-2 py-2 font-semibold text-text-primary text-center">1st</div>
                            <div className="px-2 py-2 font-semibold text-text-primary text-center">2nd</div>
                            <div className="px-2 py-2 font-semibold text-text-primary text-center">3rd</div>
                            {tbl.rows.map((r) => (
                              <div key={r.size} className="contents">
                                <div className="px-4 py-2 border-t border-text-primary/10 text-text-primary">{r.size}</div>
                                <div className="px-2 py-2 border-t border-text-primary/10 text-center text-correct font-semibold tabular-nums">{r.first}</div>
                                <div className="px-2 py-2 border-t border-text-primary/10 text-center text-text-primary font-semibold tabular-nums">{r.second}</div>
                                <div className="px-2 py-2 border-t border-text-primary/10 text-center text-text-primary font-semibold tabular-nums">{r.third}</div>
                              </div>
                            ))}
                          </div>
                          <div className="px-4 py-2 text-xs md:text-sm text-text-primary/70 border-t border-text-primary/10">
                            {tbl.footnote || 'Position points (n+1−2×rank) are still applied on top of these bonuses. Non-standard team counts use the closest configured size.'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Sport (hidden for format-locked sports) */}
        {!['nba_dfs', 'mlb_dfs', 'hr_derby', 'td_pass'].includes(format) && <div>
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
                  // Snap pick_frequency to whatever this sport actually allows
                  const allowed = allowedFrequencies(opt.value)
                  if (allowed.length === 1) {
                    setPickFrequency(allowed[0])
                  } else if (allowed.length === 0) {
                    setPickFrequency('weekly')
                  } else if (!allowed.includes(pickFrequency)) {
                    setPickFrequency(allowed[0])
                  }
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

        {/* Duration (not for fantasy/DFS/squares/bracket — bracket runs from picks lock to championship game) */}
        {!['fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby', 'squares', 'bracket', 'td_pass', 'survivor'].includes(format) && <>
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

        {/* Start date for non-custom durations (this_week, full_season, playoffs_only) */}
        {duration && duration !== 'custom_range' && (
          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">Start Date</label>
            <input
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
            />
            <p className="text-xs text-text-muted mt-1">When members can start making picks. Leave blank to start today.</p>
          </div>
        )}
        </>}

        {/* Max Members — only standalone for formats without their own settings section */}
        {!['fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby', 'pickem', 'survivor', 'squares', 'td_pass'].includes(format) && <div>
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
            {allowedFrequencies(sport).length > 1 && (
              <div>
                <label className="block text-xs text-text-muted mb-2">Pick Frequency</label>
                <div className="flex gap-2">
                  {allowedFrequencies(sport).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPickFrequency(value)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        pickFrequency === value ? 'bg-accent text-white' : 'bg-bg-input text-text-secondary'
                      }`}
                    >
                      {value === 'weekly' ? 'Weekly' : 'Daily'}
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
                ].map((opt) => {
                  const isDisabled = opt.value === 'traditional' && traditionalLocked
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => !isDisabled && setFantasyFormat(opt.value)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        fantasyFormat === opt.value ? 'border-accent bg-accent/10' : 'border-text-primary/20 hover:border-text-primary/40'
                      } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-sm text-text-primary">{opt.label}</div>
                        {isDisabled && (
                          <span className="text-[10px] font-semibold text-yellow-500 bg-yellow-500/10 border border-yellow-500/30 rounded px-1.5 py-0.5">UNAVAILABLE</span>
                        )}
                      </div>
                      <div className="text-xs text-text-secondary mt-0.5">{opt.desc}</div>
                    </button>
                  )
                })}
              </div>
              {traditionalLocked && (
                <p className="text-[11px] text-text-muted mt-2 leading-relaxed">
                  Traditional fantasy can only be created before the NFL season opens. The season is already underway — for a fresh league this late, use Salary Cap.
                </p>
              )}
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
                    onClick={() => { setScoringFormat(opt.value); setScoringRules(null) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      scoringFormat === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {format === 'fantasy' && fantasyFormat === 'traditional' && (
                <div className="mt-3">
                  <ScoringRulesEditor value={scoringRules} onChange={setScoringRules} />
                </div>
              )}
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
              <label className="text-xs text-text-muted block mb-1">Draft Type</label>
              <div className="flex gap-2">
                {[
                  { value: 'live', label: 'Online Draft' },
                  { value: 'offline', label: 'Offline Draft' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDraftMode(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      draftMode === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-text-muted mt-1">
                {draftMode === 'live'
                  ? 'Everyone drafts in real time with a pick timer. Auto-pick fills in if the clock runs out.'
                  : 'Draft in person, then the commissioner enters the results. No timers or auto-pick.'}
              </p>
            </div>
            {draftMode === 'live' && (
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
            )}
            <div>
              <label className="text-xs text-text-muted block mb-1">Draft Date & Time</label>
              <input
                type="datetime-local"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                className="w-full bg-bg-secondary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="text-[10px] text-text-muted mt-1">
                {draftMode === 'live'
                  ? 'Pick the moment you want the draft to start. Every member sees this in their own local timezone. Leave blank to start the draft manually.'
                  : 'When is the in-person draft? This is displayed to your league members.'}
              </p>
            </div>
            {draftMode === 'offline' && (
            <div>
              <label className="text-xs text-text-muted block mb-1">Draft Location (optional)</label>
              <input
                type="text"
                placeholder="e.g. Mike's house, Buffalo Wild Wings"
                value={draftLocation}
                onChange={(e) => setDraftLocation(e.target.value)}
                className="w-full bg-bg-secondary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            )}
            <div>
              <label className="text-xs text-text-muted block mb-1">IR Spots</label>
              <div className="flex gap-2">
                {[0, 1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setIrSpots(n)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      irSpots === n ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-text-muted mt-1">Injured-reserve spots per team. Players parked here don't count toward your bench.</p>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Waiver System</label>
              <div className="flex gap-2">
                {[
                  { value: 'priority', label: 'Priority' },
                  { value: 'rolling', label: 'Rolling' },
                  { value: 'faab', label: 'FAAB' },
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
              {waiverType === 'faab' && (
                <div className="mt-2">
                  <label className="text-[10px] text-text-muted block mb-1">Starting FAAB Budget</label>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={faabStartingBudget}
                    onChange={(e) => setFaabStartingBudget(parseInt(e.target.value, 10) || 100)}
                    className="w-32 bg-bg-secondary border border-text-primary/20 rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              )}
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
                    onClick={() => {
                      setPlayoffTeams(n)
                      // Smart default: 4 teams → start week 16 (3 rounds incl. champ)
                      // 6 teams → start week 15 (top 2 byes, then QF/SF/Champ over 3 weeks)
                      // 8 teams → start week 15 (3 rounds: QF/SF/Champ)
                      setPlayoffStartWeek(n === 4 ? 16 : 15)
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      playoffTeams === n ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    Top {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Playoffs Start Week</label>
              <div className="flex gap-2">
                {[14, 15, 16, 17].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setPlayoffStartWeek(w)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      playoffStartWeek === w ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    Wk {w}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Championship Week</label>
              <div className="flex gap-2">
                {[17, 18].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setChampionshipWeek(w)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      championshipWeek === w ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    Wk {w}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-text-muted mt-1">NFL season is 18 weeks. Most leagues use Week 17 to avoid playoff resters in Week 18.</p>
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
              <label className="block text-xs text-text-muted mb-2">Mode</label>
              <div className="flex gap-2">
                {[
                  { value: 'standard', label: 'Standard', desc: 'Pick a team to win' },
                  { value: 'touchdown', label: 'Touchdown (NFL)', desc: 'Pick a player to score a TD' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setSurvivorMode(opt.value)
                      if (opt.value === 'touchdown') setSport('americanfootball_nfl')
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      survivorMode === opt.value ? 'bg-accent text-white' : 'bg-bg-input text-text-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-text-muted mt-1">
                {survivorMode === 'touchdown'
                  ? 'Pick one NFL player per week to score a rushing, receiving, or return TD. Can\'t reuse players.'
                  : 'Pick one team per week to win. If they lose, you lose a life.'}
              </p>
            </div>
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
            {allowedFrequencies(sport).length > 1 && (
              <div>
                <label className="block text-xs text-text-muted mb-2">Pick Frequency</label>
                <div className="flex gap-2">
                  {allowedFrequencies(sport).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPickFrequency(value)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        pickFrequency === value ? 'bg-accent text-white' : 'bg-bg-input text-text-secondary'
                      }`}
                    >
                      {value === 'weekly' ? 'Weekly' : 'Daily'}
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
            {survivorMode !== 'touchdown' && (
              <div>
                <label className="text-xs text-text-muted block mb-1">Start Date</label>
                <input
                  type="date"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
                />
                <p className="text-[10px] text-text-muted mt-1">Defaults to today if left blank. League runs until there's one survivor left or the end of the season.</p>
              </div>
            )}
            {survivorMode === 'touchdown' && (
              <p className="text-[10px] text-text-muted">League starts at the next NFL kickoff and runs until there's one survivor left or the end of the season.</p>
            )}
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
            <div>
              <label className="block text-xs text-text-muted mb-1">Max Squares per User</label>
              <input
                type="number"
                value={maxSquaresPerUser}
                onChange={(e) => setMaxSquaresPerUser(e.target.value)}
                min={1}
                max={100}
                placeholder="No limit"
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
              <p className="text-[10px] text-text-muted mt-1">Leave blank for unlimited</p>
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

        {/* Backdrop picker — after all settings so format/mode influence available options */}
        {format && (
          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">League Backdrop <span className="font-normal text-text-muted">(changeable at any time)</span></label>
            <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto scrollbar-hide rounded-lg">
              {/* Submit your own */}
              <div className="relative" style={{ paddingBottom: '56.25%' }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
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
                <div key={b.filename} className="relative" style={{ paddingBottom: '56.25%' }}>
                  <button
                    type="button"
                    onClick={() => { setBackdropImage(backdropImage === b.filename ? '' : b.filename); setCustomBackdropFile(null); setCustomBackdropPreview(null) }}
                    className={`absolute inset-0 rounded-lg overflow-hidden border-2 transition-all ${
                      backdropImage === b.filename ? 'border-accent ring-1 ring-accent' : 'border-text-primary/20 hover:border-text-primary/40'
                    }`}
                  >
                    <img
                      src={getBackdropUrl(b.filename)}
                      alt={b.label}
                      className="absolute inset-0 w-full h-full object-cover"
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
                </div>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-1.5">Optional. Custom images are submitted for admin review.</p>
          </div>
        )}

        {/* Submit */}
        {!canSubmit && !createLeague.isPending && (
          <p className="text-xs text-text-muted text-center mb-2">Fill out all required fields above to create your league</p>
        )}
        <button
          type="submit"
          disabled={!canSubmit || createLeague.isPending}
          className={`w-full py-3 rounded-xl font-display text-lg transition-colors ${
            canSubmit && !createLeague.isPending
              ? 'bg-accent text-white hover:bg-accent-hover'
              : 'bg-text-muted/30 text-text-muted cursor-not-allowed'
          }`}
        >
          {createLeague.isPending ? 'Creating...' : 'Create League'}
        </button>
      </form>
    </div>
  )
}
