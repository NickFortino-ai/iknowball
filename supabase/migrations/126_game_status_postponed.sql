-- Add 'postponed' as a valid game status (for rainouts, cancellations, suspensions)
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_status_check;
ALTER TABLE games ADD CONSTRAINT games_status_check
  CHECK (status IN ('upcoming', 'live', 'final', 'postponed'));
