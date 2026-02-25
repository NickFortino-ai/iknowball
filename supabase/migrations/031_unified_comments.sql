-- ============================================================
-- 031 — Unified Comments Table
-- Replaces pick_comments with a generic comments table that
-- supports picks, parlays, and prop picks.
-- ============================================================

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('pick', 'parlay', 'prop')),
  target_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 280),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_target ON comments(target_type, target_id);
CREATE INDEX idx_comments_user ON comments(user_id);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read comments"
  ON comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own comments"
  ON comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Migrate existing pick_comments data
INSERT INTO comments (id, target_type, target_id, user_id, content, created_at)
SELECT id, 'pick', pick_id, user_id, content, created_at FROM pick_comments;

-- Drop old table
DROP TABLE pick_comments;
