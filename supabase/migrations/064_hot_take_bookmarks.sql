-- Bookmarks ("Receipts") for hot takes
CREATE TABLE hot_take_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hot_take_id UUID NOT NULL REFERENCES hot_takes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, hot_take_id)
);

CREATE INDEX idx_hot_take_bookmarks_user ON hot_take_bookmarks (user_id, created_at DESC);
CREATE INDEX idx_hot_take_bookmarks_take ON hot_take_bookmarks (hot_take_id);

ALTER TABLE hot_take_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read bookmarks" ON hot_take_bookmarks FOR SELECT USING (true);
CREATE POLICY "Users can insert own bookmarks" ON hot_take_bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own bookmarks" ON hot_take_bookmarks FOR DELETE USING (auth.uid() = user_id);
