-- Add sort_order to league_backdrops for controlling display order
ALTER TABLE league_backdrops ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- TD Survivor Pool backdrops (NFL all-time TD leaders)
INSERT INTO league_backdrops (filename, label, formats, sort_order) VALUES
  ('td-01-jerry-rice.webp', 'Jerry', '{"americanfootball_nfl"}', 1),
  ('td-02-emmitt-smith.webp', 'Emmitt', '{"americanfootball_nfl"}', 2),
  ('td-03-ladainian-tomlinson.webp', 'LaDainian', '{"americanfootball_nfl"}', 3),
  ('td-04-randy-moss.webp', 'Randy', '{"americanfootball_nfl"}', 4),
  ('td-05-terrell-owens.webp', 'Terrell', '{"americanfootball_nfl"}', 5),
  ('td-06-marcus-allen.webp', 'Marcus', '{"americanfootball_nfl"}', 6),
  ('td-07-marshall-faulk.webp', 'Marshall', '{"americanfootball_nfl"}', 7),
  ('td-08-cris-carter.webp', 'Cris', '{"americanfootball_nfl"}', 8),
  ('td-09-marvin-harrison.webp', 'Marvin', '{"americanfootball_nfl"}', 9),
  ('td-10-derrick-henry.webp', 'Derrick', '{"americanfootball_nfl"}', 10),
  ('td-11-jim-brown.webp', 'Jim', '{"americanfootball_nfl"}', 11),
  ('td-12-adrian-peterson.webp', 'Adrian', '{"americanfootball_nfl"}', 12),
  ('td-13-walter-payton.webp', 'Walter', '{"americanfootball_nfl"}', 13),
  ('td-14-larry-fitzgerald.webp', 'Larry', '{"americanfootball_nfl"}', 14)
ON CONFLICT (filename) DO UPDATE SET label = EXCLUDED.label, formats = EXCLUDED.formats, sort_order = EXCLUDED.sort_order;
