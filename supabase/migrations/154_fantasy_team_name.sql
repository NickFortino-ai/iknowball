-- Allow traditional fantasy users to name their team.
-- Nullable — falls back to display_name when unset.
ALTER TABLE league_members ADD COLUMN IF NOT EXISTS fantasy_team_name TEXT;
