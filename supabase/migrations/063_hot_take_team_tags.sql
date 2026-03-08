-- Add team_tags array column to hot_takes
ALTER TABLE hot_takes ADD COLUMN team_tags TEXT[];

-- Migrate existing data from team_tag to team_tags
UPDATE hot_takes SET team_tags = ARRAY[team_tag] WHERE team_tag IS NOT NULL;

-- Drop old team_tag column
ALTER TABLE hot_takes DROP COLUMN team_tag;

-- Add GIN index for efficient @> (contains) queries
CREATE INDEX idx_hot_takes_team_tags ON hot_takes USING GIN (team_tags);
