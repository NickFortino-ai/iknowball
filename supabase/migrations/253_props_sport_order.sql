-- Seed props_sport_order for the Props tab tile grid. Independent of
-- props_sport_visibility (in migration 252) so admins can reorder
-- without losing visibility settings and vice versa. Client applies both:
-- iterate the order array, filter to visible sports, render.
INSERT INTO app_config (key, value) VALUES
  ('props_sport_order',
   '["nba", "wnba", "mlb", "nfl", "ncaaf", "ncaab", "wncaab", "nhl", "ufl", "mls", "wc"]'::jsonb)
ON CONFLICT (key) DO NOTHING;
