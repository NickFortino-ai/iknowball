// Display names for the variant keys stored on league_backdrops.formats.
//
// Unlisted keys fall back to a tidied version of the key itself, so a new
// backdrop set shows up without a code change.
//
// Lives in its own module because both the arcade room and the leaderboard
// need it, and a shared constant is cheaper than either importing a component
// for its helper or keeping two copies that drift.
const VARIANT_LABELS = {
  all: 'All Sports',
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_wnba: 'WNBA',
  americanfootball_ncaaf: 'NCAAF',
  basketball_ncaab: 'NCAAB',
  td_pass_competition: 'TD Pass Legends',
  touchdown_survivor: 'Touchdown Legends',
  receptions_contest: 'Receiving Legends',
  ints_contest: 'Interception Legends',
  sacks_contest: 'Sack Legends',
  tackles_contest: 'Tackle Legends',
  hr_derby_contest: 'Home Run Legends',
  strikeouts_contest: 'Strikeout Legends',
  three_point_contest: '3-Point Legends',
  wnba_three_point_contest: 'WNBA 3-Point Legends',
  wnba_dfs_contest: 'WNBA Legends',
}

export function labelFor(key) {
  if (!key) return ''
  return VARIANT_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
