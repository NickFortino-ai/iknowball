-- parlays table (the ticket)
CREATE TABLE parlays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'locked', 'settled')),
  leg_count INTEGER NOT NULL CHECK (leg_count BETWEEN 2 AND 5),
  risk_points INTEGER NOT NULL DEFAULT 10,
  combined_multiplier NUMERIC(10, 4),
  reward_points INTEGER,
  is_correct BOOLEAN,
  points_earned INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_parlays_user_status ON parlays (user_id, status);
CREATE INDEX idx_parlays_user_created ON parlays (user_id, created_at DESC);

ALTER TABLE parlays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own parlays"
  ON parlays FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own parlays"
  ON parlays FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own parlays"
  ON parlays FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own parlays"
  ON parlays FOR DELETE
  USING (auth.uid() = user_id);

-- parlay_legs table (individual picks within a parlay)
CREATE TABLE parlay_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parlay_id UUID NOT NULL REFERENCES parlays(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  picked_team TEXT NOT NULL CHECK (picked_team IN ('home', 'away')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'locked', 'won', 'lost', 'push')),
  odds_at_submission INTEGER,
  odds_at_lock INTEGER,
  multiplier_at_lock NUMERIC(10, 4),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(parlay_id, game_id)
);

CREATE INDEX idx_parlay_legs_parlay ON parlay_legs (parlay_id);
CREATE INDEX idx_parlay_legs_game_status ON parlay_legs (game_id, status);

ALTER TABLE parlay_legs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own parlay legs"
  ON parlay_legs FOR SELECT
  USING (EXISTS (SELECT 1 FROM parlays WHERE parlays.id = parlay_legs.parlay_id AND parlays.user_id = auth.uid()));

CREATE POLICY "Users can insert own parlay legs"
  ON parlay_legs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM parlays WHERE parlays.id = parlay_legs.parlay_id AND parlays.user_id = auth.uid()));

CREATE POLICY "Users can update own parlay legs"
  ON parlay_legs FOR UPDATE
  USING (EXISTS (SELECT 1 FROM parlays WHERE parlays.id = parlay_legs.parlay_id AND parlays.user_id = auth.uid()));

CREATE POLICY "Users can delete own parlay legs"
  ON parlay_legs FOR DELETE
  USING (EXISTS (SELECT 1 FROM parlays WHERE parlays.id = parlay_legs.parlay_id AND parlays.user_id = auth.uid()));

-- Add parlay_result to notification type constraint
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('reaction', 'comment', 'streak_milestone', 'parlay_result'));
