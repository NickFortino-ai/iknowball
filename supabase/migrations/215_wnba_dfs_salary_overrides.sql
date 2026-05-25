-- Admin manual overrides for WNBA DFS salaries. Mirrors the NFL pattern
-- (migration 210): manually_set rows are preserved across regens, and
-- algorithm_salary stores what the generator would have produced so the
-- admin editor can show both and offer a reset.

ALTER TABLE wnba_dfs_salaries
  ADD COLUMN IF NOT EXISTS manually_set BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE wnba_dfs_salaries
  ADD COLUMN IF NOT EXISTS algorithm_salary INTEGER;

ALTER TABLE wnba_dfs_salaries
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_wnba_dfs_salaries_manual
  ON wnba_dfs_salaries(season, game_date)
  WHERE manually_set = TRUE;
