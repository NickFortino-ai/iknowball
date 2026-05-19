// Pre/post league surveys. Question definitions live here so any code
// path (client modal, admin tab, CSV export) can stay in sync.

export const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_ncaab: 'NCAAB',
  basketball_wncaab: 'WNCAAB',
  americanfootball_ncaaf: 'NCAAF',
  americanfootball_ufl: 'UFL',
  basketball_wnba: 'WNBA',
  icehockey_nhl: 'NHL',
  soccer_usa_mls: 'MLS',
  all: 'All Sports',
}

export function sportLabel(sport) {
  return SPORT_LABELS[sport] || sport || 'this sport'
}

// Shared Q2 / Q3 between entry and exit so the delta is interpretable.
const Q_TEAMS = {
  id: 'teams',
  prompt: 'How many teams can you name from this sport?',
  options: [
    { value: 'all', label: 'All' },
    { value: 'some', label: 'Some' },
    { value: 'none', label: 'None' },
  ],
}

const Q_PLAYERS = {
  id: 'players',
  prompt: 'How many players can you name from this sport?',
  options: [
    { value: 'almost_all', label: 'Almost all' },
    { value: 'most', label: 'Most' },
    { value: 'some', label: 'Some' },
    { value: 'a_handful', label: 'A handful' },
    { value: 'only_superstars', label: 'Only the superstars' },
    { value: 'none', label: 'None' },
  ],
}

const Q4_SCALE = {
  type: 'scale',
  min: 1,
  max: 7,
  minLabel: 'Least',
  maxLabel: 'Most',
}

export const ENTRY_QUESTIONS = [
  {
    id: 'tracking',
    prompt: 'In the past year, how closely have you tracked this sport?',
    options: [
      { value: 'not_at_all', label: 'Not at all' },
      { value: 'a_little', label: 'A little' },
      { value: 'somewhat', label: 'Somewhat' },
      { value: 'closely', label: 'Closely' },
      { value: 'very_closely', label: 'Very closely' },
    ],
  },
  Q_TEAMS,
  Q_PLAYERS,
  {
    id: 'interest',
    prompt: 'Rate your level of interest in this sport during the past year up until this point.',
    ...Q4_SCALE,
  },
]

export const EXIT_QUESTIONS = [
  {
    id: 'tracking_change',
    prompt: 'To what degree did participating in this league increase how closely you tracked this sport?',
    options: [
      { value: 'none', label: 'None' },
      { value: 'moderately', label: 'Moderately' },
      { value: 'significantly', label: 'Significantly' },
      { value: 'maxed_out', label: 'I was already maxed out' },
    ],
  },
  Q_TEAMS,
  Q_PLAYERS,
  {
    id: 'interest',
    prompt: 'Rate your level of interest in this sport right now.',
    ...Q4_SCALE,
  },
]

export function getQuestionsFor(surveyType) {
  return surveyType === 'exit' ? EXIT_QUESTIONS : ENTRY_QUESTIONS
}

export const TOP_NOTE = 'IKB is extremely interested in the psychology of watching, tracking, and enjoying sports. If you\'re open to it, please answer a few quick questions about your experience.'
