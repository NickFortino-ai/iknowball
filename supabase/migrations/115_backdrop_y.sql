-- Add backdrop vertical position offset for custom image positioning
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS backdrop_y SMALLINT DEFAULT 50;
