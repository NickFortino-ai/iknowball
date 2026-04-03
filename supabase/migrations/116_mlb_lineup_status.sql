-- Add lineup status tracking for MLB DFS (confirmed starters, not starting)
ALTER TABLE mlb_dfs_salaries ADD COLUMN IF NOT EXISTS lineup_status TEXT;
