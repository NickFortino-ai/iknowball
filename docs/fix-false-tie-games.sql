-- Repair five games we finalized as ties that were never tied.
--
-- CAUSE (fixed in code, commit beaee628): the Odds API reports `completed`
-- while still serving an in-progress snapshot. scoreGames wrote that score
-- and derived winner=null. Every downstream scorer reads a null winner as a
-- PUSH, so nothing errored — picks settled at zero, parlay legs dropped out
-- of the multiplier, and survivorService marked a LOSING pick as 'survived'.
--
-- In all five the stored score is missing exactly the game-winning score:
--
--   2026-03-07  MTL 5 @ ANA 5     real: ANA 6-5
--   2026-03-18  NSH 3 @ WPG 3     real: NSH 4-3
--   2026-05-06  CIN 6 @ CHC 6     real: CHC 7-6
--   2026-10-04  LA  4 @ SJ  4     real: SJ  5-4   (overtime)
--   2026-10-14  KENN 21 @ MOST 21 real: MOST 24-21
--
-- Every real score below was read from ESPN's scoreboard for that date, with
-- the winner confirmed by ESPN's own `competitor.winner` flag.
--
-- NOT INCLUDED, deliberately:
--   * The 2 MLB 0-0 "finals" (MIL@KC 2026-04-03, CHC@CLE 2026-04-04). ESPN
--     says STATUS_POSTPONED for both — they are stuck-postponed rows, a
--     different bug, and no picks ride on them.
--   * NYG 27-27 WSH (2026-10-11). That is a REAL NFL tie; ESPN flags no
--     winner. Leave it alone.
--   * 112 MLS draws, 8 World Cup, 2 NFL preseason. All legitimate.
--
-- The code fix is already deployed, so no new instances can appear. This only
-- cleans up what already landed.

BEGIN;

-- ---------------------------------------------------------------------
-- 0. SAFETY GUARD — aborts the whole transaction rather than just warning.
--
-- Two ways this file could double-apply points if it were run twice, and
-- both are checked: the games must still be unresolved ties, and every
-- affected pick must still be sitting at 0 points. A bare SELECT would only
-- print a warning and let the UPDATEs run anyway, so this RAISEs instead.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  tied_games int;
  scored_picks int;
BEGIN
  SELECT COUNT(*) INTO tied_games
  FROM games
  WHERE id IN ('4d7da694-8880-4514-ac3b-07896b2aaa52',  -- MTL @ ANA
               'feaec278-7cdc-432a-a692-ad7749e1f9b7',  -- NSH @ WPG
               '62659781-1b5e-4a27-a672-b88153c4bcf4',  -- CIN @ CHC
               '23f7ff95-d73b-451d-a19f-b837a86a0e24',  -- LA  @ SJ
               '3d8712cd-2f1e-4571-997c-7d984b9012eb')  -- KENN @ MOST
    AND winner IS NULL;

  IF tied_games <> 5 THEN
    RAISE EXCEPTION 'Expected 5 games still tied with winner IS NULL, found %. Already repaired? Aborting.', tied_games;
  END IF;

  SELECT COUNT(*) INTO scored_picks
  FROM picks
  WHERE game_id IN ('4d7da694-8880-4514-ac3b-07896b2aaa52',
                    'feaec278-7cdc-432a-a692-ad7749e1f9b7',
                    '62659781-1b5e-4a27-a672-b88153c4bcf4',
                    '23f7ff95-d73b-451d-a19f-b837a86a0e24',
                    '3d8712cd-2f1e-4571-997c-7d984b9012eb')
    AND COALESCE(points_earned, 0) <> 0;

  IF scored_picks <> 0 THEN
    RAISE EXCEPTION 'Found % picks already carrying points. Re-running would double-apply. Aborting.', scored_picks;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. THE GAMES. Correct score + winner.
--
-- live_away_score / live_home_score are reset alongside the real score.
-- Those columns hold what the clock said when we last polled, and they are
-- the proof of the cause — every one of these was captured moments before
-- the winning score:
--
--   KENN @ MOST   live 21-21 at Q4 0:35
--   CIN  @ CHC    live  6-6  in the Bot 10th
--   MTL  @ ANA    live  5-5  in period 5 (OT)
--
-- Leaving them stale would let any surface that reads live_* keep showing
-- the tie after this file corrects the final.
-- ---------------------------------------------------------------------
UPDATE games SET away_score =  5, home_score =  6, winner = 'home',
                 live_away_score =  5, live_home_score =  6, updated_at = NOW()
WHERE id = '4d7da694-8880-4514-ac3b-07896b2aaa52';   -- Canadiens 5 @ Ducks 6

UPDATE games SET away_score =  4, home_score =  3, winner = 'away',
                 live_away_score =  4, live_home_score =  3, updated_at = NOW()
WHERE id = 'feaec278-7cdc-432a-a692-ad7749e1f9b7';   -- Predators 4 @ Jets 3

UPDATE games SET away_score =  6, home_score =  7, winner = 'home',
                 live_away_score =  6, live_home_score =  7, updated_at = NOW()
WHERE id = '62659781-1b5e-4a27-a672-b88153c4bcf4';   -- Reds 6 @ Cubs 7

UPDATE games SET away_score =  4, home_score =  5, winner = 'home',
                 live_away_score =  4, live_home_score =  5, updated_at = NOW()
WHERE id = '23f7ff95-d73b-451d-a19f-b837a86a0e24';   -- Kings 4 @ Sharks 5 (OT)

UPDATE games SET away_score = 21, home_score = 24, winner = 'home',
                 live_away_score = 21, live_home_score = 24, updated_at = NOW()
WHERE id = '3d8712cd-2f1e-4571-997c-7d984b9012eb';   -- Owls 21 @ Bears 24

-- ---------------------------------------------------------------------
-- 2. STRAIGHT PICKS — 9 rows, 8 users.
--
-- Computed from games.winner (now correct) and the stake already stored on
-- the row, which is exactly what scoringService.scoreCompletedGame does:
--   won  -> +reward_points      lost -> -risk_points
-- Hardcoding nothing means a pick with an unusual stake still settles right.
--
-- Expected outcome:
--   Dunkaroos          +11   NSH  (won)
--   Ustadbadger         +6   CHC  (won)
--   Desmond_Fortino     +6   CHC  (won)
--   tabaxibrightflame   +6   CHC  (won)
--   SolidSailor96       +8   SJ   (won)
--   daluz              +13   MOST (won)
--   Mason              -10   KENN (lost)
--   SolidSailor96      -10   KENN (lost)
--   Billysims          -10   KENN (lost)
--   Damian_11          -10   KENN (lost)
-- SolidSailor96 appears twice: +8 and -10, net -2.
-- ---------------------------------------------------------------------
UPDATE picks p
SET is_correct   = (p.picked_team = g.winner),
    points_earned = CASE WHEN p.picked_team = g.winner
                         THEN  COALESCE(p.reward_points, 0)
                         ELSE -COALESCE(p.risk_points,   0) END,
    status       = 'settled',
    updated_at   = NOW()
FROM games g
WHERE g.id = p.game_id
  AND p.game_id IN (
    '4d7da694-8880-4514-ac3b-07896b2aaa52',
    'feaec278-7cdc-432a-a692-ad7749e1f9b7',
    '62659781-1b5e-4a27-a672-b88153c4bcf4',
    '23f7ff95-d73b-451d-a19f-b837a86a0e24',
    '3d8712cd-2f1e-4571-997c-7d984b9012eb'
  );

-- ---------------------------------------------------------------------
-- 3. USER TOTALS. The push awarded 0, so the delta IS the new value —
--    nothing to claw back. Run this ONCE (step 0 is the guard).
-- ---------------------------------------------------------------------
UPDATE users u
SET total_points = COALESCE(u.total_points, 0) + d.delta,
    updated_at   = NOW()
FROM (
  SELECT p.user_id, SUM(p.points_earned) AS delta
  FROM picks p
  WHERE p.game_id IN (
    '4d7da694-8880-4514-ac3b-07896b2aaa52',
    'feaec278-7cdc-432a-a692-ad7749e1f9b7',
    '62659781-1b5e-4a27-a672-b88153c4bcf4',
    '23f7ff95-d73b-451d-a19f-b837a86a0e24',
    '3d8712cd-2f1e-4571-997c-7d984b9012eb'
  )
  GROUP BY p.user_id
) d
WHERE u.id = d.user_id;

-- ---------------------------------------------------------------------
-- 4. PARLAY LEGS — 5 legs, currently 'push'.
-- ---------------------------------------------------------------------
UPDATE parlay_legs l
SET status = CASE WHEN l.picked_team = g.winner THEN 'won' ELSE 'lost' END,
    updated_at = NOW()
FROM games g
WHERE g.id = l.game_id
  AND l.status = 'push'
  AND l.game_id IN (
    '62659781-1b5e-4a27-a672-b88153c4bcf4',
    '23f7ff95-d73b-451d-a19f-b837a86a0e24',
    '3d8712cd-2f1e-4571-997c-7d984b9012eb'
  );

-- ---------------------------------------------------------------------
-- 5. THE ONE PARLAY THAT CHANGES OUTCOME.
--
-- Four of the five parlays already contain a leg that lost on a DIFFERENT,
-- correctly-scored game, so they are settled lost at -10 and stay that way —
-- step 4 only fixes their leg label.
--
-- daluz's 2-leg parlay is the exception. It settled as a 1-leg win because
-- the Sharks leg pushed out of the multiplier. Both legs actually won:
--   2.14 x 1.8333 = 3.9233  ->  10 x 3.9233 - 10 = 29  (was 11, so +18)
-- ---------------------------------------------------------------------
UPDATE parlays
SET combined_multiplier = 3.9233,
    reward_points       = 29,
    points_earned       = 29,
    is_correct          = true,
    updated_at          = NOW()
WHERE id = 'ad04d1c4-df6e-4410-8655-d6b3357ec2d7';

UPDATE users
SET total_points = COALESCE(total_points, 0) + 18,   -- 29 - 11 already paid
    updated_at = NOW()
WHERE id = '24f2bcdc-1c5a-44f5-bddb-911f22cd3d47';   -- daluz

-- ---------------------------------------------------------------------
-- 6. SURVIVOR. Damian_11 picked Kennesaw State, which LOST, but the push
--    convention in survivorService ("winner === null -> treat as survived")
--    kept him alive in D1 Dreams.
--
--    lives_remaining was 1, so one loss eliminates. Week 1 of that league.
--    He has no future picks in this league, so there is nothing to clean up
--    that the normal elimination path would have deleted.
-- ---------------------------------------------------------------------
UPDATE survivor_picks
SET status = 'eliminated', updated_at = NOW()
WHERE id = '0de81b49-07d1-48dc-a508-957fc35aa48b';

UPDATE league_members
SET is_alive        = false,
    lives_remaining = 0,
    eliminated_week = 1
WHERE league_id = '7907fadf-d2e3-4b9a-b9d3-6f3bf7757f9f'
  AND user_id   = '44a4f1d8-da99-432f-8767-ab5586379ae8';

-- Remove the false "You survived Week 1" notice and replace it with the
-- truth. 'survivor_result' is the type the real elimination path uses.
DELETE FROM notifications
WHERE id = 'b77b9916-b374-4233-aca2-8440331ffdc7';

INSERT INTO notifications (user_id, type, message, metadata)
VALUES (
  '44a4f1d8-da99-432f-8767-ab5586379ae8',
  'survivor_result',
  'Correction: Kennesaw State lost 24-21, so your Week 1 pick in D1 Dreams--College Football Survivor did not survive. Sorry — we had the final score wrong.',
  '{"leagueId":"7907fadf-d2e3-4b9a-b9d3-6f3bf7757f9f"}'::jsonb
);

COMMIT;

-- ---------------------------------------------------------------------
-- 7. CONFIRM. Run after COMMIT.
-- ---------------------------------------------------------------------

-- a) No tied finals left in sports that cannot draw (the 2 MLB 0-0
--    postponed rows are expected and excluded above).
SELECT g.id, s.key, g.away_team, g.away_score, g.home_team, g.home_score, g.winner
FROM games g JOIN sports s ON s.id = g.sport_id
WHERE g.status = 'final' AND g.winner IS NULL
  AND s.key IN ('americanfootball_ncaaf','icehockey_nhl','baseball_mlb',
                'basketball_nba','basketball_ncaab','basketball_wnba','basketball_wncaab')
ORDER BY g.starts_at;
-- ^ expect only the 2 MLB 0-0 postponed rows.

-- b) Every repaired pick now has a verdict.
SELECT u.username, g.away_team, g.home_team, p.picked_team,
       g.winner, p.is_correct, p.points_earned
FROM picks p
JOIN games g ON g.id = p.game_id
JOIN users u ON u.id = p.user_id
WHERE p.game_id IN (
  '4d7da694-8880-4514-ac3b-07896b2aaa52','feaec278-7cdc-432a-a692-ad7749e1f9b7',
  '62659781-1b5e-4a27-a672-b88153c4bcf4','23f7ff95-d73b-451d-a19f-b837a86a0e24',
  '3d8712cd-2f1e-4571-997c-7d984b9012eb')
ORDER BY g.starts_at, u.username;
-- ^ expect 9 rows, is_correct never NULL.

-- c) No parlay leg still pushing on these games.
SELECT COUNT(*) AS legs_still_pushed FROM parlay_legs
WHERE status = 'push' AND game_id IN (
  '62659781-1b5e-4a27-a672-b88153c4bcf4','23f7ff95-d73b-451d-a19f-b837a86a0e24',
  '3d8712cd-2f1e-4571-997c-7d984b9012eb');
-- ^ expect 0.

-- d) Damian_11 is out of D1 Dreams; 12 of 14 alive.
SELECT u.username, m.is_alive, m.lives_remaining, m.eliminated_week
FROM league_members m JOIN users u ON u.id = m.user_id
WHERE m.league_id = '7907fadf-d2e3-4b9a-b9d3-6f3bf7757f9f'
ORDER BY m.is_alive DESC, u.username;

-- ---------------------------------------------------------------------
-- TO UNDO (scores only — pick/total repair is not reversible by this file):
--   UPDATE games SET winner = NULL, away_score = ..., home_score = ...
--   for each id above, using the ORIGINAL tied values in the header comment.
-- ---------------------------------------------------------------------
