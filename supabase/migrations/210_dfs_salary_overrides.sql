-- Admin manual salary overrides for the NFL DFS / salary cap pool.
-- generateSalaries() in dfsService.js writes algorithm-computed prices.
-- Admins can edit individual rows; the manually_set flag tells the next
-- regen to preserve the human-set value instead of overwriting it.
--
-- algorithm_salary stores what the algorithm WOULD have set so the admin
-- editor can show both side-by-side (and reset back to algo if desired).

ALTER TABLE dfs_weekly_salaries
  ADD COLUMN IF NOT EXISTS manually_set BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS algorithm_salary INTEGER,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_dfs_salaries_manual ON dfs_weekly_salaries(season, nfl_week) WHERE manually_set = TRUE;
