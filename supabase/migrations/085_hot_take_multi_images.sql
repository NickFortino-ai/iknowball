-- Add image_urls array column for multi-image hot takes
ALTER TABLE hot_takes ADD COLUMN IF NOT EXISTS image_urls TEXT[];

-- Migrate existing single image_url to image_urls array
UPDATE hot_takes SET image_urls = ARRAY[image_url] WHERE image_url IS NOT NULL AND image_urls IS NULL;
