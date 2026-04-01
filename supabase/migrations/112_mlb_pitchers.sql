-- Add pitcher stats columns to mlb_dfs_player_stats
ALTER TABLE mlb_dfs_player_stats ADD COLUMN IF NOT EXISTS is_pitcher BOOLEAN DEFAULT false;
ALTER TABLE mlb_dfs_player_stats ADD COLUMN IF NOT EXISTS innings_pitched NUMERIC DEFAULT 0;
ALTER TABLE mlb_dfs_player_stats ADD COLUMN IF NOT EXISTS hits_allowed INTEGER DEFAULT 0;
ALTER TABLE mlb_dfs_player_stats ADD COLUMN IF NOT EXISTS earned_runs INTEGER DEFAULT 0;
ALTER TABLE mlb_dfs_player_stats ADD COLUMN IF NOT EXISTS wins INTEGER DEFAULT 0;
ALTER TABLE mlb_dfs_player_stats ADD COLUMN IF NOT EXISTS losses INTEGER DEFAULT 0;
ALTER TABLE mlb_dfs_player_stats ADD COLUMN IF NOT EXISTS saves INTEGER DEFAULT 0;

-- Add SP to roster slots constraint
ALTER TABLE mlb_dfs_roster_slots DROP CONSTRAINT IF EXISTS mlb_dfs_roster_slots_roster_slot_check;
ALTER TABLE mlb_dfs_roster_slots ADD CONSTRAINT mlb_dfs_roster_slots_roster_slot_check
  CHECK (roster_slot IN ('C', '1B', '2B', 'SS', '3B', 'OF1', 'OF2', 'OF3', 'UTIL', 'SP'));
