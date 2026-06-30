-- Expand fantasy_settings.season_type CHECK to accept 'custom_range'.
-- The duration UI and zod validator have allowed custom_range for NBA/
-- WNBA/MLB DFS for a while, but the CHECK constraint from migration 093
-- was never updated. First commissioner to try a custom-range DFS slate
-- hit the violation. Server downstream code does `=== 'single_week'`
-- checks and treats everything-else as full-season equivalent, so
-- custom_range slots in cleanly without further changes.

ALTER TABLE fantasy_settings
  DROP CONSTRAINT IF EXISTS fantasy_settings_season_type_check;

ALTER TABLE fantasy_settings
  ADD CONSTRAINT fantasy_settings_season_type_check
  CHECK (season_type IN ('full_season', 'single_week', 'custom_range'));
