-- MLB DFS Salaries (per game day)
CREATE TABLE mlb_dfs_salaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL,
  team TEXT NOT NULL,
  position TEXT NOT NULL,
  espn_player_id TEXT,
  game_date DATE NOT NULL,
  season INTEGER NOT NULL,
  salary INTEGER NOT NULL,
  opponent TEXT,
  game_starts_at TIMESTAMPTZ,
  headshot_url TEXT,
  injury_status TEXT,
  batting_order INTEGER,
  is_pitcher BOOLEAN DEFAULT false,
  UNIQUE(espn_player_id, game_date, season)
);

CREATE INDEX idx_mlb_dfs_salaries_date ON mlb_dfs_salaries(game_date, season);

-- MLB DFS Rosters (one per user per day per league)
CREATE TABLE mlb_dfs_rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_date DATE NOT NULL,
  season INTEGER NOT NULL,
  total_salary INTEGER NOT NULL DEFAULT 0,
  total_points NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id, game_date, season)
);

CREATE INDEX idx_mlb_dfs_rosters_league_date ON mlb_dfs_rosters(league_id, game_date);

-- MLB DFS Roster Slots
-- Positions: C, 1B, 2B, SS, 3B, OF1, OF2, OF3, UTIL
CREATE TABLE mlb_dfs_roster_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id UUID NOT NULL REFERENCES mlb_dfs_rosters(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  espn_player_id TEXT,
  roster_slot TEXT NOT NULL CHECK (roster_slot IN ('C', '1B', '2B', 'SS', '3B', 'OF1', 'OF2', 'OF3', 'UTIL')),
  salary INTEGER NOT NULL,
  points_earned NUMERIC DEFAULT 0,
  is_locked BOOLEAN DEFAULT false,
  UNIQUE(roster_id, roster_slot)
);

CREATE INDEX idx_mlb_dfs_roster_slots_roster ON mlb_dfs_roster_slots(roster_id);

-- MLB DFS Player Stats (per game)
CREATE TABLE mlb_dfs_player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  espn_player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  game_date DATE NOT NULL,
  season INTEGER NOT NULL,
  hits INTEGER DEFAULT 0,
  at_bats INTEGER DEFAULT 0,
  runs INTEGER DEFAULT 0,
  home_runs INTEGER DEFAULT 0,
  rbis INTEGER DEFAULT 0,
  stolen_bases INTEGER DEFAULT 0,
  walks INTEGER DEFAULT 0,
  strikeouts INTEGER DEFAULT 0,
  doubles INTEGER DEFAULT 0,
  triples INTEGER DEFAULT 0,
  total_bases INTEGER DEFAULT 0,
  fantasy_points NUMERIC DEFAULT 0,
  -- HR distance tracking (for HR Derby tiebreaker)
  hr_distances JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(espn_player_id, game_date, season)
);

CREATE INDEX idx_mlb_dfs_stats_date ON mlb_dfs_player_stats(game_date, season);

-- MLB DFS Nightly Results
CREATE TABLE mlb_dfs_nightly_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_date DATE NOT NULL,
  season INTEGER NOT NULL,
  total_points NUMERIC NOT NULL DEFAULT 0,
  night_rank INTEGER,
  is_night_winner BOOLEAN DEFAULT false,
  UNIQUE(league_id, user_id, game_date, season)
);

CREATE INDEX idx_mlb_dfs_results_league_date ON mlb_dfs_nightly_results(league_id, game_date);

-- Home Run Derby Picks
CREATE TABLE hr_derby_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_date DATE NOT NULL,
  season INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  espn_player_id TEXT,
  team TEXT,
  headshot_url TEXT,
  home_runs INTEGER DEFAULT 0,
  hr_distance_total INTEGER DEFAULT 0,
  points_earned NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id, game_date, espn_player_id)
);

CREATE INDEX idx_hr_derby_picks_league_date ON hr_derby_picks(league_id, game_date);

-- HR Derby Weekly Usage (track which players used each week)
CREATE TABLE hr_derby_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  espn_player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  UNIQUE(league_id, user_id, week_start, espn_player_id)
);

CREATE INDEX idx_hr_derby_usage_league_user ON hr_derby_usage(league_id, user_id, week_start);

-- RLS
ALTER TABLE mlb_dfs_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlb_dfs_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlb_dfs_roster_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlb_dfs_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlb_dfs_nightly_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_derby_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_derby_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view MLB DFS salaries" ON mlb_dfs_salaries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Members can manage their MLB DFS rosters" ON mlb_dfs_rosters FOR ALL TO authenticated USING (true);
CREATE POLICY "Members can manage their MLB DFS slots" ON mlb_dfs_roster_slots FOR ALL TO authenticated USING (true);
CREATE POLICY "Members can view MLB DFS stats" ON mlb_dfs_player_stats FOR ALL TO authenticated USING (true);
CREATE POLICY "Members can view MLB DFS results" ON mlb_dfs_nightly_results FOR ALL TO authenticated USING (true);
CREATE POLICY "Members can manage HR derby picks" ON hr_derby_picks FOR ALL TO authenticated USING (true);
CREATE POLICY "Members can manage HR derby usage" ON hr_derby_usage FOR ALL TO authenticated USING (true);
