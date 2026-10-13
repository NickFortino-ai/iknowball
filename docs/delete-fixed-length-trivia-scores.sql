-- Remove the fixed-length trivia scores.
--
-- Trivia is streak-only now: the 10 and 20 question rounds are gone from the
-- game screen, and the Trivia leaderboard reads the trivia_streak table. The
-- seven rows below were set under the old rules and can never gain another,
-- so they are a board nobody can play for.
--
-- Scope as of 2026-10-13: 7 arcade_scores rows and the 7 arcade_rounds that
-- produced them. Memory (10 scores / 11 rounds) and streak (46 scores / 49
-- rounds) are untouched.

-- 1. LOOK FIRST.
SELECT s.id, u.username, s.variant, s.score, s.pairs, s.created_at
FROM arcade_scores s
JOIN users u ON u.id = s.user_id
WHERE s.game_key = 'trivia'
ORDER BY s.score DESC;

-- 2. THE DELETE. Scores before rounds: arcade_scores.round_id references
-- arcade_rounds ON DELETE SET NULL, so the reverse order would not error —
-- it would just blank the link and leave the scores behind, which is the
-- opposite of the intent.
DELETE FROM arcade_scores WHERE game_key = 'trivia';
DELETE FROM arcade_rounds WHERE game_key = 'trivia';

-- NOTE the exact value: 'trivia', NOT 'trivia%'. A LIKE here would take
-- trivia_streak with it, which is every score the game still has.

-- 3. CONFIRM. Expect trivia 0, and memory/trivia_streak unchanged.
SELECT game_key, COUNT(*) AS scores FROM arcade_scores GROUP BY game_key ORDER BY game_key;
SELECT game_key, COUNT(*) AS rounds FROM arcade_rounds GROUP BY game_key ORDER BY game_key;
