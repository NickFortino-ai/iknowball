-- NFL Players table synced from Sleeper
CREATE TABLE nfl_players (
  id TEXT PRIMARY KEY, -- Sleeper player_id (e.g., "4046")
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  position TEXT, -- QB, RB, WR, TE, K, DEF
  team TEXT, -- NFL team abbreviation (e.g., "KC")
  number INTEGER,
  status TEXT, -- Active, Inactive, Injured Reserve, etc.
  age INTEGER,
  years_exp INTEGER,
  college TEXT,
  height TEXT,
  weight TEXT,
  injury_status TEXT, -- Questionable, Doubtful, Out, IR, null if healthy
  injury_body_part TEXT,
  depth_chart_position TEXT,
  depth_chart_order INTEGER,
  espn_id TEXT,
  search_rank INTEGER,
  -- Fantasy projections (season-level, updated weekly)
  projected_pts_ppr NUMERIC,
  projected_pts_half_ppr NUMERIC,
  projected_pts_std NUMERIC,
  adp_ppr NUMERIC,
  adp_half_ppr NUMERIC,
  -- Metadata
  headshot_url TEXT,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_nfl_players_position ON nfl_players(position);
CREATE INDEX idx_nfl_players_team ON nfl_players(team);
CREATE INDEX idx_nfl_players_status ON nfl_players(status);
CREATE INDEX idx_nfl_players_search_rank ON nfl_players(search_rank);

-- NFL Schedule
CREATE TABLE nfl_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  game_date DATE,
  status TEXT DEFAULT 'scheduled', -- scheduled, in_progress, complete
  home_score INTEGER,
  away_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(season, week, home_team)
);

CREATE INDEX idx_nfl_schedule_season_week ON nfl_schedule(season, week);

-- Weekly player stats
CREATE TABLE nfl_player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL REFERENCES nfl_players(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  -- Passing
  pass_att INTEGER DEFAULT 0,
  pass_cmp INTEGER DEFAULT 0,
  pass_yd NUMERIC DEFAULT 0,
  pass_td INTEGER DEFAULT 0,
  pass_int INTEGER DEFAULT 0,
  -- Rushing
  rush_att INTEGER DEFAULT 0,
  rush_yd NUMERIC DEFAULT 0,
  rush_td INTEGER DEFAULT 0,
  -- Receiving
  rec_tgt INTEGER DEFAULT 0,
  rec INTEGER DEFAULT 0,
  rec_yd NUMERIC DEFAULT 0,
  rec_td INTEGER DEFAULT 0,
  -- Misc
  fum_lost INTEGER DEFAULT 0,
  two_pt INTEGER DEFAULT 0,
  -- Kicking
  fgm INTEGER DEFAULT 0,
  fga INTEGER DEFAULT 0,
  fgm_0_39 INTEGER DEFAULT 0,
  fgm_40_49 INTEGER DEFAULT 0,
  fgm_50_plus INTEGER DEFAULT 0,
  xpm INTEGER DEFAULT 0,
  xpa INTEGER DEFAULT 0,
  -- Defense (team defense)
  def_td INTEGER DEFAULT 0,
  def_int INTEGER DEFAULT 0,
  def_sack NUMERIC DEFAULT 0,
  def_fum_rec INTEGER DEFAULT 0,
  def_safety INTEGER DEFAULT 0,
  def_pts_allowed INTEGER,
  -- Calculated fantasy points (per scoring format)
  pts_ppr NUMERIC,
  pts_half_ppr NUMERIC,
  pts_std NUMERIC,
  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_id, season, week)
);

CREATE INDEX idx_nfl_player_stats_week ON nfl_player_stats(season, week);
CREATE INDEX idx_nfl_player_stats_player ON nfl_player_stats(player_id);

-- Fantasy league settings (extends leagues table)
CREATE TABLE fantasy_settings (
  league_id UUID PRIMARY KEY REFERENCES leagues(id) ON DELETE CASCADE,
  scoring_format TEXT NOT NULL DEFAULT 'half_ppr' CHECK (scoring_format IN ('ppr', 'half_ppr', 'standard')),
  num_teams INTEGER NOT NULL DEFAULT 10,
  roster_slots JSONB NOT NULL DEFAULT '{"qb":1,"rb":2,"wr":2,"te":1,"flex":1,"k":1,"def":1,"bench":6,"ir":1}',
  draft_date TIMESTAMPTZ,
  draft_pick_timer INTEGER DEFAULT 90, -- seconds per pick
  draft_order TEXT[], -- array of user_ids in draft order
  draft_status TEXT DEFAULT 'pending' CHECK (draft_status IN ('pending', 'in_progress', 'completed')),
  waiver_type TEXT DEFAULT 'priority' CHECK (waiver_type IN ('priority', 'rolling')),
  trade_deadline DATE,
  trade_review TEXT DEFAULT 'commissioner' CHECK (trade_review IN ('commissioner', 'league_vote', 'none')),
  playoff_teams INTEGER DEFAULT 4,
  playoff_start_week INTEGER DEFAULT 15,
  current_week INTEGER DEFAULT 1,
  season INTEGER NOT NULL DEFAULT 2026,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fantasy rosters (which players are on which team)
CREATE TABLE fantasy_rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES nfl_players(id) ON DELETE CASCADE,
  slot TEXT NOT NULL DEFAULT 'bench', -- qb, rb1, rb2, wr1, wr2, te, flex, k, def, bench, ir
  acquired_via TEXT DEFAULT 'draft', -- draft, waiver, trade, free_agent
  acquired_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, player_id)
);

CREATE INDEX idx_fantasy_rosters_league_user ON fantasy_rosters(league_id, user_id);
CREATE INDEX idx_fantasy_rosters_player ON fantasy_rosters(player_id);

-- Fantasy matchups (weekly H2H)
CREATE TABLE fantasy_matchups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  home_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  away_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  home_points NUMERIC DEFAULT 0,
  away_points NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, week, home_user_id)
);

CREATE INDEX idx_fantasy_matchups_league_week ON fantasy_matchups(league_id, week);

-- Draft picks
CREATE TABLE fantasy_draft_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  pick_number INTEGER NOT NULL, -- overall pick number
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id TEXT REFERENCES nfl_players(id) ON DELETE SET NULL,
  picked_at TIMESTAMPTZ,
  is_auto_pick BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, pick_number)
);

CREATE INDEX idx_fantasy_draft_picks_league ON fantasy_draft_picks(league_id, pick_number);

-- Waiver claims
CREATE TABLE fantasy_waiver_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  add_player_id TEXT NOT NULL REFERENCES nfl_players(id),
  drop_player_id TEXT REFERENCES nfl_players(id),
  priority INTEGER,
  faab_bid INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  week INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fantasy_waivers_league_week ON fantasy_waiver_claims(league_id, week, status);

-- Trades
CREATE TABLE fantasy_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  proposer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposer_players TEXT[] NOT NULL, -- array of player_ids offered
  recipient_players TEXT[] NOT NULL, -- array of player_ids requested
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'vetoed', 'cancelled')),
  votes_for INTEGER DEFAULT 0,
  votes_against INTEGER DEFAULT 0,
  review_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fantasy_trades_league ON fantasy_trades(league_id, status);

-- Add 'fantasy' to league format options
ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_format_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_format_check
  CHECK (format IN ('pickem', 'survivor', 'squares', 'bracket', 'fantasy'));
