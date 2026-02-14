-- ============================================
-- I Know Ball - Bracket Tournament Migration
-- ============================================

-- Add 'bracket' to leagues format CHECK
ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_format_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_format_check
  CHECK (format IN ('pickem', 'survivor', 'squares', 'bracket'));

-- ============================================
-- Bracket Templates (admin-created, reusable)
-- ============================================
CREATE TABLE IF NOT EXISTS bracket_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sport TEXT NOT NULL CHECK (sport IN ('americanfootball_nfl', 'basketball_nba', 'baseball_mlb', 'basketball_ncaab', 'americanfootball_ncaaf')),
  team_count INTEGER NOT NULL CHECK (team_count IN (4, 8, 16, 32, 64)),
  description TEXT,
  rounds JSONB NOT NULL DEFAULT '[]',
  regions JSONB,
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Bracket Template Matchups (bracket tree structure)
-- ============================================
CREATE TABLE IF NOT EXISTS bracket_template_matchups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES bracket_templates(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  position INTEGER NOT NULL,
  region TEXT,
  seed_top INTEGER,
  seed_bottom INTEGER,
  team_top TEXT,
  team_bottom TEXT,
  feeds_into_matchup_id UUID REFERENCES bracket_template_matchups(id) ON DELETE SET NULL,
  feeds_into_slot TEXT CHECK (feeds_into_slot IN ('top', 'bottom')),
  is_bye BOOLEAN DEFAULT false,
  UNIQUE(template_id, round_number, position)
);

-- ============================================
-- Bracket Tournaments (one per bracket league)
-- ============================================
CREATE TABLE IF NOT EXISTS bracket_tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID UNIQUE NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES bracket_templates(id) ON DELETE CASCADE,
  locks_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'locked', 'in_progress', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Bracket Matchups (actual matchups with results)
-- ============================================
CREATE TABLE IF NOT EXISTS bracket_matchups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES bracket_tournaments(id) ON DELETE CASCADE,
  template_matchup_id UUID NOT NULL REFERENCES bracket_template_matchups(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  position INTEGER NOT NULL,
  region TEXT,
  team_top TEXT,
  team_bottom TEXT,
  seed_top INTEGER,
  seed_bottom INTEGER,
  winner TEXT CHECK (winner IN ('top', 'bottom')),
  winning_team_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'completed')),
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,
  UNIQUE(tournament_id, round_number, position)
);

-- ============================================
-- Bracket Entries (one per user per tournament)
-- ============================================
CREATE TABLE IF NOT EXISTS bracket_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES bracket_tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_name TEXT,
  total_points INTEGER DEFAULT 0,
  possible_points INTEGER DEFAULT 0,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, user_id)
);

-- ============================================
-- Bracket Picks (individual picks within entry)
-- ============================================
CREATE TABLE IF NOT EXISTS bracket_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES bracket_entries(id) ON DELETE CASCADE,
  template_matchup_id UUID NOT NULL REFERENCES bracket_template_matchups(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  position INTEGER NOT NULL,
  picked_team TEXT NOT NULL,
  is_correct BOOLEAN,
  is_eliminated BOOLEAN DEFAULT false,
  points_earned INTEGER DEFAULT 0,
  UNIQUE(entry_id, template_matchup_id)
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_bracket_templates_sport ON bracket_templates(sport);
CREATE INDEX idx_bracket_templates_active ON bracket_templates(is_active);

CREATE INDEX idx_bracket_template_matchups_template ON bracket_template_matchups(template_id);
CREATE INDEX idx_bracket_template_matchups_feeds ON bracket_template_matchups(feeds_into_matchup_id);

CREATE INDEX idx_bracket_tournaments_league ON bracket_tournaments(league_id);
CREATE INDEX idx_bracket_tournaments_template ON bracket_tournaments(template_id);

CREATE INDEX idx_bracket_matchups_tournament ON bracket_matchups(tournament_id);
CREATE INDEX idx_bracket_matchups_template_matchup ON bracket_matchups(template_matchup_id);

CREATE INDEX idx_bracket_entries_tournament ON bracket_entries(tournament_id);
CREATE INDEX idx_bracket_entries_user ON bracket_entries(user_id);

CREATE INDEX idx_bracket_picks_entry ON bracket_picks(entry_id);
CREATE INDEX idx_bracket_picks_template_matchup ON bracket_picks(template_matchup_id);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE bracket_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_template_matchups ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_matchups ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_picks ENABLE ROW LEVEL SECURITY;

-- Templates: viewable by all authenticated, manageable by admins
CREATE POLICY "Templates viewable by authenticated users"
  ON bracket_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage templates"
  ON bracket_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- Template matchups: viewable by all authenticated
CREATE POLICY "Template matchups viewable by authenticated users"
  ON bracket_template_matchups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage template matchups"
  ON bracket_template_matchups FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- Tournaments: viewable by league members
CREATE POLICY "Tournaments viewable by league members"
  ON bracket_tournaments FOR SELECT
  TO authenticated
  USING (
    league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
  );

-- Bracket matchups: viewable by league members
CREATE POLICY "Bracket matchups viewable by league members"
  ON bracket_matchups FOR SELECT
  TO authenticated
  USING (
    tournament_id IN (
      SELECT bt.id FROM bracket_tournaments bt
      JOIN league_members lm ON bt.league_id = lm.league_id
      WHERE lm.user_id = auth.uid()
    )
  );

-- Entries: viewable by league members
CREATE POLICY "Entries viewable by league members"
  ON bracket_entries FOR SELECT
  TO authenticated
  USING (
    tournament_id IN (
      SELECT bt.id FROM bracket_tournaments bt
      JOIN league_members lm ON bt.league_id = lm.league_id
      WHERE lm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own entries"
  ON bracket_entries FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own entries"
  ON bracket_entries FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Picks: viewable by league members (after lock), own picks always visible
CREATE POLICY "Picks viewable by league members"
  ON bracket_picks FOR SELECT
  TO authenticated
  USING (
    entry_id IN (
      SELECT be.id FROM bracket_entries be
      JOIN bracket_tournaments bt ON be.tournament_id = bt.id
      JOIN league_members lm ON bt.league_id = lm.league_id
      WHERE lm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own picks"
  ON bracket_picks FOR INSERT
  TO authenticated
  WITH CHECK (
    entry_id IN (SELECT id FROM bracket_entries WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own picks"
  ON bracket_picks FOR UPDATE
  TO authenticated
  USING (
    entry_id IN (SELECT id FROM bracket_entries WHERE user_id = auth.uid())
  );
