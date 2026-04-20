-- Per-week lineup storage for fantasy football
-- Allows users to pre-set lineups for future weeks
CREATE TABLE fantasy_weekly_lineups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  season INTEGER NOT NULL,
  player_id TEXT NOT NULL REFERENCES nfl_players(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id, week, player_id)
);

CREATE INDEX idx_fwl_lookup ON fantasy_weekly_lineups(league_id, user_id, week);

ALTER TABLE fantasy_weekly_lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view weekly lineups"
  ON fantasy_weekly_lineups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role manages weekly lineups"
  ON fantasy_weekly_lineups FOR ALL TO service_role USING (true);
