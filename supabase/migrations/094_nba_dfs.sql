-- NBA DFS Salaries (per game night)
CREATE TABLE nba_dfs_salaries (
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
  UNIQUE(espn_player_id, game_date, season)
);

CREATE INDEX idx_nba_dfs_salaries_date ON nba_dfs_salaries(game_date, season);

-- NBA DFS Rosters (one per user per night per league)
CREATE TABLE nba_dfs_rosters (
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

CREATE INDEX idx_nba_dfs_rosters_league_date ON nba_dfs_rosters(league_id, game_date);

-- NBA DFS Roster Slots
CREATE TABLE nba_dfs_roster_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id UUID NOT NULL REFERENCES nba_dfs_rosters(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  espn_player_id TEXT,
  roster_slot TEXT NOT NULL CHECK (roster_slot IN ('PG1', 'PG2', 'SG1', 'SG2', 'SF1', 'SF2', 'PF1', 'PF2', 'C')),
  salary INTEGER NOT NULL,
  points_earned NUMERIC DEFAULT 0,
  is_locked BOOLEAN DEFAULT false,
  UNIQUE(roster_id, roster_slot)
);

CREATE INDEX idx_nba_dfs_roster_slots_roster ON nba_dfs_roster_slots(roster_id);

-- NBA DFS Player Stats (per game)
CREATE TABLE nba_dfs_player_stats (
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

CREATE INDEX idx_nba_dfs_stats_date ON nba_dfs_player_stats(game_date, season);

-- NBA DFS Nightly Results
CREATE TABLE nba_dfs_nightly_results (
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

CREATE INDEX idx_nba_dfs_results_league_date ON nba_dfs_nightly_results(league_id, game_date);
