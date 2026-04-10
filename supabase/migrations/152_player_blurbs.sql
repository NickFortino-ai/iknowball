-- Player blurbs: AI-generated or manually written analysis for fantasy players.
-- Admin reviews/edits before publishing. One published blurb per player at a time.

CREATE TABLE player_blurbs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL REFERENCES nfl_players(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  season INTEGER NOT NULL,
  week INTEGER,
  generated_by TEXT NOT NULL DEFAULT 'manual' CHECK (generated_by IN ('ai', 'manual')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_player_blurbs_player ON player_blurbs(player_id);
CREATE INDEX idx_player_blurbs_status ON player_blurbs(status);
CREATE INDEX idx_player_blurbs_player_status ON player_blurbs(player_id, status);

ALTER TABLE player_blurbs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view published blurbs"
  ON player_blurbs FOR SELECT
  TO authenticated
  USING (status = 'published');

CREATE POLICY "Service role can manage blurbs"
  ON player_blurbs FOR ALL
  TO service_role
  USING (true);
