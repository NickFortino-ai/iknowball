-- Immutable snapshot of the commissioner's ORIGINAL team-count target
-- at league creation, for use in underfill notification copy.
--
-- Problem: num_teams gets overwritten when a commish resizes the league
-- down via the underfill notification's "resize down to X" action. So
-- subsequent windows say things like "Only 2 of 2 have joined" instead
-- of the original "Only 2 of 14 have joined" that they'd expect.
--
-- initial_num_teams is set on creation and never modified — use it in
-- the notification body so the copy reflects the original ambition.
ALTER TABLE fantasy_settings
  ADD COLUMN IF NOT EXISTS initial_num_teams INTEGER;

-- Backfill from current num_teams for existing rows. Post-migration,
-- initial_num_teams will be stable while num_teams may drift down via
-- resize.
UPDATE fantasy_settings
SET initial_num_teams = num_teams
WHERE initial_num_teams IS NULL;
