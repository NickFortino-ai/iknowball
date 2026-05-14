-- Solo Tackles Contest + Receptions Contest league formats
-- Each NFL week, pick up to 3 players. Each pick scores idp_tkl_solo
-- (tackles) or rec (receptions) from nfl_player_stats. Default reuse rule:
-- once per season per player; commissioner can flip to 2x, 3x, or unlimited
-- via fantasy_settings.pick_reuse. Mirrors the Sacks / Interceptions schema.

CREATE TABLE tackles_picks (
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
  tackles NUMERIC DEFAULT 0,
  scored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id, season, week, sleeper_player_id)
);

CREATE INDEX idx_tackles_picks_league_week ON tackles_picks(league_id, season, week);
CREATE INDEX idx_tackles_picks_player ON tackles_picks(sleeper_player_id, season, week);

ALTER TABLE tackles_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_league_tackles_picks" ON tackles_picks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = tackles_picks.league_id
      AND lm.user_id = auth.uid()
    )
  );

CREATE POLICY "users_manage_own_tackles_picks" ON tackles_picks
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE receptions_picks (
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
  receptions INTEGER DEFAULT 0,
  scored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id, season, week, sleeper_player_id)
);

CREATE INDEX idx_receptions_picks_league_week ON receptions_picks(league_id, season, week);
CREATE INDEX idx_receptions_picks_player ON receptions_picks(sleeper_player_id, season, week);

ALTER TABLE receptions_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_league_receptions_picks" ON receptions_picks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = receptions_picks.league_id
      AND lm.user_id = auth.uid()
    )
  );

CREATE POLICY "users_manage_own_receptions_picks" ON receptions_picks
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Extend leagues_format_check to include the two new formats.
ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_format_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_format_check
  CHECK (format IN (
    'pickem', 'survivor', 'squares', 'bracket', 'fantasy',
    'nba_dfs', 'mlb_dfs',
    'hr_derby', 'td_pass',
    'three_point', 'sacks', 'ints', 'strikeouts',
    'tackles', 'receptions'
  ));

-- Extend fantasy_settings.format CHECK to allow every single-stat contest.
-- Until now this column was constrained to ('traditional', 'salary_cap'),
-- which meant we could never persist a fantasy_settings row for sacks /
-- ints / tackles / receptions / hr_derby / strikeouts / three_point — the
-- gear-icon pick_reuse editor had nowhere to write. Drop and re-add.
ALTER TABLE fantasy_settings DROP CONSTRAINT IF EXISTS fantasy_settings_format_check;
ALTER TABLE fantasy_settings ADD CONSTRAINT fantasy_settings_format_check
  CHECK (format IN (
    'traditional', 'salary_cap',
    'hr_derby', 'strikeouts', 'three_point',
    'sacks', 'ints', 'tackles', 'receptions'
  ));
