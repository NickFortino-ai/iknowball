-- Weekly lineup snapshots for traditional fantasy football.
-- Captured at game lock time so we can later analyze start/sit decisions.
-- The report generator does NOT depend on this table yet — it's forward-looking
-- infrastructure for a future "smart start/sit" section.

CREATE TABLE fantasy_lineup_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  season INTEGER NOT NULL,
  player_id TEXT NOT NULL REFERENCES nfl_players(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(league_id, user_id, week, player_id)
);

CREATE INDEX idx_fantasy_lineup_history_league_week ON fantasy_lineup_history(league_id, week);
CREATE INDEX idx_fantasy_lineup_history_user ON fantasy_lineup_history(league_id, user_id, week);

ALTER TABLE fantasy_lineup_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their league's lineup history"
  ON fantasy_lineup_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage lineup history"
  ON fantasy_lineup_history FOR ALL
  TO service_role
  USING (true);
