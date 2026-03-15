-- Team intel: starting lineups + injury data from ESPN depth charts
CREATE TABLE IF NOT EXISTS team_intel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_key TEXT NOT NULL,
  team_name TEXT NOT NULL,
  espn_team_id TEXT NOT NULL,
  starters JSONB DEFAULT '[]'::jsonb,
  injuries JSONB DEFAULT '[]'::jsonb,
  notable_injury_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sport_key, espn_team_id)
);

CREATE INDEX idx_team_intel_lookup ON team_intel(team_name, sport_key);

ALTER TABLE team_intel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team intel is viewable by authenticated users"
  ON team_intel FOR SELECT TO authenticated USING (true);
