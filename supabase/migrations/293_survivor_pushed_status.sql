-- Add 'pushed' to the survivor_picks status check constraint.
--
-- WHY: a pick can survive a period without its game producing a result —
-- the game was postponed and never made up inside the period, or it ended
-- in a genuine draw. Until now both were written as 'survived', which is
-- true (the user advances) but renders as a green ring identical to a pick
-- that actually won. A push is not a win and should not look like one.
--
-- 'pushed' is 'survived' in every semantic sense:
--   * the user stays alive and advances
--   * the team IS burned — it counts against the no-reuse rule, same as a
--     win (Nick's call 2026-10-17)
--   * it extends a survivor streak
-- The ONLY difference is that the UI gives it a yellow ring instead of
-- green, so the board reads honestly.
--
-- Distinct from 'survived_wrong', which already exists and is also yellow:
-- that one means the pick actually LOST and the all_eliminated_survive rule
-- revived the user. A push means there was never a result to lose.
--
-- Every server-side status list that counts a pick as committed — used
-- teams, used players, survivor streaks, has-locked-picks — gains 'pushed'
-- in the same commit. Missing one of those would silently let a user
-- re-pick a team they had already spent.

ALTER TABLE survivor_picks DROP CONSTRAINT IF EXISTS survivor_picks_status_check;

ALTER TABLE survivor_picks ADD CONSTRAINT survivor_picks_status_check
  CHECK (status IN ('pending', 'locked', 'survived', 'survived_wrong', 'pushed', 'eliminated'));

-- ---------------------------------------------------------------------
-- Backfill the one pick this was written for.
--
-- daluz's Day 2 Cleveland Guardians pick in "Immortality--ALL SPORTS Daily
-- Survivor". The Rays @ Guardians game was postponed; the makeup was
-- rescheduled into Day 3, where he already holds a separate pick, so Day 2
-- can never produce a result for him.
--
-- It is currently 'locked' and stranded — the week is already marked
-- missed_picks_processed, which puts it out of reach of the job that would
-- otherwise clear it (fixed going forward in 4eb1a30a).
-- ---------------------------------------------------------------------
UPDATE survivor_picks
SET status = 'pushed', updated_at = NOW()
WHERE id = 'bcde910b-2e90-4977-8ab2-ad124080a653'
  AND status = 'locked';

-- CONFIRM — expect one row, 'pushed', Cleveland Guardians, Day 2.
SELECT sp.status, sp.team_name, lw.week_number, u.username
FROM survivor_picks sp
JOIN league_weeks lw ON lw.id = sp.league_week_id
JOIN users u ON u.id = sp.user_id
WHERE sp.id = 'bcde910b-2e90-4977-8ab2-ad124080a653';

-- And nothing else is left stranded on a postponed game.
SELECT COUNT(*) AS still_stranded
FROM survivor_picks sp
JOIN games g ON g.id = sp.game_id
WHERE sp.status = 'locked' AND g.status = 'postponed';
-- ^ expect 0.
