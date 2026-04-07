-- Add FAAB to waiver_type and a default budget
ALTER TABLE fantasy_settings DROP CONSTRAINT IF EXISTS fantasy_settings_waiver_type_check;
ALTER TABLE fantasy_settings ADD CONSTRAINT fantasy_settings_waiver_type_check
  CHECK (waiver_type IN ('priority', 'rolling', 'faab'));

ALTER TABLE fantasy_settings ADD COLUMN IF NOT EXISTS faab_starting_budget INTEGER DEFAULT 100;

-- Per-user waiver state for each fantasy league: their current priority
-- (lower = better, 1 is the front of the line) and remaining FAAB budget.
CREATE TABLE IF NOT EXISTS fantasy_waiver_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 1,
  faab_remaining INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_fantasy_waiver_state_league ON fantasy_waiver_state(league_id);

-- Pending waiver claims, processed in batch by the waiver cron.
CREATE TABLE IF NOT EXISTS fantasy_waiver_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  add_player_id TEXT NOT NULL REFERENCES nfl_players(id) ON DELETE CASCADE,
  drop_player_id TEXT REFERENCES nfl_players(id) ON DELETE SET NULL,
  bid_amount INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'awarded', 'failed', 'cancelled')),
  fail_reason TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fantasy_waiver_claims_league ON fantasy_waiver_claims(league_id, status);
CREATE INDEX IF NOT EXISTS idx_fantasy_waiver_claims_user ON fantasy_waiver_claims(user_id, status);

-- Notification types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'reaction', 'comment', 'streak_milestone', 'parlay_result', 'futures_result',
    'connection_request', 'connection_accepted', 'headlines', 'squares_quarter_win',
    'record_broken', 'survivor_result', 'survivor_win', 'league_deleted', 'league_win',
    'hot_take_reminder', 'hot_take_callout', 'league_invitation', 'league_thread_mention',
    'direct_message', 'league_report', 'nfl_injury_warning',
    'fantasy_trade_proposed', 'fantasy_trade_accepted', 'fantasy_trade_declined',
    'fantasy_waiver_awarded', 'fantasy_waiver_failed'
  ));

-- RLS
ALTER TABLE fantasy_waiver_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read waiver state" ON fantasy_waiver_state;
CREATE POLICY "Members read waiver state" ON fantasy_waiver_state FOR SELECT
  USING (EXISTS (SELECT 1 FROM league_members WHERE league_members.league_id = fantasy_waiver_state.league_id AND league_members.user_id = auth.uid()));

ALTER TABLE fantasy_waiver_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read waiver claims" ON fantasy_waiver_claims;
CREATE POLICY "Members read waiver claims" ON fantasy_waiver_claims FOR SELECT
  USING (EXISTS (SELECT 1 FROM league_members WHERE league_members.league_id = fantasy_waiver_claims.league_id AND league_members.user_id = auth.uid()));
DROP POLICY IF EXISTS "Members create their own claims" ON fantasy_waiver_claims;
CREATE POLICY "Members create their own claims" ON fantasy_waiver_claims FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Members cancel their own claims" ON fantasy_waiver_claims;
CREATE POLICY "Members cancel their own claims" ON fantasy_waiver_claims FOR UPDATE
  USING (auth.uid() = user_id);
