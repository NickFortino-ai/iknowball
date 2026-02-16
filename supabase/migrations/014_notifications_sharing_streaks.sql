-- notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('reaction', 'comment', 'streak_milestone')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_unread ON notifications (user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- pick_shares table
CREATE TABLE pick_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_id UUID NOT NULL REFERENCES picks(id) ON DELETE CASCADE UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pick_shares_user_created ON pick_shares (user_id, created_at DESC);

ALTER TABLE pick_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all pick_shares"
  ON pick_shares FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own pick_shares"
  ON pick_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- streak_events table
CREATE TABLE streak_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
  streak_length INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_streak_events_user_created ON streak_events (user_id, created_at DESC);

ALTER TABLE streak_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all streak_events"
  ON streak_events FOR SELECT
  TO authenticated
  USING (true);
