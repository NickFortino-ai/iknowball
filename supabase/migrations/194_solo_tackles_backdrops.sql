-- Solo Tackles Contest backdrop catalog.
-- Each filename maps to a .webp at client/public/backdrops/<filename> and a
-- 1000x525 .jpg thumbnail at client/public/backdrops/og/<basename>.jpg for
-- the OG share card. Labels are first names of the commissioner's curated
-- tackle leaders. Format key 'tackles_contest' lines up with
-- getBackdropFilterKey() in client/src/lib/backdropUrl.js.

-- Sort order follows the date-added order in the commissioner's IKB Images
-- folder (Finder "by Date Added" oldest first), matching the convention
-- used for the sacks / ints / strikeouts backdrops in migration 188.
INSERT INTO league_backdrops (filename, label, formats, sort_order) VALUES
  ('stc-ray.webp',     'Ray',     '{"tackles_contest"}', 1),
  ('stc-london.webp',  'London',  '{"tackles_contest"}', 2),
  ('stc-derrick.webp', 'Derrick', '{"tackles_contest"}', 3),
  ('stc-lavonte.webp', 'Lavonte', '{"tackles_contest"}', 4),
  ('stc-bobby.webp',   'Bobby',   '{"tackles_contest"}', 5),
  ('stc-donnie.webp',  'Donnie',  '{"tackles_contest"}', 6),
  ('stc-zach.webp',    'Zach',    '{"tackles_contest"}', 7)
ON CONFLICT (filename) DO UPDATE
  SET label = EXCLUDED.label,
      formats = EXCLUDED.formats,
      sort_order = EXCLUDED.sort_order;
