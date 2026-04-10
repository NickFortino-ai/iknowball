-- Chronological log of all fantasy roster transactions.
-- Populated by add/drop, waiver, trade, and draft flows.

CREATE TABLE fantasy_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('add', 'drop', 'trade_send', 'trade_receive', 'waiver_add', 'waiver_drop', 'draft')),
  player_id TEXT NOT NULL REFERENCES nfl_players(id) ON DELETE CASCADE,
  -- For trades: link to the trade
  trade_id UUID REFERENCES fantasy_trades(id) ON DELETE SET NULL,
  -- For waivers: FAAB bid
  bid_amount INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fantasy_transactions_league ON fantasy_transactions(league_id, created_at DESC);
CREATE INDEX idx_fantasy_transactions_user ON fantasy_transactions(user_id);

ALTER TABLE fantasy_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "League members can view transactions"
  ON fantasy_transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage transactions"
  ON fantasy_transactions FOR ALL
  TO service_role
  USING (true);
