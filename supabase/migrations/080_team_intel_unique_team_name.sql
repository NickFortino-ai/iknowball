-- Fix: upsert conflict was on espn_team_id but queries use team_name,
-- allowing stale duplicate rows with wrong team data.
-- Switch unique constraint to team_name (which is the query key).

-- Clear cached data (repopulates within 30 min via sync job)
TRUNCATE team_intel;

-- Swap unique constraint from espn_team_id to team_name
ALTER TABLE team_intel DROP CONSTRAINT IF EXISTS team_intel_sport_key_espn_team_id_key;
ALTER TABLE team_intel ADD CONSTRAINT team_intel_sport_key_team_name_key UNIQUE(sport_key, team_name);
