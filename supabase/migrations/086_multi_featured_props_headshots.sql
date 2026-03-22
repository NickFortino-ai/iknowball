-- Allow multiple featured props per day (drop unique constraint)
DROP INDEX IF EXISTS player_props_featured_date_key;
DROP INDEX IF EXISTS idx_player_props_featured_date;

-- Non-unique index for lookups
CREATE INDEX idx_player_props_featured_date ON player_props(featured_date) WHERE featured_date IS NOT NULL;

-- Add headshot URL column
ALTER TABLE player_props ADD COLUMN IF NOT EXISTS player_headshot_url TEXT;
