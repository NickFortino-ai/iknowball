INSERT INTO league_backdrops (filename, label, formats) VALUES
  ('mlb-dodger.webp', 'Dodger Stadium', '{baseball_mlb}'),
  ('mlb-fenway.webp', 'Fenway Park', '{baseball_mlb}'),
  ('mlb-neighborhood-sandlot.webp', 'Neighborhood Sandlot', '{baseball_mlb}'),
  ('mlb-oracle.webp', 'Oracle Park', '{baseball_mlb}'),
  ('mlb-wrigley.webp', 'Wrigley Field', '{baseball_mlb}')
ON CONFLICT (filename) DO NOTHING;
