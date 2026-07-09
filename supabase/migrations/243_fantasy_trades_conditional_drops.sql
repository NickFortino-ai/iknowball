-- Persist per-side conditional drops on a trade so they survive the
-- propose → accept → commissioner-review → approve journey.
--
-- Proposer drops: locked in at propose time when the trade would push the
-- proposer over their roster cap (e.g. 1-for-2 requires 1 proposer drop
-- since the proposer nets +1). Executed only if the trade is approved.
--
-- Receiver drops: locked in at accept time when the trade would push the
-- receiver over their roster cap. Prior code accepted them but silently
-- discarded them when going to pending_review, so approve time hit the
-- defensive over-cap check and errored.
ALTER TABLE fantasy_trades
  ADD COLUMN IF NOT EXISTS proposer_drop_player_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS receiver_drop_player_ids text[] NOT NULL DEFAULT '{}';
