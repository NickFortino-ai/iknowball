-- Difficulty ranking for trivia questions, 1 (easiest) to 5 (hardest).
--
-- Two things depend on it:
--   - a round is dealt in ascending difficulty, so it opens with something
--     answerable and ends with the one worth bragging about
--   - harder questions are worth more, so a player who clears a 5 is not
--     level with one who cleared five 1s
--
-- Default 2 rather than 3: an unranked question is more likely to be ordinary
-- than hard, and over-rewarding an unranked batch is the worse error.
ALTER TABLE trivia_questions
  ADD COLUMN IF NOT EXISTS difficulty SMALLINT NOT NULL DEFAULT 2
  CHECK (difficulty BETWEEN 1 AND 5);

-- Serving reads published questions for a sport and orders by difficulty.
CREATE INDEX IF NOT EXISTS idx_trivia_questions_difficulty
  ON trivia_questions(status, sport, difficulty);
