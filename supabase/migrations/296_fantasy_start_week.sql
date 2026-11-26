-- A salary cap league created mid-season is pinned to Week 1 and can never be joined.
--
-- Nick created "Testing Strategies" (full_season salary cap) on 2026-11-26,
-- inside NFL Week 12, to run for the rest of the season. Accepting the
-- invitation from a second account failed with:
--
--   This league is no longer accepting new members — Week 1 is over
--
-- The join gate (leagueService.isSalaryCapJoinOpen) is correct in principle:
-- joining DURING the starting week is fine, but once that week is over the
-- league closes, because season standings are cumulative and a late joiner
-- can never catch up. The bug is in what it believes the starting week IS.
-- Five call sites independently derive it as `single_week || 1`, so a
-- full-season league has no way to say anything but Week 1 — which was true
-- for every salary cap league ever created until one was created in November.
--
-- The same stale 1 also reached:
--   - salaryCapWeekStart() -> the league's effective starts_at (shows the
--     September opener as the start of a league that begins this week)
--   - completeLeagues' activation gate
--   - fantasy_settings.current_week, which createFantasySettings never set at
--     all. It sat at the DB default of 1 until the 3 AM rollover job caught
--     it, so a brand-new league showed "Week 1" and served Week 1's roster
--     pool — every player in it already locked — for its first several hours.
--
-- start_week records the week the league was created in, resolved from
-- getCurrentNflWeek() at that moment (the same clock current_week rollover
-- follows) rather than re-derived later from created_at, which would mean
-- game_date/starts_at arithmetic — see [[game_date is ET, starts_at is UTC]].
--
-- NULL means "created before this column existed", and every reader falls
-- back to 1 for it. That is correct for all of them: the only pre-existing
-- NFL salary cap league, "Salary and Peanut Butter", was created 2026-08-03
-- in the preseason and genuinely does start at Week 1.

ALTER TABLE fantasy_settings
  ADD COLUMN IF NOT EXISTS start_week smallint;

COMMENT ON COLUMN fantasy_settings.start_week IS
  'NFL week this salary cap league began, captured at creation. NULL = Week 1 (every league created preseason). Readers use single_week || start_week || 1.';

-- Backfill the two NFL salary cap leagues that were created mid-season and
-- are therefore currently unjoinable. Both are full_season, so neither has a
-- single_week to fall back on.
--
--   Ultimate NFL Fantasy League  created 2026-11-17  -> Week 11
--   Testing Strategies           created 2026-11-26  -> Week 12
--
-- Ultimate NFL is keyed by id, not name: the stored name carries a trailing
-- space ('Ultimate NFL Fantasy League '), so an equality match on the name
-- updates zero rows and reports success.
--
-- Testing Strategies also still has current_week = 1 (created after today's
-- rollover ran); set it so the league stops showing Week 1 and serving Week
-- 1's locked player pool. Ultimate NFL is already at 12.
UPDATE fantasy_settings
   SET start_week = 11
 WHERE league_id = '3c7254e0-76ce-4cd8-933a-55602e0ddf64'
   AND format = 'salary_cap';

UPDATE fantasy_settings fs
   SET start_week = 12,
       current_week = 12
  FROM leagues l
 WHERE l.id = fs.league_id
   AND l.name = 'Testing Strategies'
   AND l.format = 'fantasy'
   AND fs.format = 'salary_cap';

-- Verify: the three NFL salary cap leagues and the week each now starts on.
-- Expect Salary and Peanut Butter NULL (-> Week 1), Ultimate NFL 11,
-- Testing Strategies 12.
SELECT l.name,
       l.created_at::date AS created,
       fs.season_type,
       fs.single_week,
       fs.start_week,
       fs.current_week,
       COALESCE(fs.single_week, fs.start_week, 1) AS target_week
  FROM fantasy_settings fs
  JOIN leagues l ON l.id = fs.league_id
 WHERE fs.format = 'salary_cap'
   AND l.format = 'fantasy'
 ORDER BY l.created_at;
