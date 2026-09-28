-- Allow 12- and 14-team brackets.
--
-- bracket_templates_team_count_check has permitted only (4, 8, 16, 32, 64, 68)
-- since migration 024 — powers of two plus March Madness' 68. Every real
-- postseason that isn't a power of two was therefore unsaveable:
--
--   MLB            12 teams (four byes)
--   College Football Playoff  12 teams (four byes)
--   NFL            14 teams (one bye per conference)
--
-- The sport presets in BracketTemplateBuilder have produced these counts
-- since 2026-09-23, so the builder has been offering three shapes the
-- database refuses. Saving an MLB template fails with
-- "violates check constraint bracket_templates_team_count_check", which does
-- not name team_count's value and reads like a bug in the builder.
--
-- 64 stays even though no preset emits it — it is a legitimate single-elim
-- size and removing it would invalidate any existing row.

ALTER TABLE bracket_templates DROP CONSTRAINT IF EXISTS bracket_templates_team_count_check;

ALTER TABLE bracket_templates ADD CONSTRAINT bracket_templates_team_count_check
  CHECK (team_count IN (4, 8, 12, 14, 16, 32, 64, 68));
