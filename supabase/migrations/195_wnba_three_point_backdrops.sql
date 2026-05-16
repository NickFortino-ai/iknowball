-- WNBA 3-Point Contest backdrop catalog. Mirrors the NBA pattern from
-- migration 183 (prefix 'tpc-' for NBA; 'wtpc-' for WNBA). Format key
-- 'wnba_three_point_contest' lines up with getBackdropFilterKey() for
-- format = 'wnba_three_point'. Sort order follows Finder "by Date Added"
-- in the IKB Images / WNBA 3 Point Contest folder.

INSERT INTO league_backdrops (filename, label, formats, sort_order) VALUES
  ('wtpc-diana.webp',   'Diana',   '{"wnba_three_point_contest"}', 1),
  ('wtpc-sue.webp',     'Sue',     '{"wnba_three_point_contest"}', 2),
  ('wtpc-katie.webp',   'Katie',   '{"wnba_three_point_contest"}', 3),
  ('wtpc-becky.webp',   'Becky',   '{"wnba_three_point_contest"}', 4),
  ('wtpc-caitlin.webp', 'Caitlin', '{"wnba_three_point_contest"}', 5),
  ('wtpc-tina.webp',    'Tina',    '{"wnba_three_point_contest"}', 6)
ON CONFLICT (filename) DO UPDATE
  SET label = EXCLUDED.label,
      formats = EXCLUDED.formats,
      sort_order = EXCLUDED.sort_order;
