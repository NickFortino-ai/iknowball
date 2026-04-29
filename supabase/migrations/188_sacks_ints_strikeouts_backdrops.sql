-- Backdrop catalogs for Sacks, Interceptions, and Strikeouts contests.
-- Display order = sort_order; labels are first names exactly as the
-- commissioner supplied them.

INSERT INTO league_backdrops (filename, label, formats, sort_order) VALUES
  -- Sacks Contest (alphabetical by first name as supplied)
  ('sc-bruce.webp',   'Bruce',   '{"sacks_contest"}', 1),
  ('sc-chris.webp',   'Chris',   '{"sacks_contest"}', 2),
  ('sc-julius.webp',  'Julius',  '{"sacks_contest"}', 3),
  ('sc-kevin.webp',   'Kevin',   '{"sacks_contest"}', 4),
  ('sc-michael.webp', 'Michael', '{"sacks_contest"}', 5),
  ('sc-reggie.webp',  'Reggie',  '{"sacks_contest"}', 6),

  -- Interceptions Contest
  ('ic-charles.webp', 'Charles', '{"ints_contest"}', 1),
  ('ic-darren.webp',  'Darren',  '{"ints_contest"}', 2),
  ('ic-dick.webp',    'Dick',    '{"ints_contest"}', 3),
  ('ic-ed.webp',      'Ed',      '{"ints_contest"}', 4),
  ('ic-emlen.webp',   'Emlen',   '{"ints_contest"}', 5),
  ('ic-ken.webp',     'Ken',     '{"ints_contest"}', 6),
  ('ic-paul.webp',    'Paul',    '{"ints_contest"}', 7),
  ('ic-rod.webp',     'Rod',     '{"ints_contest"}', 8),
  ('ic-ronnie.webp',  'Ronnie',  '{"ints_contest"}', 9),

  -- Strikeouts Contest
  ('kc-bert.webp',    'Bert',    '{"strikeouts_contest"}', 1),
  ('kc-don.webp',     'Don',     '{"strikeouts_contest"}', 2),
  ('kc-justin.webp',  'Justin',  '{"strikeouts_contest"}', 3),
  ('kc-nolan.webp',   'Nolan',   '{"strikeouts_contest"}', 4),
  ('kc-randy.webp',   'Randy',   '{"strikeouts_contest"}', 5),
  ('kc-roger.webp',   'Roger',   '{"strikeouts_contest"}', 6),
  ('kc-steve.webp',   'Steve',   '{"strikeouts_contest"}', 7),
  ('kc-tom.webp',     'Tom',     '{"strikeouts_contest"}', 8)
ON CONFLICT (filename) DO UPDATE
  SET label = EXCLUDED.label,
      formats = EXCLUDED.formats,
      sort_order = EXCLUDED.sort_order;
