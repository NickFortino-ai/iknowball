-- Hot takes table
CREATE TABLE hot_takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 280),
  team_tag TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hot_takes_created ON hot_takes(created_at DESC);
CREATE INDEX idx_hot_takes_user ON hot_takes(user_id);

ALTER TABLE hot_takes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all hot takes"
  ON hot_takes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own hot takes"
  ON hot_takes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own hot takes"
  ON hot_takes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Update feed_reactions constraint to add 'hot_take'
ALTER TABLE feed_reactions DROP CONSTRAINT IF EXISTS feed_reactions_target_type_check;
ALTER TABLE feed_reactions ADD CONSTRAINT feed_reactions_target_type_check
  CHECK (target_type IN ('pick','parlay','streak_event','record_history','hot_take'));

-- Update comments constraint to add 'hot_take'
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_target_type_check;
ALTER TABLE comments ADD CONSTRAINT comments_target_type_check
  CHECK (target_type IN ('pick', 'parlay', 'prop', 'streak_event', 'record_history', 'hot_take'));
