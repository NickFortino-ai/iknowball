-- Rename TD Survivor backdrops from numbered full-name to first-name-only
UPDATE league_backdrops SET filename = 'td-jerry.webp' WHERE filename = 'td-01-jerry-rice.webp';
UPDATE league_backdrops SET filename = 'td-emmitt.webp' WHERE filename = 'td-02-emmitt-smith.webp';
UPDATE league_backdrops SET filename = 'td-ladainian.webp' WHERE filename = 'td-03-ladainian-tomlinson.webp';
UPDATE league_backdrops SET filename = 'td-randy.webp' WHERE filename = 'td-04-randy-moss.webp';
UPDATE league_backdrops SET filename = 'td-terrell.webp' WHERE filename = 'td-05-terrell-owens.webp';
UPDATE league_backdrops SET filename = 'td-marcus.webp' WHERE filename = 'td-06-marcus-allen.webp';
UPDATE league_backdrops SET filename = 'td-marshall.webp' WHERE filename = 'td-07-marshall-faulk.webp';
UPDATE league_backdrops SET filename = 'td-cris.webp' WHERE filename = 'td-08-cris-carter.webp';
UPDATE league_backdrops SET filename = 'td-marvin.webp' WHERE filename = 'td-09-marvin-harrison.webp';
UPDATE league_backdrops SET filename = 'td-derrick.webp' WHERE filename = 'td-10-derrick-henry.webp';
UPDATE league_backdrops SET filename = 'td-jim.webp' WHERE filename = 'td-11-jim-brown.webp';
UPDATE league_backdrops SET filename = 'td-adrian.webp' WHERE filename = 'td-12-adrian-peterson.webp';
UPDATE league_backdrops SET filename = 'td-walter.webp' WHERE filename = 'td-13-walter-payton.webp';
UPDATE league_backdrops SET filename = 'td-larry.webp' WHERE filename = 'td-14-larry-fitzgerald.webp';

-- Add remaining TD Survivor backdrops (15-20) with first-name-only naming
INSERT INTO league_backdrops (filename, label, formats, sort_order) VALUES
  ('td-antonio.webp', 'Antonio', '{"touchdown_survivor"}', 15),
  ('td-lenny.webp', 'Lenny', '{"touchdown_survivor"}', 16),
  ('td-shaun.webp', 'Shaun', '{"touchdown_survivor"}', 17),
  ('td-tony.webp', 'Tony', '{"touchdown_survivor"}', 18),
  ('td-john.webp', 'John', '{"touchdown_survivor"}', 19),
  ('td-davante.webp', 'Davante', '{"touchdown_survivor"}', 20)
ON CONFLICT (filename) DO UPDATE SET label = EXCLUDED.label, formats = EXCLUDED.formats, sort_order = EXCLUDED.sort_order;

-- Add TD Pass Competition backdrops (ordered by all-time passing TD leaders)
INSERT INTO league_backdrops (filename, label, formats, sort_order) VALUES
  ('tdp-tom.webp', 'Tom', '{"td_pass_competition"}', 1),
  ('tdp-drew.webp', 'Drew', '{"td_pass_competition"}', 2),
  ('tdp-peyton.webp', 'Peyton', '{"td_pass_competition"}', 3),
  ('tdp-brett.webp', 'Brett', '{"td_pass_competition"}', 4),
  ('tdp-aaron.webp', 'Aaron', '{"td_pass_competition"}', 5),
  ('tdp-philip.webp', 'Philip', '{"td_pass_competition"}', 6),
  ('tdp-dan.webp', 'Dan', '{"td_pass_competition"}', 7),
  ('tdp-ben.webp', 'Ben', '{"td_pass_competition"}', 8),
  ('tdp-matt.webp', 'Matt', '{"td_pass_competition"}', 9),
  ('tdp-matthew.webp', 'Matthew', '{"td_pass_competition"}', 10),
  ('tdp-eli.webp', 'Eli', '{"td_pass_competition"}', 11),
  ('tdp-fran.webp', 'Fran', '{"td_pass_competition"}', 12),
  ('tdp-russell.webp', 'Russell', '{"td_pass_competition"}', 13),
  ('tdp-john.webp', 'John', '{"td_pass_competition"}', 14),
  ('tdp-carson.webp', 'Carson', '{"td_pass_competition"}', 15),
  ('tdp-warren.webp', 'Warren', '{"td_pass_competition"}', 16),
  ('tdp-johnny.webp', 'Johnny', '{"td_pass_competition"}', 17),
  ('tdp-vinny.webp', 'Vinny', '{"td_pass_competition"}', 18),
  ('tdp-joe.webp', 'Joe', '{"td_pass_competition"}', 19),
  ('tdp-kirk.webp', 'Kirk', '{"td_pass_competition"}', 20)
ON CONFLICT (filename) DO UPDATE SET label = EXCLUDED.label, formats = EXCLUDED.formats, sort_order = EXCLUDED.sort_order;

-- Update any leagues already using old numbered TD filenames
UPDATE leagues SET backdrop_image = 'td-jerry.webp' WHERE backdrop_image = 'td-01-jerry-rice.webp';
UPDATE leagues SET backdrop_image = 'td-emmitt.webp' WHERE backdrop_image = 'td-02-emmitt-smith.webp';
UPDATE leagues SET backdrop_image = 'td-ladainian.webp' WHERE backdrop_image = 'td-03-ladainian-tomlinson.webp';
UPDATE leagues SET backdrop_image = 'td-randy.webp' WHERE backdrop_image = 'td-04-randy-moss.webp';
UPDATE leagues SET backdrop_image = 'td-terrell.webp' WHERE backdrop_image = 'td-05-terrell-owens.webp';
UPDATE leagues SET backdrop_image = 'td-marcus.webp' WHERE backdrop_image = 'td-06-marcus-allen.webp';
UPDATE leagues SET backdrop_image = 'td-marshall.webp' WHERE backdrop_image = 'td-07-marshall-faulk.webp';
UPDATE leagues SET backdrop_image = 'td-cris.webp' WHERE backdrop_image = 'td-08-cris-carter.webp';
UPDATE leagues SET backdrop_image = 'td-marvin.webp' WHERE backdrop_image = 'td-09-marvin-harrison.webp';
UPDATE leagues SET backdrop_image = 'td-derrick.webp' WHERE backdrop_image = 'td-10-derrick-henry.webp';
UPDATE leagues SET backdrop_image = 'td-jim.webp' WHERE backdrop_image = 'td-11-jim-brown.webp';
UPDATE leagues SET backdrop_image = 'td-adrian.webp' WHERE backdrop_image = 'td-12-adrian-peterson.webp';
UPDATE leagues SET backdrop_image = 'td-walter.webp' WHERE backdrop_image = 'td-13-walter-payton.webp';
UPDATE leagues SET backdrop_image = 'td-larry.webp' WHERE backdrop_image = 'td-14-larry-fitzgerald.webp';
UPDATE leagues SET backdrop_image = 'td-antonio.webp' WHERE backdrop_image = 'td-15-antonio-gates.webp';
UPDATE leagues SET backdrop_image = 'td-lenny.webp' WHERE backdrop_image = 'td-16-lenny-moore.webp';
UPDATE leagues SET backdrop_image = 'td-shaun.webp' WHERE backdrop_image = 'td-17-shaun-alexander.webp';
UPDATE leagues SET backdrop_image = 'td-tony.webp' WHERE backdrop_image = 'td-18-tony-gonzalez.webp';
UPDATE leagues SET backdrop_image = 'td-john.webp' WHERE backdrop_image = 'td-19-john-riggins.webp';
UPDATE leagues SET backdrop_image = 'td-davante.webp' WHERE backdrop_image = 'td-20-davante-adams.webp';
