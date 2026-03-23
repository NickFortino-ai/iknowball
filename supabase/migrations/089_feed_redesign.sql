-- Add post_type to hot_takes: 'post', 'prediction', 'poll'
ALTER TABLE hot_takes ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'post'
  CHECK (post_type IN ('post', 'prediction', 'poll'));

-- Polls table: stores answer options and votes
CREATE TABLE poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hot_take_id UUID NOT NULL REFERENCES hot_takes(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 100),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_poll_options_take ON poll_options(hot_take_id);

CREATE TABLE poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  hot_take_id UUID NOT NULL REFERENCES hot_takes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(hot_take_id, user_id)
);

CREATE INDEX idx_poll_votes_option ON poll_votes(option_id);
CREATE INDEX idx_poll_votes_take ON poll_votes(hot_take_id);
CREATE INDEX idx_poll_votes_user ON poll_votes(user_id);

-- RLS for poll tables
ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read poll options" ON poll_options FOR SELECT USING (true);
CREATE POLICY "Authors can insert poll options" ON poll_options FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM hot_takes WHERE id = hot_take_id AND user_id = auth.uid()));

CREATE POLICY "Anyone can read poll votes" ON poll_votes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can vote" ON poll_votes FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Index for post_type filtering
CREATE INDEX idx_hot_takes_post_type ON hot_takes(post_type, created_at DESC);
