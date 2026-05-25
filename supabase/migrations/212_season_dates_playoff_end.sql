-- Admin-defined playoff/postseason end date per sport per year. When set,
-- the clamp job treats this as the absolute ceiling for full_season DFS
-- and contest leagues in that sport. Leagues created during playoffs use
-- this date as their ends_at (via getFullSeasonLeagueEndDate on the client)
-- so they don't terminate before the championship round wraps.
--
-- Nullable — sports without a playoff date set fall back to the existing
-- regular-season-end-only clamping behavior.

ALTER TABLE season_dates
  ADD COLUMN IF NOT EXISTS playoff_ends_at TIMESTAMPTZ NULL;
