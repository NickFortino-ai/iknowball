-- Track WHICH week's standings the league's waiver priority was computed from.
--
-- Priority is reverse standings: worst record picks first. Until now it was
-- recomputed inside rolloverFantasyWeek, which only fires when Sleeper
-- advances the NFL week -- Tuesday morning. That left the number visibly
-- stale for the whole weekend: a manager sitting 4th on Monday night still
-- saw the priority his week-1 record earned him.
--
-- The recompute now fires as soon as the week's last game goes final
-- (Monday ~midnight ET), which is the moment standings stop moving. That
-- needs a fire-ONCE marker: the check runs hourly, and re-running it after
-- Wednesday's waiver batch would wipe the "winner drops to the back" roll
-- that the batch just applied.
--
-- Semantics: waiver_priority_week = the last week INCLUDED in the standings
-- that produced the current order. After week 2 goes final it reads 2, and
-- both the finalize path and the Tuesday rollover (which computes
-- sleeperWeek - 1) agree on that number, so whichever runs first wins and
-- the other is a no-op.
--
-- NULL means "never computed from standings" -- either a league that predates
-- this column or one still on its reverse-draft-order seed. Both are treated
-- as behind, so the next completed week brings them into line.

ALTER TABLE fantasy_settings ADD COLUMN IF NOT EXISTS waiver_priority_week INTEGER;

COMMENT ON COLUMN fantasy_settings.waiver_priority_week IS
  'Last week whose standings were used to reset waiver priority. NULL = never.';
