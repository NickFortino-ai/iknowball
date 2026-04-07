-- Add championship week to fantasy settings (defaults to NFL Week 17;
-- commish can override to 18 since the NFL season is now 18 weeks).
ALTER TABLE fantasy_settings
  ADD COLUMN IF NOT EXISTS championship_week INTEGER DEFAULT 17;
