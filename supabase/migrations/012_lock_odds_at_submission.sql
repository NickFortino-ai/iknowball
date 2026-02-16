-- Add submission-time odds columns to picks and prop_picks.
-- These capture the odds at the moment the user submits their pick,
-- enabling leagues to choose between submission-time and game-start odds.
-- Nullable because existing picks predate this feature.

ALTER TABLE picks
  ADD COLUMN odds_at_submission    INTEGER,
  ADD COLUMN risk_at_submission    INTEGER,
  ADD COLUMN reward_at_submission  INTEGER;

ALTER TABLE prop_picks
  ADD COLUMN odds_at_submission    INTEGER,
  ADD COLUMN risk_at_submission    INTEGER,
  ADD COLUMN reward_at_submission  INTEGER;
