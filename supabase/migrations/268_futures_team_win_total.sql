-- Team win total auto-resolving futures (NFL v1).
--
-- Adds a third resolution_type ('team_win_total') that stores a
-- team + line and auto-resolves after the season by comparing the
-- team's regular-season wins (from ESPN standings) against the line.
--
-- Idempotent: safe to re-run against a partially-applied table.

-- Drop old CHECK to reintroduce with 'team_win_total' allowed.
ALTER TABLE futures_markets
  DROP CONSTRAINT IF EXISTS futures_markets_resolution_type_check;
ALTER TABLE futures_markets
  ADD CONSTRAINT futures_markets_resolution_type_check
  CHECK (resolution_type IN ('manual', 'stat_leader', 'team_win_total'));

ALTER TABLE futures_markets
  ADD COLUMN IF NOT EXISTS team_key TEXT,
  ADD COLUMN IF NOT EXISTS line NUMERIC;
