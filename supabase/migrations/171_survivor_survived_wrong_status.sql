-- Add 'survived_wrong' to survivor_picks status check constraint.
-- Used when all players are eliminated and revived — the pick was wrong
-- but the user survived because everyone else was also wrong.

ALTER TABLE survivor_picks DROP CONSTRAINT IF EXISTS survivor_picks_status_check;
ALTER TABLE survivor_picks ADD CONSTRAINT survivor_picks_status_check
  CHECK (status IN ('pending', 'locked', 'survived', 'survived_wrong', 'eliminated'));
