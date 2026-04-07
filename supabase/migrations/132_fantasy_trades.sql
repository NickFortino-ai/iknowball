-- Fantasy trade proposals
CREATE TABLE IF NOT EXISTS fantasy_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  proposer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'vetoed')),
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fantasy_trades_league ON fantasy_trades(league_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_trades_status ON fantasy_trades(league_id, status);

-- Each trade has multiple players going each direction
CREATE TABLE IF NOT EXISTS fantasy_trade_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES fantasy_trades(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES nfl_players(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fantasy_trade_items_trade ON fantasy_trade_items(trade_id);

-- Add notification types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'reaction', 'comment', 'streak_milestone', 'parlay_result', 'futures_result',
    'connection_request', 'connection_accepted', 'headlines', 'squares_quarter_win',
    'record_broken', 'survivor_result', 'survivor_win', 'league_deleted', 'league_win',
    'hot_take_reminder', 'hot_take_callout', 'league_invitation', 'league_thread_mention',
    'direct_message', 'league_report', 'nfl_injury_warning',
    'fantasy_trade_proposed', 'fantasy_trade_accepted', 'fantasy_trade_declined'
  ));

ALTER TABLE fantasy_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view trades in their leagues" ON fantasy_trades FOR SELECT
  USING (EXISTS (SELECT 1 FROM league_members WHERE league_members.league_id = fantasy_trades.league_id AND league_members.user_id = auth.uid()));
CREATE POLICY "Members can create trades in their leagues" ON fantasy_trades FOR INSERT
  WITH CHECK (auth.uid() = proposer_user_id);
CREATE POLICY "Trade participants can update their own trades" ON fantasy_trades FOR UPDATE
  USING (auth.uid() = proposer_user_id OR auth.uid() = receiver_user_id);

ALTER TABLE fantasy_trade_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view trade items" ON fantasy_trade_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM fantasy_trades WHERE fantasy_trades.id = fantasy_trade_items.trade_id));
CREATE POLICY "Members can insert their own trade items" ON fantasy_trade_items FOR INSERT
  WITH CHECK (true);
