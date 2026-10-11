-- Recall rate for memory rounds.
--
-- Score answers "how well did that round go". It does not answer "how good
-- is this person's memory", because it mixes in speed, board size and luck
-- on the cards you had never seen. This does:
--
--   The FIRST time it is possible to know where a pair is, did they know?
--
-- An OPPORTUNITY is the moment a player turns over a card whose partner has
-- already been revealed earlier in the round. At that instant the answer is
-- knowable — it is in their head or it isn't. A HIT is turning over that
-- partner next.
--
-- Only the first opportunity per pair counts. A second or third attempt at
-- the same pair measures persistence, not recall, and would let someone
-- grind their percentage up by failing repeatedly and eventually landing it.
--
-- Stored per round rather than as a running total so the figure can be
-- recomputed, sliced by difficulty, or charted over time.
ALTER TABLE arcade_scores
  ADD COLUMN IF NOT EXISTS recall_chances SMALLINT,
  ADD COLUMN IF NOT EXISTS recall_hits SMALLINT;

-- Nullable on purpose: rounds played before this shipped have no honest
-- value, and 0/0 would read as "never remembered anything".
COMMENT ON COLUMN arcade_scores.recall_chances IS
  'Memory: first-chance recall opportunities in the round. NULL for rounds played before this was tracked.';
COMMENT ON COLUMN arcade_scores.recall_hits IS
  'Memory: how many of those first chances the player took.';
