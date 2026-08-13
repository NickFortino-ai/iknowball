-- NFL DFS salaries: hidden flag so admins can drop players from the
-- user-visible pool (deep-bench QBs, RBs on bye, etc.) without
-- deleting the row. Auto-set to true for bye-week players during
-- generation; admins can toggle either direction from the editor.

ALTER TABLE dfs_weekly_salaries
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_dfs_weekly_salaries_hidden
  ON dfs_weekly_salaries(nfl_week, season, hidden);
