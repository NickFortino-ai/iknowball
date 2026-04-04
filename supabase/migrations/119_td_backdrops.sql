-- Add sort_order to league_backdrops for controlling display order
ALTER TABLE league_backdrops ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- TD Survivor Pool backdrops (NFL all-time TD leaders)
INSERT INTO league_backdrops (filename, label, formats, sort_order) VALUES
  ('td-01-jerry-rice.webp', 'Jerry Rice', '{"americanfootball_nfl"}', 1),
  ('td-02-emmitt-smith.webp', 'Emmitt Smith', '{"americanfootball_nfl"}', 2),
  ('td-03-ladainian-tomlinson.webp', 'LaDainian Tomlinson', '{"americanfootball_nfl"}', 3),
  ('td-04-randy-moss.webp', 'Randy Moss', '{"americanfootball_nfl"}', 4),
  ('td-05-terrell-owens.webp', 'Terrell Owens', '{"americanfootball_nfl"}', 5),
  ('td-06-marcus-allen.webp', 'Marcus Allen', '{"americanfootball_nfl"}', 6),
  ('td-07-marshall-faulk.webp', 'Marshall Faulk', '{"americanfootball_nfl"}', 7),
  ('td-08-cris-carter.webp', 'Cris Carter', '{"americanfootball_nfl"}', 8),
  ('td-09-marvin-harrison.webp', 'Marvin Harrison', '{"americanfootball_nfl"}', 9),
  ('td-10-derrick-henry.webp', 'Derrick Henry', '{"americanfootball_nfl"}', 10),
  ('td-11-jim-brown.webp', 'Jim Brown', '{"americanfootball_nfl"}', 11),
  ('td-12-adrian-peterson.webp', 'Adrian Peterson', '{"americanfootball_nfl"}', 12),
  ('td-13-walter-payton.webp', 'Walter Payton', '{"americanfootball_nfl"}', 13),
  ('td-14-larry-fitzgerald.webp', 'Larry Fitzgerald', '{"americanfootball_nfl"}', 14)
ON CONFLICT (filename) DO UPDATE SET label = EXCLUDED.label, formats = EXCLUDED.formats, sort_order = EXCLUDED.sort_order;
