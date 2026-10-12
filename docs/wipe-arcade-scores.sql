-- Clear the arcade and start fresh.
--
-- Every score on the board was set against a scoring system that has since
-- changed — memory ran at 10x before the /10 rescale, trivia had no per-
-- question clock, and streak did not exist for most of them. They are test
-- data wearing a leaderboard, and they sit permanently above anything
-- earned under the rules as they now stand.
--
-- As of 2026-10-11: 27 scores (14 memory, 5 trivia, 8 streak) and 30 rounds.

-- 1. LOOK FIRST.
SELECT s.game_key, s.variant, s.score, s.pairs, u.username, s.created_at
FROM arcade_scores s
JOIN users u ON u.id = s.user_id
ORDER BY s.game_key, s.score DESC;

-- 2. THE WIPE. Scores first: arcade_scores.round_id references
-- arcade_rounds, and while it is ON DELETE SET NULL (so the reverse order
-- would not error) it would leave scores pointing at nothing instead of
-- being removed.
DELETE FROM arcade_scores;
DELETE FROM arcade_rounds;

-- 3. OPTIONAL — the per-question stats.
--
-- times_served / times_correct are a CURATION signal, not a leaderboard:
-- they tell you which questions nobody ever gets right. 100 answers across
-- 68 questions have accumulated, almost all from testing by three people,
-- so the signal is thin either way.
--
-- Left in place by default. Wiping the boards is about whose name is on
-- them; this is about which questions are any good, and those are different
-- questions. Uncomment only if you want the question data clean too.
--
-- UPDATE trivia_questions SET times_served = 0, times_correct = 0;

-- 4. CONFIRM.
SELECT
  (SELECT COUNT(*) FROM arcade_scores) AS scores_left,
  (SELECT COUNT(*) FROM arcade_rounds) AS rounds_left;
