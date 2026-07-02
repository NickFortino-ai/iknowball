-- Final placement rank for fantasy league members, set when the league
-- completes via finalizeFantasyChampion. Ordered 1..N:
--   1st = playoff champion
--   2nd = championship runner-up
--   3rd/4th = consolation final winner/loser
--   5th/6th (6-team) = wild-card losers game outcome
--   5th/6th (8-team) = 5th-place game outcome
--   7th/8th (8-team) = consolation R1 losers, ordered by total points
--   Non-playoff teams = ordered by regular-season wins → PF tiebreak,
--     filling positions after the playoff finishers
--
-- Used by getFantasyStandings to render completed leagues in true
-- final order (championship-aware), independent of the wins-DESC sort
-- that regular-season standings use.

ALTER TABLE league_members
  ADD COLUMN IF NOT EXISTS final_rank INTEGER;
