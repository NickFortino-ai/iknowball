-- DFS Weekly Salaries
CREATE TABLE dfs_weekly_salaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL REFERENCES nfl_players(id) ON DELETE CASCADE,
  nfl_week INTEGER NOT NULL,
  season INTEGER NOT NULL,
  salary INTEGER NOT NULL,
  UNIQUE(player_id, nfl_week, season)
);

CREATE INDEX idx_dfs_salaries_week ON dfs_weekly_salaries(season, nfl_week);

-- DFS Rosters (one per user per week per league)
CREATE TABLE dfs_rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nfl_week INTEGER NOT NULL,
  season INTEGER NOT NULL,
  total_salary INTEGER NOT NULL DEFAULT 0,
  total_points NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id, nfl_week, season)
);

CREATE INDEX idx_dfs_rosters_league_week ON dfs_rosters(league_id, nfl_week);

-- DFS Roster Slots (individual player slots within a roster)
CREATE TABLE dfs_roster_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id UUID NOT NULL REFERENCES dfs_rosters(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES nfl_players(id) ON DELETE CASCADE,
  roster_slot TEXT NOT NULL CHECK (roster_slot IN ('QB', 'RB1', 'RB2', 'WR1', 'WR2', 'WR3', 'TE', 'FLEX', 'DEF')),
  salary INTEGER NOT NULL,
  points_earned NUMERIC DEFAULT 0,
  is_locked BOOLEAN DEFAULT false,
  UNIQUE(roster_id, roster_slot)
);

CREATE INDEX idx_dfs_roster_slots_roster ON dfs_roster_slots(roster_id);

-- DFS Weekly Results
CREATE TABLE dfs_weekly_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nfl_week INTEGER NOT NULL,
  season INTEGER NOT NULL,
  total_points NUMERIC NOT NULL DEFAULT 0,
  week_rank INTEGER,
  is_week_winner BOOLEAN DEFAULT false,
  UNIQUE(league_id, user_id, nfl_week, season)
);

CREATE INDEX idx_dfs_results_league_week ON dfs_weekly_results(league_id, nfl_week);

-- Add DFS fields to fantasy_settings
ALTER TABLE fantasy_settings ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'traditional' CHECK (format IN ('traditional', 'salary_cap'));
ALTER TABLE fantasy_settings ADD COLUMN IF NOT EXISTS salary_cap INTEGER DEFAULT 60000;
ALTER TABLE fantasy_settings ADD COLUMN IF NOT EXISTS season_type TEXT DEFAULT 'full_season' CHECK (season_type IN ('full_season', 'single_week'));
ALTER TABLE fantasy_settings ADD COLUMN IF NOT EXISTS champion_metric TEXT DEFAULT 'total_points' CHECK (champion_metric IN ('total_points', 'most_wins'));
ALTER TABLE fantasy_settings ADD COLUMN IF NOT EXISTS single_week INTEGER;
