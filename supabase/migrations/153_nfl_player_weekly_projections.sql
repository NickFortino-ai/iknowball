-- Weekly player projections from Sleeper — used for matchup previews.
-- Separate from nfl_players.projected_pts_* which are season-long totals.

CREATE TABLE nfl_player_projections (
  player_id TEXT NOT NULL REFERENCES nfl_players(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  pts_ppr NUMERIC,
  pts_half_ppr NUMERIC,
  pts_std NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (player_id, season, week)
);

CREATE INDEX idx_nfl_player_projections_week ON nfl_player_projections(season, week);

ALTER TABLE nfl_player_projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view projections"
  ON nfl_player_projections FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage projections"
  ON nfl_player_projections FOR ALL
  TO service_role
  USING (true);
