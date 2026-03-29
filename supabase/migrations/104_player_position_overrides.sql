CREATE TABLE IF NOT EXISTS player_position_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL,
  position TEXT NOT NULL,
  sport_key TEXT NOT NULL DEFAULT 'basketball_nba',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_name, sport_key)
);

ALTER TABLE player_position_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage position overrides" ON player_position_overrides FOR ALL TO authenticated USING (true);
