// Maps Odds API market keys to display labels, grouped by sport
export const PROP_MARKETS = {
  // NBA
  player_points: { label: 'Points', sports: ['basketball_nba', 'basketball_ncaab', 'basketball_wnba'] },
  player_rebounds: { label: 'Rebounds', sports: ['basketball_nba', 'basketball_ncaab', 'basketball_wnba'] },
  player_assists: { label: 'Assists', sports: ['basketball_nba', 'basketball_ncaab', 'basketball_wnba'] },
  player_threes: { label: '3-Pointers Made', sports: ['basketball_nba', 'basketball_ncaab', 'basketball_wnba'] },
  player_blocks: { label: 'Blocks', sports: ['basketball_nba', 'basketball_ncaab', 'basketball_wnba'] },
  player_steals: { label: 'Steals', sports: ['basketball_nba', 'basketball_ncaab', 'basketball_wnba'] },
  player_points_rebounds_assists: { label: 'Pts + Reb + Ast', sports: ['basketball_nba', 'basketball_ncaab', 'basketball_wnba'] },
  player_points_rebounds: { label: 'Pts + Reb', sports: ['basketball_nba', 'basketball_ncaab', 'basketball_wnba'] },
  player_points_assists: { label: 'Pts + Ast', sports: ['basketball_nba', 'basketball_ncaab', 'basketball_wnba'] },
  player_rebounds_assists: { label: 'Reb + Ast', sports: ['basketball_nba', 'basketball_ncaab', 'basketball_wnba'] },

  // NFL
  player_pass_tds: { label: 'Pass TDs', sports: ['americanfootball_nfl', 'americanfootball_ncaaf'] },
  player_pass_yds: { label: 'Pass Yards', sports: ['americanfootball_nfl', 'americanfootball_ncaaf'] },
  player_pass_completions: { label: 'Completions', sports: ['americanfootball_nfl', 'americanfootball_ncaaf'] },
  player_pass_attempts: { label: 'Pass Attempts', sports: ['americanfootball_nfl', 'americanfootball_ncaaf'] },
  player_pass_interceptions: { label: 'Interceptions', sports: ['americanfootball_nfl', 'americanfootball_ncaaf'] },
  player_rush_yds: { label: 'Rush Yards', sports: ['americanfootball_nfl', 'americanfootball_ncaaf'] },
  player_rush_attempts: { label: 'Rush Attempts', sports: ['americanfootball_nfl', 'americanfootball_ncaaf'] },
  player_reception_yds: { label: 'Receiving Yards', sports: ['americanfootball_nfl', 'americanfootball_ncaaf'] },
  player_receptions: { label: 'Receptions', sports: ['americanfootball_nfl', 'americanfootball_ncaaf'] },
  player_anytime_td: { label: 'Anytime TD', sports: ['americanfootball_nfl', 'americanfootball_ncaaf'] },

  // MLB (Odds API uses batter_* and pitcher_* prefixes)
  pitcher_strikeouts: { label: 'Strikeouts', sports: ['baseball_mlb'] },
  batter_hits: { label: 'Hits', sports: ['baseball_mlb'] },
  batter_total_bases: { label: 'Total Bases', sports: ['baseball_mlb'] },
  batter_home_runs: { label: 'Home Runs', sports: ['baseball_mlb'] },
  batter_rbis: { label: 'RBIs', sports: ['baseball_mlb'] },
  batter_stolen_bases: { label: 'Stolen Bases', sports: ['baseball_mlb'] },
  batter_walks: { label: 'Walks', sports: ['baseball_mlb'] },
}

export function getMarketLabel(marketKey) {
  return PROP_MARKETS[marketKey]?.label || marketKey
}

export function getMarketsForSport(sportKey) {
  return Object.entries(PROP_MARKETS)
    .filter(([, config]) => config.sports.includes(sportKey))
    .map(([key, config]) => ({ key, label: config.label }))
}
