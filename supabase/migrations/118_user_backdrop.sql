-- User profile backdrop (same pattern as league backdrops)
ALTER TABLE users ADD COLUMN IF NOT EXISTS backdrop_image TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS backdrop_y SMALLINT DEFAULT 50;
