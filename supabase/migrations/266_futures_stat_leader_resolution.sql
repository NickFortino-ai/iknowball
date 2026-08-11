-- Auto-resolving futures via stat leaders.
--
-- Extends futures_markets with three nullable columns so a market
-- can optionally declare "resolve me by picking the leader in stat
-- X from source data" instead of requiring an admin to click Settle.
-- Existing markets keep working unchanged (resolution_type defaults
-- to 'manual').
--
-- stat_category is a free-text slug matched against a per-sport
-- config in the server (see statLeaderFuturesService.js) — no DB
-- constraint on the values so adding a new category is a code-only
-- change.
--
-- Idempotent: all clauses tolerate a partial prior run.

ALTER TABLE futures_markets
  ADD COLUMN IF NOT EXISTS resolution_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS stat_category TEXT,
  ADD COLUMN IF NOT EXISTS stat_direction TEXT DEFAULT 'max',
  ADD COLUMN IF NOT EXISTS close_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE futures_markets ADD CONSTRAINT futures_markets_resolution_type_check
    CHECK (resolution_type IN ('manual', 'stat_leader'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE futures_markets ADD CONSTRAINT futures_markets_stat_direction_check
    CHECK (stat_direction IN ('max', 'min'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- close_at is when picks lock (typically kickoff of the season's
-- final week). auto-resolve cron only fires after this time.
CREATE INDEX IF NOT EXISTS idx_futures_markets_resolution
  ON futures_markets(resolution_type, status, close_at);
