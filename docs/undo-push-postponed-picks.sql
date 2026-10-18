-- UNDO docs/push-postponed-picks.sql.
--
-- WHAT WENT WRONG: pushing those 36 picks was the right DATA outcome, but it
-- made them appear in every affected user's Results page, as 36 old cards
-- reading "Game postponed — pick will settle when rescheduled" in alarming
-- yellow. That copy is also now false — they HAD settled.
--
-- WHY IT SURFACED THEM, which I missed when I wrote the push:
-- ResultsPage.jsx:177 builds `olderSettledPicks` from
--     allPicks.filter(p => p.status === 'settled' && ...)
-- and `allPicks` itself (line 164) only admits 'locked' or 'settled'. So
-- before the push these were invisible on Results — the 'pending' ones were
-- excluded outright, and the 'locked' ones failed the settled check. Settling
-- them is exactly what moved them INTO the page. The cards render from
-- GameCard's `isPostponed` branch, which ignores pick status entirely, so
-- they arrived wearing the stale postponed banner.
--
-- SCOPE: every row the push touched shares one updated_at timestamp, so this
-- targets precisely those 36 and nothing else. No other pick can be caught.
--
-- POINTS: none move. A push awarded 0, so reverting takes 0 away.
--
-- ONE DELIBERATE IMPRECISION: the push flattened 9 'locked' and 27 'pending'
-- picks into 'settled', and the original split is not recoverable from the
-- row (risk_points IS NULL is a decent proxy — it is written at lock time —
-- but it reports 25/11, not 27/9, so it is wrong on two). This restores all
-- 36 to 'locked' rather than guessing.
--
-- 'locked' is the better of the two anyway: a 'pending' pick on a game that
-- started months ago is itself the anomaly lockPicks was supposed to prevent,
-- and leaving them 'pending' invites lockPicks to churn them. Both states are
-- unsettled, both are invisible on Results for a game this old, and
-- scoreCompletedGame accepts either (`.in('status', ['locked','pending'])`),
-- so nothing downstream can tell the difference.
--
-- AFTER THIS: the picks are unsettled again, which is the original bug — they
-- will never settle on their own. That is a known, quiet state. Re-run
-- push-postponed-picks.sql once the GameCard fix has shipped in a build, and
-- they will settle AND render correctly as pushes.

BEGIN;

-- ---------------------------------------------------------------------
-- 0. LOOK FIRST — expect exactly 36.
-- ---------------------------------------------------------------------
SELECT COUNT(*) AS will_revert
FROM picks
WHERE updated_at = '2026-10-17T05:11:29.457536+00:00'
  AND status = 'settled'
  AND is_correct IS NULL
  AND points_earned = 0;

-- ---------------------------------------------------------------------
-- 1. THE REVERT.
-- ---------------------------------------------------------------------
UPDATE picks
SET status        = 'locked',
    is_correct    = NULL,
    points_earned = NULL,
    updated_at    = NOW()
WHERE updated_at = '2026-10-17T05:11:29.457536+00:00'
  AND status = 'settled'
  AND is_correct IS NULL
  AND points_earned = 0;

COMMIT;

-- ---------------------------------------------------------------------
-- 2. CONFIRM. Run after COMMIT.
-- ---------------------------------------------------------------------

-- a) Nothing settled left sitting on a postponed game.
SELECT COUNT(*) AS settled_on_postponed
FROM picks p JOIN games g ON g.id = p.game_id
WHERE g.status = 'postponed' AND p.status = 'settled';
-- ^ expect 0. Results pages go back to how they looked yesterday.

-- b) The 36 are unsettled again.
SELECT COUNT(*) AS unsettled_on_postponed
FROM picks p JOIN games g ON g.id = p.game_id
WHERE g.status = 'postponed' AND p.status IN ('locked','pending');
-- ^ expect 36.

-- c) Nobody's total moved. mossyou should still read 97.
SELECT username, total_points FROM users WHERE username = 'mossyou';
