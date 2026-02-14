-- Add admin flag to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Player props table
CREATE TABLE player_props (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  sport_id UUID NOT NULL REFERENCES sports(id),
  player_name TEXT NOT NULL,
  market_key TEXT NOT NULL,
  market_label TEXT NOT NULL,
  line NUMERIC NOT NULL,
  over_odds INTEGER,
  under_odds INTEGER,
  bookmaker TEXT,
  status TEXT NOT NULL DEFAULT 'synced' CHECK (status IN ('synced', 'published', 'locked', 'settled')),
  outcome TEXT CHECK (outcome IN ('over', 'under', 'push')),
  actual_value NUMERIC,
  featured_date DATE,
  external_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(game_id, player_name, market_key, line)
);

-- Only one featured prop per date
CREATE UNIQUE INDEX idx_player_props_featured_date ON player_props(featured_date) WHERE featured_date IS NOT NULL;

-- Prop picks table
CREATE TABLE prop_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prop_id UUID NOT NULL REFERENCES player_props(id) ON DELETE CASCADE,
  picked_side TEXT NOT NULL CHECK (picked_side IN ('over', 'under')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'locked', 'settled')),
  odds_at_pick INTEGER,
  risk_points INTEGER,
  reward_points INTEGER,
  is_correct BOOLEAN,
  points_earned INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, prop_id)
);

-- Indexes
CREATE INDEX idx_player_props_game_id ON player_props(game_id);
CREATE INDEX idx_player_props_status ON player_props(status);
CREATE INDEX idx_prop_picks_user_id ON prop_picks(user_id);
CREATE INDEX idx_prop_picks_prop_id ON prop_picks(prop_id);
CREATE INDEX idx_prop_picks_status ON prop_picks(status);

-- RLS for player_props
ALTER TABLE player_props ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published+ props viewable by authenticated users"
  ON player_props FOR SELECT
  TO authenticated
  USING (status IN ('published', 'locked', 'settled'));

CREATE POLICY "Admin full access to player_props"
  ON player_props FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS for prop_picks
ALTER TABLE prop_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own prop picks"
  ON prop_picks FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own prop picks"
  ON prop_picks FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own prop picks"
  ON prop_picks FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own prop picks"
  ON prop_picks FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
