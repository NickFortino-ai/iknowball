-- Add 'soccer_world_cup' as a recognized sport so leagues + bracket
-- templates can be created for the 2026 FIFA World Cup. ESPN's data
-- lives at site.api.espn.com/.../soccer/fifa.world (mapped in
-- server/src/services/espnService.js).

INSERT INTO sports (key, name, active) VALUES
  ('soccer_world_cup', 'World Cup', true)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_sport_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_sport_check
  CHECK (sport IN ('americanfootball_nfl', 'basketball_nba', 'baseball_mlb',
                   'basketball_ncaab', 'americanfootball_ncaaf',
                   'basketball_wnba', 'basketball_wncaab',
                   'icehockey_nhl', 'soccer_usa_mls',
                   'americanfootball_ufl', 'soccer_world_cup', 'all'));

ALTER TABLE bracket_templates DROP CONSTRAINT IF EXISTS bracket_templates_sport_check;
ALTER TABLE bracket_templates ADD CONSTRAINT bracket_templates_sport_check
  CHECK (sport IN ('americanfootball_nfl', 'basketball_nba', 'baseball_mlb',
                   'basketball_ncaab', 'americanfootball_ncaaf',
                   'basketball_wnba', 'basketball_wncaab',
                   'icehockey_nhl', 'soccer_usa_mls',
                   'americanfootball_ufl', 'soccer_world_cup'));
