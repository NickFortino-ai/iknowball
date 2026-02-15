-- ============================================
-- Connections table
-- ============================================

CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_1 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id_2 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('league_auto', 'manual_request')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('connected', 'pending')),
  requested_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id_1 < user_id_2),
  UNIQUE(user_id_1, user_id_2)
);

CREATE INDEX idx_connections_user1 ON connections(user_id_1);
CREATE INDEX idx_connections_user2 ON connections(user_id_2);
CREATE INDEX idx_connections_status ON connections(status);

-- ============================================
-- RLS: Enable + service role handles all operations
-- ============================================

ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Connections are viewable by involved users"
  ON connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);
