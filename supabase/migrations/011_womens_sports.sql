-- Add WNBA and NCAA Women's Basketball sports
INSERT INTO sports (key, name, active) VALUES
  ('basketball_wnba', 'WNBA', true),
  ('basketball_wncaab', 'WNCAAB', true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_sport_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_sport_check
  CHECK (sport IN ('americanfootball_nfl', 'basketball_nba', 'baseball_mlb',
                   'basketball_ncaab', 'americanfootball_ncaaf',
                   'basketball_wnba', 'basketball_wncaab', 'all'));

ALTER TABLE bracket_templates DROP CONSTRAINT IF EXISTS bracket_templates_sport_check;
ALTER TABLE bracket_templates ADD CONSTRAINT bracket_templates_sport_check
  CHECK (sport IN ('americanfootball_nfl', 'basketball_nba', 'baseball_mlb',
                   'basketball_ncaab', 'americanfootball_ncaaf',
                   'basketball_wnba', 'basketball_wncaab'));
