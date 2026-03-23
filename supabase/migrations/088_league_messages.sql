CREATE TABLE league_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  user_tags UUID[] DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_league_messages_league ON league_messages(league_id, created_at DESC);

-- RLS
ALTER TABLE league_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "League members can read messages"
  ON league_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM league_members WHERE league_id = league_messages.league_id AND user_id = auth.uid()
  ));

CREATE POLICY "League members can insert messages"
  ON league_messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (SELECT 1 FROM league_members WHERE league_id = league_messages.league_id AND user_id = auth.uid())
  );

-- Update notification type constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('reaction','comment','streak_milestone','parlay_result',
    'futures_result','connection_request','headlines','squares_quarter_win',
    'record_broken','survivor_result','survivor_win','league_deleted','league_win',
    'hot_take_reminder','hot_take_ask','hot_take_callout','league_invitation',
    'direct_message','connection_accepted','league_thread_mention'));
