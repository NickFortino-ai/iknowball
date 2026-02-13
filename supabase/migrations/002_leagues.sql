-- ============================================
-- I Know Ball - League System Migration
-- ============================================

-- Leagues table
CREATE TABLE IF NOT EXISTS leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('pickem', 'survivor', 'squares')),
  sport TEXT NOT NULL CHECK (sport IN ('americanfootball_nfl', 'basketball_nba', 'baseball_mlb', 'all')),
  duration TEXT NOT NULL CHECK (duration IN ('this_week', 'custom_range', 'full_season', 'playoffs_only')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  invite_code TEXT UNIQUE NOT NULL,
  max_members INTEGER,
  commissioner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'active', 'completed', 'archived')),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- League members table
CREATE TABLE IF NOT EXISTS league_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('commissioner', 'member')),
  is_alive BOOLEAN DEFAULT true,
  lives_remaining INTEGER DEFAULT 1,
  eliminated_week INTEGER,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id)
);

-- League weeks table
CREATE TABLE IF NOT EXISTS league_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed')),
  UNIQUE(league_id, week_number)
);

-- Pick'em game selections (only used when games_per_week is set)
CREATE TABLE IF NOT EXISTS pickem_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_week_id UUID NOT NULL REFERENCES league_weeks(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id, game_id)
);

-- Survivor picks table
CREATE TABLE IF NOT EXISTS survivor_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_week_id UUID NOT NULL REFERENCES league_weeks(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  picked_team TEXT NOT NULL CHECK (picked_team IN ('home', 'away')),
  team_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'locked', 'survived', 'eliminated')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id, league_week_id)
);

-- Squares boards table
CREATE TABLE IF NOT EXISTS squares_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID UNIQUE NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  row_digits INTEGER[],
  col_digits INTEGER[],
  digits_locked BOOLEAN DEFAULT false,
  q1_away_score INTEGER,
  q1_home_score INTEGER,
  q2_away_score INTEGER,
  q2_home_score INTEGER,
  q3_away_score INTEGER,
  q3_home_score INTEGER,
  q4_away_score INTEGER,
  q4_home_score INTEGER,
  q1_winner_id UUID REFERENCES users(id),
  q2_winner_id UUID REFERENCES users(id),
  q3_winner_id UUID REFERENCES users(id),
  q4_winner_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Squares claims table
CREATE TABLE IF NOT EXISTS squares_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES squares_boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  row_pos INTEGER NOT NULL CHECK (row_pos >= 0 AND row_pos <= 9),
  col_pos INTEGER NOT NULL CHECK (col_pos >= 0 AND col_pos <= 9),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(board_id, row_pos, col_pos)
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_leagues_commissioner ON leagues(commissioner_id);
CREATE INDEX idx_leagues_invite_code ON leagues(invite_code);
CREATE INDEX idx_leagues_status ON leagues(status);

CREATE INDEX idx_league_members_league ON league_members(league_id);
CREATE INDEX idx_league_members_user ON league_members(user_id);

CREATE INDEX idx_league_weeks_league ON league_weeks(league_id);

CREATE INDEX idx_pickem_selections_league_week ON pickem_selections(league_id, league_week_id);
CREATE INDEX idx_pickem_selections_user ON pickem_selections(user_id);

CREATE INDEX idx_survivor_picks_league ON survivor_picks(league_id);
CREATE INDEX idx_survivor_picks_user ON survivor_picks(user_id);
CREATE INDEX idx_survivor_picks_game ON survivor_picks(game_id);
CREATE INDEX idx_survivor_picks_league_week ON survivor_picks(league_id, league_week_id);

CREATE INDEX idx_squares_boards_game ON squares_boards(game_id);
CREATE INDEX idx_squares_claims_board ON squares_claims(board_id);
CREATE INDEX idx_squares_claims_user ON squares_claims(user_id);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickem_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE survivor_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE squares_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE squares_claims ENABLE ROW LEVEL SECURITY;

-- Leagues: viewable by members, creatable by authenticated users
CREATE POLICY "Leagues viewable by members"
  ON leagues FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Authenticated users can create leagues"
  ON leagues FOR INSERT
  TO authenticated
  WITH CHECK (commissioner_id = auth.uid());

CREATE POLICY "Commissioners can update their leagues"
  ON leagues FOR UPDATE
  TO authenticated
  USING (commissioner_id = auth.uid())
  WITH CHECK (commissioner_id = auth.uid());

-- League members: viewable by fellow members, self-insertable
CREATE POLICY "League members viewable by fellow members"
  ON league_members FOR SELECT
  TO authenticated
  USING (
    league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can join leagues"
  ON league_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave leagues"
  ON league_members FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- League weeks: viewable by league members
CREATE POLICY "League weeks viewable by members"
  ON league_weeks FOR SELECT
  TO authenticated
  USING (
    league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
  );

-- Pick'em selections: viewable by league members, self-insertable
CREATE POLICY "Pickem selections viewable by league members"
  ON pickem_selections FOR SELECT
  TO authenticated
  USING (
    league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own selections"
  ON pickem_selections FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Survivor picks: viewable by league members, own picks insertable/updatable
CREATE POLICY "Survivor picks viewable by league members"
  ON survivor_picks FOR SELECT
  TO authenticated
  USING (
    league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own survivor picks"
  ON survivor_picks FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own pending survivor picks"
  ON survivor_picks FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid());

-- Squares boards: viewable by league members
CREATE POLICY "Squares boards viewable by league members"
  ON squares_boards FOR SELECT
  TO authenticated
  USING (
    league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
  );

-- Squares claims: viewable by league members, self-insertable
CREATE POLICY "Squares claims viewable by league members"
  ON squares_claims FOR SELECT
  TO authenticated
  USING (
    board_id IN (
      SELECT sb.id FROM squares_boards sb
      JOIN league_members lm ON sb.league_id = lm.league_id
      WHERE lm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can claim squares"
  ON squares_claims FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
