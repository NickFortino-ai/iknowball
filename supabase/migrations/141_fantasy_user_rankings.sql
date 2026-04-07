-- Per-user, per-league custom rankings. Seeded from ADP on first open,
-- then edited freely by the user before the draft.
CREATE TABLE IF NOT EXISTS fantasy_user_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES nfl_players(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (league_id, user_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_fantasy_user_rankings_user
  ON fantasy_user_rankings (league_id, user_id, rank);

ALTER TABLE fantasy_user_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY fantasy_user_rankings_select ON fantasy_user_rankings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY fantasy_user_rankings_insert ON fantasy_user_rankings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY fantasy_user_rankings_update ON fantasy_user_rankings
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY fantasy_user_rankings_delete ON fantasy_user_rankings
  FOR DELETE USING (auth.uid() = user_id);
