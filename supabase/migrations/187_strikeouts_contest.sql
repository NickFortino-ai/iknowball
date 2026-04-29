-- Strikeouts Contest league format
-- Each MLB game day, pick up to 3 pitchers. Each pick scores strikeouts
-- thrown from mlb_dfs_player_stats. Mirrors HR Derby exactly: same daily
-- cadence, same once-per-week reuse default, same data shape — only
-- the stat (strikeouts thrown) and the player pool (pitchers) differ.

CREATE TABLE strikeouts_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_date DATE NOT NULL,
  season INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  espn_player_id TEXT,
  team TEXT,
  headshot_url TEXT,
  strikeouts INTEGER DEFAULT 0,
  points_earned NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id, game_date, espn_player_id)
);

CREATE INDEX idx_strikeouts_picks_league_date ON strikeouts_picks(league_id, game_date);

CREATE TABLE strikeouts_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  espn_player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  UNIQUE(league_id, user_id, week_start, espn_player_id)
);

CREATE INDEX idx_strikeouts_usage_league_user ON strikeouts_usage(league_id, user_id, week_start);

ALTER TABLE strikeouts_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE strikeouts_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage strikeouts picks" ON strikeouts_picks FOR ALL TO authenticated USING (true);
CREATE POLICY "Members can manage strikeouts usage" ON strikeouts_usage FOR ALL TO authenticated USING (true);
