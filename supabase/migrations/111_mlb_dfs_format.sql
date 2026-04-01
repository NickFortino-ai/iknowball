ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_format_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_format_check
  CHECK (format IN ('pickem', 'survivor', 'squares', 'bracket', 'fantasy', 'nba_dfs', 'mlb_dfs', 'hr_derby'));
