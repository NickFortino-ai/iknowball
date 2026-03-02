-- Crown snapshots: daily record of who holds #1 on each leaderboard
CREATE TABLE crown_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(scope, snapshot_date)
);

CREATE INDEX idx_crown_snapshots_user ON crown_snapshots(user_id);
CREATE INDEX idx_crown_snapshots_scope_date ON crown_snapshots(scope, snapshot_date);

-- Seed the longest reign record
INSERT INTO records (record_key, display_name, description, category)
VALUES ('longest_crown_tenure', 'Longest Reign', 'Most consecutive days as #1 on any leaderboard', 'streak');
