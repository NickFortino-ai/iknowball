-- RPC to aggregate season home runs from mlb_dfs_player_stats
CREATE OR REPLACE FUNCTION aggregate_season_hrs(p_espn_ids TEXT[], p_season INT)
RETURNS TABLE(espn_player_id TEXT, total_hrs BIGINT) AS $$
  SELECT espn_player_id, SUM(home_runs)::BIGINT AS total_hrs
  FROM mlb_dfs_player_stats
  WHERE espn_player_id = ANY(p_espn_ids)
    AND season = p_season
    AND home_runs > 0
  GROUP BY espn_player_id;
$$ LANGUAGE sql STABLE;
