-- Add 'countered' status for counter-offered trades
ALTER TABLE fantasy_trades DROP CONSTRAINT IF EXISTS fantasy_trades_status_check;
ALTER TABLE fantasy_trades ADD CONSTRAINT fantasy_trades_status_check
  CHECK (status IN ('pending', 'pending_review', 'accepted', 'declined', 'countered', 'cancelled', 'vetoed'));
