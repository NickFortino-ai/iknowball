-- Add custom team name columns to squares_boards
ALTER TABLE squares_boards
  ADD COLUMN IF NOT EXISTS row_team_name TEXT NOT NULL DEFAULT 'Away',
  ADD COLUMN IF NOT EXISTS col_team_name TEXT NOT NULL DEFAULT 'Home';
