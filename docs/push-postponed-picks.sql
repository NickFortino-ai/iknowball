-- Push the straight picks stranded on postponed games.
--
-- WHY THEY ARE STUCK: a pick only settles when scoreCompletedGame runs,
-- which only happens when its game goes final. A postponed game never does.
-- settleStuckParlays already sweeps PARLAY LEGS in this state
-- (src/jobs/settleStuckParlays.js:137, `.in('games.status', ['final',
-- 'postponed'])`) but there is no equivalent for straight picks, so they sit
-- 'locked'/'pending' forever. 36 of them, going back to 2026-04-02.
--
-- WHY PUSH: the game on that row was never played. This is the same
-- convention the survivor code already states in
-- survivorService.autoEliminateMissedPicks — "Sportsbook convention:
-- postponed = push" — and the same thing settleStuckParlays does to a leg.
-- A push is status='settled', is_correct=NULL, points_earned=0, which is
-- exactly what scoreCompletedGame writes when winner IS NULL.
--
-- NO POINTS MOVE. Every one of these 36 is currently points_earned NULL or
-- 0 with is_correct NULL — verified before writing this — and a push awards
-- 0, so users.total_points is untouched and there is nothing to claw back.
--
-- VERIFIED NOT STUCK-POSTPONED. Each of the 26 distinct games was checked
-- against ESPN. 24 are STATUS_POSTPONED there too. The two that show FINAL
-- on ESPN for that date were postponed and made up as doubleheaders, and we
-- already hold SEPARATE final rows for the makeups:
--
--   2026-06-16 SF @ ATL   postponed row 06-16 23:16; replayed 06-17 (final 7-5)
--   2026-07-11 MIL @ PIT  postponed row 07-11 04:50; doubleheader the same
--                         day at 16:06 (final 6-7) and 20:16 (final 2-3)
--
-- So no pick here is being pushed on a game that actually happened on that
-- row. Picks on the makeup games settled normally on their own rows.
--
-- The 2026-10-17 Rays @ Guardians row (the orphan that triggered the admin
-- email) is included — it was postponed and rescheduled to 10/18 under a new
-- event id, so its row will never finalize either.
--
-- NOT INCLUDED: the one survivor pick on that same Rays @ Guardians game.
-- It self-heals — autoEliminateMissedPicks pushes still-locked survivor
-- picks to 'survived' once the period is 24h past, around 2026-10-18 10:00
-- UTC. Leave it alone.
--
-- This is a ONE-OFF CLEANUP, not a fix. Nothing stops the next postponement
-- from stranding more picks; that needs the sweeper in settleStuckParlays.

BEGIN;

-- ---------------------------------------------------------------------
-- 0. SAFETY GUARD. Aborts rather than warns if anything here already
--    carries a result — re-running must never overwrite a real settlement.
-- ---------------------------------------------------------------------
DO $$
DECLARE already_scored int;
BEGIN
  SELECT COUNT(*) INTO already_scored
  FROM picks p
  JOIN games g ON g.id = p.game_id
  WHERE p.status IN ('locked', 'pending')
    AND g.status = 'postponed'
    AND (p.is_correct IS NOT NULL OR COALESCE(p.points_earned, 0) <> 0);

  IF already_scored <> 0 THEN
    RAISE EXCEPTION 'Found % stranded picks that already carry a result. Aborting.', already_scored;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. LOOK FIRST — expect 36 (9 locked, 27 pending) across 26 games.
-- ---------------------------------------------------------------------
SELECT COUNT(*) AS picks_to_push,
       COUNT(DISTINCT p.game_id) AS across_games,
       COUNT(DISTINCT p.user_id) AS affecting_users
FROM picks p
JOIN games g ON g.id = p.game_id
WHERE p.status IN ('locked', 'pending')
  AND g.status = 'postponed';

-- ---------------------------------------------------------------------
-- 2. THE PUSH.
--
-- Written against games.status rather than a hardcoded id list so it stays
-- correct if a row changes state between the check above and this update.
-- ---------------------------------------------------------------------
UPDATE picks p
SET status        = 'settled',
    is_correct    = NULL,   -- NULL is the push marker, same as a tie
    points_earned = 0,
    updated_at    = NOW()
FROM games g
WHERE g.id = p.game_id
  AND p.status IN ('locked', 'pending')
  AND g.status = 'postponed';

COMMIT;

-- ---------------------------------------------------------------------
-- 3. CONFIRM. Run after COMMIT.
-- ---------------------------------------------------------------------

-- a) Nothing left stranded on a postponed game.
SELECT COUNT(*) AS still_stuck
FROM picks p JOIN games g ON g.id = p.game_id
WHERE p.status IN ('locked', 'pending') AND g.status = 'postponed';
-- ^ expect 0.

-- b) The pushed rows, newest first. Every one should read
--    settled / is_correct NULL / 0 points.
SELECT u.username, g.away_team, g.home_team, g.starts_at::date AS game_date,
       p.picked_team, p.status, p.is_correct, p.points_earned
FROM picks p
JOIN games g ON g.id = p.game_id
JOIN users u ON u.id = p.user_id
WHERE g.status = 'postponed' AND p.status = 'settled'
ORDER BY g.starts_at DESC;
-- ^ expect 36 rows.

-- c) Sanity: no user's total moved. Pushes award 0, so this is only here to
--    prove it. Compare against whatever you had before if you grabbed it.
SELECT COUNT(*) AS users_with_push
FROM (
  SELECT DISTINCT p.user_id
  FROM picks p JOIN games g ON g.id = p.game_id
  WHERE g.status = 'postponed' AND p.status = 'settled'
) t;
