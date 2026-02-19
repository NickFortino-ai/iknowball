-- ============================================
-- Futures Markets & Picks
-- ============================================

-- Futures markets (e.g., NBA Championship Winner, NFL MVP)
CREATE TABLE futures_markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_key TEXT NOT NULL,
  futures_sport_key TEXT NOT NULL,
  external_event_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  outcomes JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'settled')),
  winning_outcome TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_futures_markets_sport_key ON futures_markets(sport_key);
CREATE INDEX idx_futures_markets_status ON futures_markets(status);

ALTER TABLE futures_markets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view futures markets"
  ON futures_markets FOR SELECT
  TO authenticated
  USING (true);

-- Futures picks (one per user per market, locked immediately)
CREATE TABLE futures_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES futures_markets(id) ON DELETE CASCADE,
  picked_outcome TEXT NOT NULL,
  odds_at_submission INTEGER NOT NULL,
  risk_at_submission INTEGER NOT NULL,
  reward_at_submission INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('pending', 'locked', 'settled')),
  is_correct BOOLEAN,
  points_earned INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, market_id)
);

CREATE INDEX idx_futures_picks_user ON futures_picks(user_id);
CREATE INDEX idx_futures_picks_market ON futures_picks(market_id);
CREATE INDEX idx_futures_picks_status ON futures_picks(status);

ALTER TABLE futures_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own futures picks"
  ON futures_picks FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own futures picks"
  ON futures_picks FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own futures picks"
  ON futures_picks FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Add futures_result to notification type constraint
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('reaction', 'comment', 'streak_milestone', 'parlay_result', 'futures_result'));
