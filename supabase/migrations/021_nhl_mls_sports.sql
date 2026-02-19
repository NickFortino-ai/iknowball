-- Add NHL and MLS sports
INSERT INTO sports (key, name, active) VALUES
  ('icehockey_nhl', 'NHL', true),
  ('soccer_usa_mls', 'MLS', true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_sport_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_sport_check
  CHECK (sport IN ('americanfootball_nfl', 'basketball_nba', 'baseball_mlb',
                   'basketball_ncaab', 'americanfootball_ncaaf',
                   'basketball_wnba', 'basketball_wncaab',
                   'icehockey_nhl', 'soccer_usa_mls', 'all'));

ALTER TABLE bracket_templates DROP CONSTRAINT IF EXISTS bracket_templates_sport_check;
ALTER TABLE bracket_templates ADD CONSTRAINT bracket_templates_sport_check
  CHECK (sport IN ('americanfootball_nfl', 'basketball_nba', 'baseball_mlb',
                   'basketball_ncaab', 'americanfootball_ncaaf',
                   'basketball_wnba', 'basketball_wncaab',
                   'icehockey_nhl', 'soccer_usa_mls'));
