-- Records & Royalty tables

-- Records table — stores current record holders
CREATE TABLE records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('streak', 'single_pick', 'percentage', 'efficiency', 'climb')),
  record_holder_id UUID REFERENCES users(id) ON DELETE SET NULL,
  record_value NUMERIC,
  record_metadata JSONB DEFAULT '{}'::jsonb,
  sport_key TEXT,
  parent_record_key TEXT REFERENCES records(record_key) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_records_category ON records(category);
CREATE INDEX idx_records_holder ON records(record_holder_id);
CREATE INDEX idx_records_parent ON records(parent_record_key);

-- Record history — tracks when records are broken
CREATE TABLE record_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_key TEXT NOT NULL REFERENCES records(record_key) ON DELETE CASCADE,
  previous_holder_id UUID REFERENCES users(id) ON DELETE SET NULL,
  new_holder_id UUID REFERENCES users(id) ON DELETE SET NULL,
  previous_value NUMERIC,
  new_value NUMERIC,
  metadata JSONB DEFAULT '{}'::jsonb,
  broken_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_record_history_key ON record_history(record_key);
CREATE INDEX idx_record_history_broken_at ON record_history(broken_at DESC);

-- Leaderboard rank snapshots — for Great Climb record
CREATE TABLE leaderboard_rank_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'global',
  rank INTEGER NOT NULL,
  total_points NUMERIC NOT NULL DEFAULT 0,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(user_id, scope, snapshot_date)
);

CREATE INDEX idx_rank_snapshots_user ON leaderboard_rank_snapshots(user_id);
CREATE INDEX idx_rank_snapshots_date ON leaderboard_rank_snapshots(snapshot_date);

-- RLS policies
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE record_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_rank_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Records are viewable by authenticated users"
  ON records FOR SELECT TO authenticated USING (true);

CREATE POLICY "Record history is viewable by authenticated users"
  ON record_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "Rank snapshots are viewable by authenticated users"
  ON leaderboard_rank_snapshots FOR SELECT TO authenticated USING (true);

-- Seed top-level record keys
INSERT INTO records (record_key, display_name, description, category) VALUES
  ('longest_win_streak', 'Longest Win Streak', 'Most consecutive correct straight picks', 'streak'),
  ('longest_parlay_streak', 'Longest Parlay Streak', 'Most consecutive correct parlays', 'streak'),
  ('longest_prop_streak', 'Longest Prop Streak', 'Most consecutive correct prop picks', 'streak'),
  ('highest_prop_pct', 'Highest Prop Pick %', 'Best prop pick win percentage (min 20 picks)', 'percentage'),
  ('biggest_underdog_hit', 'Biggest Underdog Hit', 'Highest odds on a correct straight pick', 'single_pick'),
  ('biggest_parlay', 'Biggest Parlay', 'Highest combined multiplier on a correct parlay', 'single_pick'),
  ('fewest_picks_to_goat', 'Fewest Picks to GOAT', 'Reached GOAT tier with the fewest total picks', 'efficiency'),
  ('biggest_dog_lover', 'Biggest Dog Lover', 'Highest percentage of underdog picks (min 50 picks)', 'percentage'),
  ('great_climb', 'Great Climb', 'Biggest improvement in global leaderboard ranking', 'climb'),
  ('best_futures_hit', 'Best Futures Hit', 'Highest odds on a correct futures pick', 'single_pick'),
  ('highest_overall_win_pct', 'Highest Overall Win %', 'Best overall win percentage across all pick types (min 100 picks)', 'percentage');

-- Seed per-sport sub-records for win streaks
INSERT INTO records (record_key, display_name, description, category, sport_key, parent_record_key)
SELECT
  'longest_win_streak_' || key,
  'Longest ' || name || ' Win Streak',
  'Most consecutive correct ' || name || ' straight picks',
  'streak',
  key,
  'longest_win_streak'
FROM sports;

-- Seed per-sport sub-records for futures hits
INSERT INTO records (record_key, display_name, description, category, sport_key, parent_record_key)
SELECT
  'best_futures_hit_' || key,
  'Best ' || name || ' Futures Hit',
  'Highest odds on a correct ' || name || ' futures pick',
  'single_pick',
  key,
  'best_futures_hit'
FROM sports;

-- Update notification type constraint to include record_broken
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('reaction','comment','streak_milestone','parlay_result',
    'futures_result','connection_request','headlines','squares_quarter_win','record_broken'));
