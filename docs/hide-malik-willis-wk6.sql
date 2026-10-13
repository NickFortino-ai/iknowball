-- Re-hide Malik Willis for NFL week 6, 2026 — Miami is on bye.
--
-- Shown by hand at 05:09 on 2026-10-13 while pricing QBs. The week 6 batch
-- is still published = false, so nothing reached a user; this is a draft
-- correction, not an incident.
--
-- Week 6 byes: CIN, DET, MIA, MIN. A sweep of all 893 week-6 salary rows
-- found Willis to be the ONLY visible player on a bye team, so this is the
-- one row that needs touching.

-- 1. LOOK FIRST.
SELECT s.id, p.full_name, p.team, p.position,
       s.salary, s.algorithm_salary, s.manually_set, s.hidden, s.published
FROM dfs_weekly_salaries s
JOIN nfl_players p ON p.id = s.player_id
WHERE s.season = 2026 AND s.nfl_week = 6 AND s.player_id = '8161';

-- 2. THE FIX. Targeted by row id rather than by player so it cannot reach
-- another week's pricing if this is ever re-run.
UPDATE dfs_weekly_salaries
SET hidden = true, updated_at = NOW()
WHERE id = '130739f7-5fd2-4236-a296-49b1b0c779a6';

-- 3. OPTIONAL — also drop the hand-set price.
--
-- He was priced at $7,200 against an algorithm value of $5,500. While
-- hidden the number is inert, and the row is week-scoped so it will never
-- be reused. Left alone by default: if Miami's bye were ever corrected in
-- the schedule and he came back into the pool, the considered price is
-- better to keep than to throw away.
--
-- UPDATE dfs_weekly_salaries
-- SET salary = algorithm_salary, manually_set = false, updated_at = NOW()
-- WHERE id = '130739f7-5fd2-4236-a296-49b1b0c779a6';

-- 4. CONFIRM — expects zero rows.
SELECT p.full_name, p.team, s.salary, s.hidden
FROM dfs_weekly_salaries s
JOIN nfl_players p ON p.id = s.player_id
JOIN (
  SELECT DISTINCT team FROM nfl_players WHERE team IS NOT NULL
  EXCEPT
  SELECT home_team FROM nfl_schedule WHERE season = 2026 AND week = 6
  EXCEPT
  SELECT away_team FROM nfl_schedule WHERE season = 2026 AND week = 6
) bye ON bye.team = p.team
WHERE s.season = 2026 AND s.nfl_week = 6 AND s.hidden = false;

-- ---------------------------------------------------------------------
-- REUSABLE: run this before publishing ANY week's salaries.
--
-- Returns every visible player whose team has no game that week. Change
-- the two week numbers and the season. Should always come back empty —
-- a pool that offers a player who cannot score is a trap for whoever
-- picks him, and the cap spend is wasted.
-- ---------------------------------------------------------------------
-- SELECT p.full_name, p.team, p.position, s.salary, s.manually_set
-- FROM dfs_weekly_salaries s
-- JOIN nfl_players p ON p.id = s.player_id
-- WHERE s.season = 2026 AND s.nfl_week = <WEEK> AND s.hidden = false
--   AND p.team NOT IN (
--     SELECT home_team FROM nfl_schedule WHERE season = 2026 AND week = <WEEK>
--     UNION
--     SELECT away_team FROM nfl_schedule WHERE season = 2026 AND week = <WEEK>
--   )
-- ORDER BY s.salary DESC;
