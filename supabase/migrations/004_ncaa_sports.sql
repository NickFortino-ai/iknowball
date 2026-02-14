-- Add NCAA Basketball and NCAA Football sports
INSERT INTO sports (key, name, active) VALUES
  ('basketball_ncaab', 'NCAAB', true),
  ('americanfootball_ncaaf', 'NCAAF', true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_sport_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_sport_check
  CHECK (sport IN ('americanfootball_nfl', 'basketball_nba', 'baseball_mlb',
                   'basketball_ncaab', 'americanfootball_ncaaf', 'all'));
