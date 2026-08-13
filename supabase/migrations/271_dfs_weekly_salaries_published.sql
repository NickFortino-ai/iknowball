-- NFL DFS salaries: publish flag so admins can generate + edit a
-- week's prices before users see them.
--
-- Default false on new INSERTs so the algorithmic generator produces
-- draft rows. Existing rows are backfilled to true so pre-launch weeks
-- stay visible on the current player pool. UPSERT doesn't touch the
-- column on UPDATE (unless we explicitly include it), so a regen of an
-- already-published week keeps its published state.

ALTER TABLE dfs_weekly_salaries
  ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT false;

UPDATE dfs_weekly_salaries SET published = true WHERE published = false;

CREATE INDEX IF NOT EXISTS idx_dfs_weekly_salaries_published
  ON dfs_weekly_salaries(nfl_week, season, published);
