-- Remove two of mossyou's Jameis Winston pass-yards prop picks.
--
-- He holds EIGHT overs on the same player and market, a ladder from 145.5
-- up to 250.5. This drops the top two rungs only:
--
--   over 250.5   risk 10 -> reward 19   id a485f549-...
--   over 175.5   risk 10 -> reward  5   id 30e3c9d8-...
--
-- The other six (145.5, 150.5, 155.5, 160.5, 165.5, 170.5) are untouched.
--
-- NO POINTS MOVE. Both are status='locked' with points_earned NULL — a prop
-- pick is only ever credited or debited at settlement, and NO @ NYG is still
-- live with actual_value NULL. mossyou stays on 128.
--
-- Nothing is attached to either row: zero comments, and prop picks are not a
-- comment or reaction target type at all (those are pick / parlay / hot_take
-- / record_history / head_to_head / streak_event / futures_pick /
-- hot_take_reminder). So there is nothing to orphan or cascade.
--
-- Targeted by primary key rather than by player + line, so this cannot reach
-- another user's identical pick or a future re-created row at the same line.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. LOOK FIRST — expect exactly 2 rows, both mossyou, both locked.
-- ---------------------------------------------------------------------
SELECT pp.id,
       u.username,
       pr.player_name,
       pr.market_key,
       pp.picked_side,
       COALESCE(pp.chosen_line, pr.line) AS line,
       pp.status,
       pp.points_earned,
       pp.risk_at_submission,
       pp.reward_at_submission
FROM prop_picks pp
JOIN users u        ON u.id = pp.user_id
JOIN player_props pr ON pr.id = pp.prop_id
WHERE pp.id IN (
  'a485f549-15f3-431c-b7ed-e0ab12b31b3d',   -- over 250.5
  '30e3c9d8-9055-468f-bab3-8c7662cc192e'    -- over 175.5
);

-- ---------------------------------------------------------------------
-- 2. THE DELETE.
--
-- The status guard is the safety net: if either pick has settled between
-- the check above and this statement, it will NOT be removed, because
-- deleting a settled pick would silently strand points already applied to
-- the user's total. The confirm below will show it as still present.
-- ---------------------------------------------------------------------
-- Kept on ONE line with no inline comments. Pasted multi-line with a
-- trailing `-- over 250.5` style comment, a collapsed newline makes the
-- comment swallow the rest of the statement, and a dropped line turns this
-- into `DELETE` followed by `WHERE` — which is exactly how it failed the
-- first time it was run.
DELETE FROM prop_picks WHERE id IN ('a485f549-15f3-431c-b7ed-e0ab12b31b3d', '30e3c9d8-9055-468f-bab3-8c7662cc192e') AND status = 'locked';

COMMIT;

-- ---------------------------------------------------------------------
-- 3. CONFIRM. Run after COMMIT.
-- ---------------------------------------------------------------------

-- a) Both gone — expect 0.
SELECT COUNT(*) AS still_present
FROM prop_picks
WHERE id IN (
  'a485f549-15f3-431c-b7ed-e0ab12b31b3d',
  '30e3c9d8-9055-468f-bab3-8c7662cc192e'
);

-- b) His remaining Winston ladder — expect 6 rows:
--    145.5, 150.5, 155.5, 160.5, 165.5, 170.5
SELECT COALESCE(pp.chosen_line, pr.line) AS line, pp.picked_side, pp.status
FROM prop_picks pp
JOIN player_props pr ON pr.id = pp.prop_id
JOIN users u         ON u.id = pp.user_id
WHERE u.username = 'mossyou'
  AND pr.player_name = 'Jameis Winston'
  AND pr.market_key = 'player_pass_yds'
ORDER BY line DESC;

-- c) Total unchanged — expect 128.
SELECT username, total_points FROM users WHERE username = 'mossyou';
