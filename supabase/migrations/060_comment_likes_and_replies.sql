-- Add reply threading to comments
ALTER TABLE comments ADD COLUMN parent_id UUID REFERENCES comments(id) ON DELETE CASCADE;
CREATE INDEX idx_comments_parent ON comments(parent_id);

-- Comment likes (simple heart, one per user per comment)
CREATE TABLE comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);
CREATE INDEX idx_comment_likes_comment ON comment_likes(comment_id);

ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read comment likes" ON comment_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own likes" ON comment_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own likes" ON comment_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);
