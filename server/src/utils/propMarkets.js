// Maps Odds API market keys to display labels, grouped by sport
export const PROP_MARKETS = {
  // NBA
  player_points: { label: 'Points', sports: ['basketball_nba'] },
  player_rebounds: { label: 'Rebounds', sports: ['basketball_nba'] },
  player_assists: { label: 'Assists', sports: ['basketball_nba'] },
  player_threes: { label: '3-Pointers Made', sports: ['basketball_nba'] },
  player_blocks: { label: 'Blocks', sports: ['basketball_nba'] },
  player_steals: { label: 'Steals', sports: ['basketball_nba'] },
  player_points_rebounds_assists: { label: 'Pts + Reb + Ast', sports: ['basketball_nba'] },
  player_points_rebounds: { label: 'Pts + Reb', sports: ['basketball_nba'] },
  player_points_assists: { label: 'Pts + Ast', sports: ['basketball_nba'] },
  player_rebounds_assists: { label: 'Reb + Ast', sports: ['basketball_nba'] },

  // NFL
  player_pass_tds: { label: 'Pass TDs', sports: ['americanfootball_nfl'] },
  player_pass_yds: { label: 'Pass Yards', sports: ['americanfootball_nfl'] },
  player_pass_completions: { label: 'Completions', sports: ['americanfootball_nfl'] },
  player_pass_attempts: { label: 'Pass Attempts', sports: ['americanfootball_nfl'] },
  player_pass_interceptions: { label: 'Interceptions', sports: ['americanfootball_nfl'] },
  player_rush_yds: { label: 'Rush Yards', sports: ['americanfootball_nfl'] },
  player_rush_attempts: { label: 'Rush Attempts', sports: ['americanfootball_nfl'] },
  player_reception_yds: { label: 'Receiving Yards', sports: ['americanfootball_nfl'] },
  player_receptions: { label: 'Receptions', sports: ['americanfootball_nfl'] },
  player_anytime_td: { label: 'Anytime TD', sports: ['americanfootball_nfl'] },

  // MLB
  player_strikeouts: { label: 'Strikeouts', sports: ['baseball_mlb'] },
  player_hits: { label: 'Hits', sports: ['baseball_mlb'] },
  player_total_bases: { label: 'Total Bases', sports: ['baseball_mlb'] },
  player_home_runs: { label: 'Home Runs', sports: ['baseball_mlb'] },
  player_rbis: { label: 'RBIs', sports: ['baseball_mlb'] },
  player_runs: { label: 'Runs', sports: ['baseball_mlb'] },
  player_stolen_bases: { label: 'Stolen Bases', sports: ['baseball_mlb'] },
  player_walks: { label: 'Walks', sports: ['baseball_mlb'] },
  player_hits_runs_rbis: { label: 'Hits + Runs + RBIs', sports: ['baseball_mlb'] },
  pitcher_outs: { label: 'Pitcher Outs', sports: ['baseball_mlb'] },
}

export function getMarketLabel(marketKey) {
  return PROP_MARKETS[marketKey]?.label || marketKey
}

export function getMarketsForSport(sportKey) {
  return Object.entries(PROP_MARKETS)
    .filter(([, config]) => config.sports.includes(sportKey))
    .map(([key, config]) => ({ key, label: config.label }))
}
