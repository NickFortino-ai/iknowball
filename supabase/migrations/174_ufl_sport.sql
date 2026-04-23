-- Add UFL sport
INSERT INTO sports (key, name, active) VALUES
  ('americanfootball_ufl', 'UFL', true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_sport_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_sport_check
  CHECK (sport IN ('americanfootball_nfl', 'basketball_nba', 'baseball_mlb',
                   'basketball_ncaab', 'americanfootball_ncaaf',
                   'basketball_wnba', 'basketball_wncaab',
                   'icehockey_nhl', 'soccer_usa_mls',
                   'americanfootball_ufl', 'all'));

ALTER TABLE bracket_templates DROP CONSTRAINT IF EXISTS bracket_templates_sport_check;
ALTER TABLE bracket_templates ADD CONSTRAINT bracket_templates_sport_check
  CHECK (sport IN ('americanfootball_nfl', 'basketball_nba', 'baseball_mlb',
                   'basketball_ncaab', 'americanfootball_ncaaf',
                   'basketball_wnba', 'basketball_wncaab',
                   'icehockey_nhl', 'soccer_usa_mls',
                   'americanfootball_ufl'));
