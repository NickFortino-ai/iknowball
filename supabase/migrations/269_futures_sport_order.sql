-- Seed the futures_sport_order app_config knob. Client FuturesSection
-- reads this to decide which sport groups render first. Independent of
-- futures_markets, so admin can rearrange without touching markets.
-- Falls back to the client-side default if the row is missing.
INSERT INTO app_config (key, value) VALUES
  ('futures_sport_order',
   '["americanfootball_nfl", "basketball_nba", "basketball_wnba", "baseball_mlb", "icehockey_nhl", "americanfootball_ncaaf", "basketball_ncaab", "americanfootball_ufl", "americanfootball_nfl_preseason"]'::jsonb)
ON CONFLICT (key) DO NOTHING;
