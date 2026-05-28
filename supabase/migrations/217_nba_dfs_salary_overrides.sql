-- Admin manual overrides for NBA DFS salaries. Mirrors the NFL/WNBA pattern
-- (migrations 210, 215): manually_set rows are preserved across regens, and
-- algorithm_salary stores what the generator would have produced so the
-- admin editor can show both and offer a reset.

ALTER TABLE nba_dfs_salaries
  ADD COLUMN IF NOT EXISTS manually_set BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE nba_dfs_salaries
  ADD COLUMN IF NOT EXISTS algorithm_salary INTEGER;

ALTER TABLE nba_dfs_salaries
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_nba_dfs_salaries_manual
  ON nba_dfs_salaries(season, game_date)
  WHERE manually_set = TRUE;
