-- Draft Prep: canonical rankings keyed by user + roster config + scoring format
CREATE TABLE draft_prep_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  roster_config_hash TEXT NOT NULL,
  scoring_format TEXT NOT NULL DEFAULT 'half_ppr',
  player_id TEXT NOT NULL REFERENCES nfl_players(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, roster_config_hash, scoring_format, player_id)
);

CREATE INDEX idx_draft_prep_rankings_lookup
  ON draft_prep_rankings (user_id, roster_config_hash, scoring_format, rank);

-- Track which leagues are synced to draft prep rankings
CREATE TABLE draft_prep_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  roster_config_hash TEXT NOT NULL,
  scoring_format TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, league_id)
);

CREATE INDEX idx_draft_prep_sync_user ON draft_prep_sync (user_id);

-- RLS: draft_prep_rankings
ALTER TABLE draft_prep_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY draft_prep_rankings_select ON draft_prep_rankings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY draft_prep_rankings_insert ON draft_prep_rankings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY draft_prep_rankings_update ON draft_prep_rankings
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY draft_prep_rankings_delete ON draft_prep_rankings
  FOR DELETE USING (auth.uid() = user_id);

-- RLS: draft_prep_sync
ALTER TABLE draft_prep_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY draft_prep_sync_select ON draft_prep_sync
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY draft_prep_sync_insert ON draft_prep_sync
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY draft_prep_sync_update ON draft_prep_sync
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY draft_prep_sync_delete ON draft_prep_sync
  FOR DELETE USING (auth.uid() = user_id);
