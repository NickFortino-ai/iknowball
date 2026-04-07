-- Track when a draft transitions to in_progress so the autopick tick loop
-- can compute the first pick's deadline (before any picks have been made).
ALTER TABLE fantasy_settings
  ADD COLUMN IF NOT EXISTS draft_started_at TIMESTAMPTZ;
