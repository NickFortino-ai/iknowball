-- Optional rationale a commissioner can attach when vetoing a trade.
-- Surfaced on the trade history card so members understand the call.
ALTER TABLE fantasy_trades ADD COLUMN IF NOT EXISTS veto_reason TEXT;
