-- Admin manual overrides for MLB DFS salaries. Mirrors the NFL/WNBA pattern
-- (migrations 210, 215): manually_set rows are preserved across regens, and
-- algorithm_salary stores what the generator would have produced so the
-- admin editor can show both and offer a reset.

ALTER TABLE mlb_dfs_salaries
  ADD COLUMN IF NOT EXISTS manually_set BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE mlb_dfs_salaries
  ADD COLUMN IF NOT EXISTS algorithm_salary INTEGER;

ALTER TABLE mlb_dfs_salaries
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_mlb_dfs_salaries_manual
  ON mlb_dfs_salaries(season, game_date)
  WHERE manually_set = TRUE;

-- Per migration 217/215 convention, new tables/columns also need the
-- Data API grant once Supabase's auto-grant default is removed
-- (see project memory project_supabase_data_api_grants.md). These are
-- ALTERs on an existing table, so no new GRANT is required here.
