-- Player season stat over/under auto-resolving futures (NFL v1).
--
-- Adds a fourth resolution_type ('player_stat_over_under') that stores
-- a player + stat_category + line and auto-resolves after the player's
-- team completes its regular season by comparing the player's season
-- total to the line.
--
-- Idempotent: safe to re-run against a partially-applied table.

ALTER TABLE futures_markets
  DROP CONSTRAINT IF EXISTS futures_markets_resolution_type_check;
ALTER TABLE futures_markets
  ADD CONSTRAINT futures_markets_resolution_type_check
  CHECK (resolution_type IN ('manual', 'stat_leader', 'team_win_total', 'player_stat_over_under'));

ALTER TABLE futures_markets
  ADD COLUMN IF NOT EXISTS player_id TEXT;
