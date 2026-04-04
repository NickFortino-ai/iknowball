-- Add sort_order to league_backdrops for controlling display order
ALTER TABLE league_backdrops ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- TD Survivor Pool backdrops (NFL all-time TD leaders)
INSERT INTO league_backdrops (filename, label, formats, sort_order) VALUES
  ('td-01-jerry-rice.webp', 'Jerry', '{"touchdown_survivor"}', 1),
  ('td-02-emmitt-smith.webp', 'Emmitt', '{"touchdown_survivor"}', 2),
  ('td-03-ladainian-tomlinson.webp', 'LaDainian', '{"touchdown_survivor"}', 3),
  ('td-04-randy-moss.webp', 'Randy', '{"touchdown_survivor"}', 4),
  ('td-05-terrell-owens.webp', 'Terrell', '{"touchdown_survivor"}', 5),
  ('td-06-marcus-allen.webp', 'Marcus', '{"touchdown_survivor"}', 6),
  ('td-07-marshall-faulk.webp', 'Marshall', '{"touchdown_survivor"}', 7),
  ('td-08-cris-carter.webp', 'Cris', '{"touchdown_survivor"}', 8),
  ('td-09-marvin-harrison.webp', 'Marvin', '{"touchdown_survivor"}', 9),
  ('td-10-derrick-henry.webp', 'Derrick', '{"touchdown_survivor"}', 10),
  ('td-11-jim-brown.webp', 'Jim', '{"touchdown_survivor"}', 11),
  ('td-12-adrian-peterson.webp', 'Adrian', '{"touchdown_survivor"}', 12),
  ('td-13-walter-payton.webp', 'Walter', '{"touchdown_survivor"}', 13),
  ('td-14-larry-fitzgerald.webp', 'Larry', '{"touchdown_survivor"}', 14)
ON CONFLICT (filename) DO UPDATE SET label = EXCLUDED.label, formats = EXCLUDED.formats, sort_order = EXCLUDED.sort_order;
