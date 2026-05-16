-- WNBA 3-Point Contest league format
-- Same mechanics as the NBA 3-Point Contest (mirrors three_point_picks),
-- but the player pool comes from ESPN's WNBA endpoints and scoring reads
-- box-score 3PM directly from ESPN game summaries (no wnba_player_stats
-- table exists, so we lean on the same fetchPlayerBoxStats helper that
-- WNBA prop settlement uses).

CREATE TABLE wnba_three_point_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_date DATE NOT NULL,
  season INTEGER NOT NULL,
  espn_player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  team TEXT,
  headshot_url TEXT,
  made_threes INTEGER DEFAULT 0,
  scored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id, game_date, espn_player_id)
);

CREATE INDEX idx_wnba_three_point_picks_league_date ON wnba_three_point_picks(league_id, game_date);
CREATE INDEX idx_wnba_three_point_picks_player_date ON wnba_three_point_picks(espn_player_id, game_date);

ALTER TABLE wnba_three_point_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_league_wnba_three_point_picks" ON wnba_three_point_picks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = wnba_three_point_picks.league_id
      AND lm.user_id = auth.uid()
    )
  );

CREATE POLICY "users_manage_own_wnba_three_point_picks" ON wnba_three_point_picks
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Extend leagues_format_check to include the new format.
ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_format_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_format_check
  CHECK (format IN (
    'pickem', 'survivor', 'squares', 'bracket', 'fantasy',
    'nba_dfs', 'mlb_dfs',
    'hr_derby', 'td_pass',
    'three_point', 'sacks', 'ints', 'strikeouts',
    'tackles', 'receptions',
    'wnba_three_point'
  ));

-- Extend fantasy_settings.format CHECK so the pick_reuse row can be
-- persisted for WNBA 3-Point leagues (same gear-icon edit flow as NBA).
ALTER TABLE fantasy_settings DROP CONSTRAINT IF EXISTS fantasy_settings_format_check;
ALTER TABLE fantasy_settings ADD CONSTRAINT fantasy_settings_format_check
  CHECK (format IN (
    'traditional', 'salary_cap',
    'hr_derby', 'strikeouts', 'three_point',
    'sacks', 'ints', 'tackles', 'receptions',
    'wnba_three_point'
  ));
