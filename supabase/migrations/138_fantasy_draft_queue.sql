-- Pre-rank queue: each user can pre-list players they want; when their
-- pick clock expires, the autopicker drains the queue (skipping any that
-- have been drafted) before falling back to ADP / search_rank.
CREATE TABLE IF NOT EXISTS fantasy_draft_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES nfl_players(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (league_id, user_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_fantasy_draft_queues_user
  ON fantasy_draft_queues (league_id, user_id, rank);

ALTER TABLE fantasy_draft_queues ENABLE ROW LEVEL SECURITY;

CREATE POLICY fantasy_draft_queues_select ON fantasy_draft_queues
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY fantasy_draft_queues_insert ON fantasy_draft_queues
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY fantasy_draft_queues_update ON fantasy_draft_queues
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY fantasy_draft_queues_delete ON fantasy_draft_queues
  FOR DELETE USING (auth.uid() = user_id);
