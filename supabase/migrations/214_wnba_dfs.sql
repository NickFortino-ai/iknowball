-- WNBA Daily Fantasy. Mirrors nba_dfs_* schema with WNBA-specific roster:
-- 2 G / 2 F / 1 C / 4 UTIL = 9 slots. ESPN tags every WNBA player as
-- exactly G, F, or C (0 hybrid tags across 208 league-wide players in
-- our Step-1 sweep), so the slot enum stays clean. UTIL slots accept any
-- position; the single C slot reflects the WNBA's thin true-center pool
-- (25 league-wide; LA roster has 0 — 2 dedicated C slots would force
-- nearly-identical lineups on a thin slate).

CREATE TABLE wnba_dfs_salaries (
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
  injury_detail TEXT,
  UNIQUE(espn_player_id, game_date, season)
);

CREATE INDEX idx_wnba_dfs_salaries_date ON wnba_dfs_salaries(game_date, season);

CREATE TABLE wnba_dfs_rosters (
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

CREATE INDEX idx_wnba_dfs_rosters_league_date ON wnba_dfs_rosters(league_id, game_date);

CREATE TABLE wnba_dfs_roster_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id UUID NOT NULL REFERENCES wnba_dfs_rosters(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  espn_player_id TEXT,
  roster_slot TEXT NOT NULL CHECK (roster_slot IN ('G1', 'G2', 'F1', 'F2', 'C', 'UTIL1', 'UTIL2', 'UTIL3', 'UTIL4')),
  salary INTEGER NOT NULL,
  points_earned NUMERIC DEFAULT 0,
  is_locked BOOLEAN DEFAULT false,
  UNIQUE(roster_id, roster_slot)
);

CREATE INDEX idx_wnba_dfs_roster_slots_roster ON wnba_dfs_roster_slots(roster_id);

CREATE TABLE wnba_dfs_player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  espn_player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  game_date DATE NOT NULL,
  season INTEGER NOT NULL,
  points INTEGER DEFAULT 0,
  rebounds INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  steals INTEGER DEFAULT 0,
  blocks INTEGER DEFAULT 0,
  turnovers INTEGER DEFAULT 0,
  three_pointers_made INTEGER DEFAULT 0,
  minutes_played INTEGER DEFAULT 0,
  fantasy_points NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(espn_player_id, game_date, season)
);

CREATE INDEX idx_wnba_dfs_stats_date ON wnba_dfs_player_stats(game_date, season);

CREATE TABLE wnba_dfs_nightly_results (
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

CREATE INDEX idx_wnba_dfs_results_league_date ON wnba_dfs_nightly_results(league_id, game_date);

-- RLS — parity with nba_dfs (which is enabled via migration 147).
ALTER TABLE wnba_dfs_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE wnba_dfs_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE wnba_dfs_roster_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE wnba_dfs_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE wnba_dfs_nightly_results ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read everything (salaries are public, roster
-- visibility is enforced at the route level by hiding picks until game start).
CREATE POLICY "Authenticated users can read wnba dfs salaries"
  ON wnba_dfs_salaries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read wnba dfs stats"
  ON wnba_dfs_player_stats FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read wnba dfs nightly results"
  ON wnba_dfs_nightly_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read wnba dfs rosters"
  ON wnba_dfs_rosters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read wnba dfs roster slots"
  ON wnba_dfs_roster_slots FOR SELECT TO authenticated USING (true);

-- Extend leagues_format_check to include wnba_dfs.
ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_format_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_format_check
  CHECK (format IN (
    'pickem', 'survivor', 'squares', 'bracket', 'fantasy',
    'nba_dfs', 'mlb_dfs', 'wnba_dfs',
    'hr_derby', 'td_pass',
    'three_point', 'sacks', 'ints', 'strikeouts',
    'tackles', 'receptions',
    'wnba_three_point'
  ));
