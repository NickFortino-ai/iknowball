-- Cross-device-persisted mock drafts. Recent mocks stay client-only in
-- localStorage; bookmarked ('saved') mocks live here so users can access
-- them from any device.
CREATE TABLE IF NOT EXISTS mock_draft_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT,        -- client-side mock id (e.g. 'mock_1712534521234'); used for dedupe
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mock_draft_saves_user
  ON mock_draft_saves (user_id, created_at DESC);

ALTER TABLE mock_draft_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY mock_draft_saves_select ON mock_draft_saves
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY mock_draft_saves_insert ON mock_draft_saves
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY mock_draft_saves_delete ON mock_draft_saves
  FOR DELETE USING (auth.uid() = user_id);
