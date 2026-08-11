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

ALTER TABLE futures_markets
  ADD COLUMN resolution_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (resolution_type IN ('manual', 'stat_leader')),
  ADD COLUMN stat_category TEXT,
  ADD COLUMN stat_direction TEXT DEFAULT 'max'
    CHECK (stat_direction IN ('max', 'min')),
  ADD COLUMN close_at TIMESTAMPTZ;

-- close_at is when picks lock (typically kickoff of the season's
-- final week). auto-resolve cron only fires after this time.
CREATE INDEX idx_futures_markets_resolution ON futures_markets(resolution_type, status, close_at);
