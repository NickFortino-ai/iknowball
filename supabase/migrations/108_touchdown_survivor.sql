-- Add player columns to survivor_picks for touchdown survivor mode
ALTER TABLE survivor_picks ADD COLUMN IF NOT EXISTS player_id TEXT;
ALTER TABLE survivor_picks ADD COLUMN IF NOT EXISTS player_name TEXT;

-- Make game_id and picked_team nullable (not needed for touchdown picks)
ALTER TABLE survivor_picks ALTER COLUMN game_id DROP NOT NULL;
ALTER TABLE survivor_picks ALTER COLUMN picked_team DROP NOT NULL;

-- Drop the CHECK constraint on picked_team to allow NULL
ALTER TABLE survivor_picks DROP CONSTRAINT IF EXISTS survivor_picks_picked_team_check;
ALTER TABLE survivor_picks ADD CONSTRAINT survivor_picks_picked_team_check
  CHECK (picked_team IS NULL OR picked_team IN ('home', 'away'));
