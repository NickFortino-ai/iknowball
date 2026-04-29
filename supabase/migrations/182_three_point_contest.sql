-- 3-Point Contest league format
-- Mirrors HR Derby: pick up to 3 NBA players per night, score 1 point per
-- made 3-pointer. Default reuse rule is once-per-week; commissioner can
-- relax it via fantasy_settings.pick_reuse.

CREATE TABLE three_point_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_date DATE NOT NULL,
  season INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  espn_player_id TEXT,
  team TEXT,
  headshot_url TEXT,
  made_threes INTEGER DEFAULT 0,
  points_earned NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id, game_date, espn_player_id)
);

CREATE INDEX idx_three_point_picks_league_date ON three_point_picks(league_id, game_date);

CREATE TABLE three_point_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  espn_player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  UNIQUE(league_id, user_id, week_start, espn_player_id)
);

CREATE INDEX idx_three_point_usage_league_user ON three_point_usage(league_id, user_id, week_start);

ALTER TABLE three_point_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE three_point_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view 3-Point picks" ON three_point_picks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members can manage their 3-Point picks" ON three_point_picks FOR ALL TO authenticated USING (true);
CREATE POLICY "Members can view 3-Point usage" ON three_point_usage FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members can manage their 3-Point usage" ON three_point_usage FOR ALL TO authenticated USING (true);

-- Player reuse policy. 'weekly' = once per Mon-Sun week (default, matches HR
-- Derby); 'unlimited' = no reuse restriction. Applies to both 3-Point Contest
-- and HR Derby — adding here so existing HR Derby leagues inherit the safe
-- default.
ALTER TABLE fantasy_settings ADD COLUMN IF NOT EXISTS pick_reuse TEXT DEFAULT 'weekly';
