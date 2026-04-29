-- Interceptions Contest league format
-- Each NFL week, pick up to 3 defenders. Each pick scores idp_int from
-- nfl_player_stats. Default reuse rule: once per season per defender;
-- commissioner can relax via fantasy_settings.pick_reuse = 'unlimited'.
-- Mirrors the Sacks Contest schema exactly, only the stat dimension differs.

CREATE TABLE ints_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  sleeper_player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  position TEXT,
  team TEXT,
  headshot_url TEXT,
  ints INTEGER DEFAULT 0,
  scored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id, season, week, sleeper_player_id)
);

CREATE INDEX idx_ints_picks_league_week ON ints_picks(league_id, season, week);
CREATE INDEX idx_ints_picks_player ON ints_picks(sleeper_player_id, season, week);

ALTER TABLE ints_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_league_ints_picks" ON ints_picks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = ints_picks.league_id
      AND lm.user_id = auth.uid()
    )
  );

CREATE POLICY "users_manage_own_ints_picks" ON ints_picks
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
