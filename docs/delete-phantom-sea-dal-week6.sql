-- Remove a week-6 game that does not exist.
--
-- nfl_schedule holds 273 rows for 2026; Sleeper's schedule feed has 272.
-- The extra is "SEA @ DAL" on 2026-10-15. Seattle plays DENVER that day and
-- Dallas plays Green Bay on the 18th, both of which we also hold correctly —
-- so SEA and DAL each appear twice in week 6 and Sam Darnold's game log
-- showed two week-6 opponents.
--
-- WHY IT SURVIVED: syncNflSchedule upserts on (season, week, home_team) and
-- never deletes. When a matchup's HOME team changes, the new row lands under
-- a different conflict key and the old one is orphaned rather than replaced.
-- The row was written 2026-06-23 with the rest of the season.
--
-- This is the only orphan in the 2026 season — checked row by row against
-- the live feed, not spot-checked.

-- 1. LOOK FIRST. Expect two rows; the DAL one is the ghost.
SELECT id, week, game_date, away_team, home_team, status
FROM nfl_schedule
WHERE season = 2026 AND week = 6
  AND (home_team = 'SEA' OR away_team = 'SEA')
ORDER BY home_team;

-- 2. THE DELETE. By id, so it cannot reach the real SEA @ DEN row.
DELETE FROM nfl_schedule
WHERE id = '1c5fca66-4783-43cb-b9bd-7979f4dc1ee1';

-- 3. CONFIRM — expect 14 rows, and SEA/DAL once each.
SELECT COUNT(*) AS week6_games FROM nfl_schedule WHERE season = 2026 AND week = 6;

SELECT team, COUNT(*) AS appearances FROM (
  SELECT home_team AS team FROM nfl_schedule WHERE season = 2026 AND week = 6
  UNION ALL
  SELECT away_team AS team FROM nfl_schedule WHERE season = 2026 AND week = 6
) t
GROUP BY team HAVING COUNT(*) > 1;
-- ^ should return no rows.
