-- Seed props_sport_visibility remote-config knob. Controls which sport
-- tiles show in the user-facing Props tab grid. Admin toggles from the
-- Config panel; changes propagate to clients within ~5 minutes.
--
-- Value shape: {sportKey: boolean}. Keys mirror the sport tabs on the
-- Picks page. Sports omitted from the object are treated as hidden.
-- Defaults reflect where The Odds API actually returns player props;
-- WC is off because soccer prop coverage is thin and inconsistent.
INSERT INTO app_config (key, value) VALUES
  ('props_sport_visibility',
   '{"nba": true, "wnba": true, "mlb": true, "nfl": true, "ncaaf": true, "ncaab": true, "wc": false, "ufl": false, "wncaab": false, "nhl": false, "mls": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
