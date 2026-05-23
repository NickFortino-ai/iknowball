-- HR Derby backdrop catalog. Set is the all-time MLB home-run leaders
-- top 9, displayed in rank order.

INSERT INTO league_backdrops (filename, label, formats, sort_order) VALUES
  ('hr-barry.webp',  'Barry',  '{"hr_derby_contest"}', 1),
  ('hr-hank.webp',   'Hank',   '{"hr_derby_contest"}', 2),
  ('hr-babe.webp',   'Babe',   '{"hr_derby_contest"}', 3),
  ('hr-albert.webp', 'Albert', '{"hr_derby_contest"}', 4),
  ('hr-alex.webp',   'Alex',   '{"hr_derby_contest"}', 5),
  ('hr-willie.webp', 'Willie', '{"hr_derby_contest"}', 6),
  ('hr-ken.webp',    'Ken',    '{"hr_derby_contest"}', 7),
  ('hr-jim.webp',    'Jim',    '{"hr_derby_contest"}', 8),
  ('hr-sammy.webp',  'Sammy',  '{"hr_derby_contest"}', 9)
ON CONFLICT (filename) DO UPDATE
  SET label = EXCLUDED.label,
      formats = EXCLUDED.formats,
      sort_order = EXCLUDED.sort_order;
