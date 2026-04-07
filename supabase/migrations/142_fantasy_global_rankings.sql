-- Cross-league NFL fantasy rankings. Compares teams against every other
-- team across IKB that has the EXACT same format (roster slots, scoring,
-- num_teams, scoring rules). Refreshed nightly by a cron job.

CREATE TABLE IF NOT EXISTS fantasy_format_groups (
  format_hash TEXT PRIMARY KEY,
  num_teams INTEGER NOT NULL,
  scoring_format TEXT NOT NULL,
  roster_slots JSONB NOT NULL,
  scoring_rules JSONB,
  label TEXT NOT NULL,        -- human-readable, e.g., "12-team Half-PPR · standard roster"
  league_count INTEGER DEFAULT 0,
  team_count INTEGER DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fantasy_global_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  format_hash TEXT NOT NULL REFERENCES fantasy_format_groups(format_hash) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_points NUMERIC NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  rank_in_group INTEGER NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(format_hash, league_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_fantasy_global_rankings_user
  ON fantasy_global_rankings (user_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_global_rankings_format_rank
  ON fantasy_global_rankings (format_hash, rank_in_group);

-- Both tables are public-readable so the modal can show top 10 across leagues
ALTER TABLE fantasy_format_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_global_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY fantasy_format_groups_read ON fantasy_format_groups FOR SELECT USING (true);
CREATE POLICY fantasy_global_rankings_read ON fantasy_global_rankings FOR SELECT USING (true);
