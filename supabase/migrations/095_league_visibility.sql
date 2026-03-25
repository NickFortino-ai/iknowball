-- Add visibility (open/closed) and join lock deadline to leagues
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'closed' CHECK (visibility IN ('open', 'closed'));
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS joins_locked_at TIMESTAMPTZ;

CREATE INDEX idx_leagues_open ON leagues(visibility, status) WHERE visibility = 'open';
