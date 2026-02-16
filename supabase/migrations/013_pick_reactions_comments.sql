-- ============================================================
-- 013 — Pick Reactions & Comments
-- Adds emoji reactions and text comments on picks for the
-- social activity feed.
-- ============================================================

-- ============================================================
-- 1. pick_reactions table
-- ============================================================
CREATE TABLE pick_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_id UUID NOT NULL REFERENCES picks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('fire','clown','goat','dead','clap','ice')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pick_id, user_id, reaction_type)
);

CREATE INDEX idx_pick_reactions_pick_id ON pick_reactions(pick_id);
CREATE INDEX idx_pick_reactions_user_id ON pick_reactions(user_id);

ALTER TABLE pick_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read reactions"
  ON pick_reactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own reactions"
  ON pick_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own reactions"
  ON pick_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- 2. pick_comments table
-- ============================================================
CREATE TABLE pick_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_id UUID NOT NULL REFERENCES picks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 280),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pick_comments_pick_id ON pick_comments(pick_id);

ALTER TABLE pick_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read comments"
  ON pick_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own comments"
  ON pick_comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON pick_comments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
