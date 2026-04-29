-- 3-Point Contest backdrop catalog. Display order = sort_order; labels are
-- first names exactly as the commissioner supplied them.
INSERT INTO league_backdrops (filename, label, formats, sort_order) VALUES
  ('tpc-steph.webp',  'Steph',  '{"three_point_contest"}', 1),
  ('tpc-james.webp',  'James',  '{"three_point_contest"}', 2),
  ('tpc-ray.webp',    'Ray',    '{"three_point_contest"}', 3),
  ('tpc-klay.webp',   'Klay',   '{"three_point_contest"}', 4),
  ('tpc-dame.webp',   'Dame',   '{"three_point_contest"}', 5),
  ('tpc-lebron.webp', 'LeBron', '{"three_point_contest"}', 6),
  ('tpc-reggie.webp', 'Reggie', '{"three_point_contest"}', 7),
  ('tpc-kyle.webp',   'Kyle',   '{"three_point_contest"}', 8)
ON CONFLICT (filename) DO UPDATE
  SET label = EXCLUDED.label,
      formats = EXCLUDED.formats,
      sort_order = EXCLUDED.sort_order;
