-- Add auto_connect preference to league_members
ALTER TABLE league_members ADD COLUMN auto_connect BOOLEAN DEFAULT true;
