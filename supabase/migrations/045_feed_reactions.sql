-- Feed reactions table (separate from pick_reactions, which stays for GameCard/PickDetailModal)
CREATE TABLE feed_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('pick','parlay','streak_event','record_history')),
  target_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('fire','clown','goat','clap')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(target_type, target_id, user_id, reaction_type)
);

CREATE INDEX idx_feed_reactions_target ON feed_reactions(target_type, target_id);
CREATE INDEX idx_feed_reactions_user ON feed_reactions(user_id);

ALTER TABLE feed_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all feed reactions"
  ON feed_reactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own feed reactions"
  ON feed_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own feed reactions"
  ON feed_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Extend comments CHECK to include streak_event and record_history target types
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_target_type_check;
ALTER TABLE comments ADD CONSTRAINT comments_target_type_check
  CHECK (target_type IN ('pick', 'parlay', 'prop', 'streak_event', 'record_history'));
