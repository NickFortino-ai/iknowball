-- Receptions Contest backdrop catalog. The set is the all-time NFL
-- receptions leaders top 10, displayed in rank order. Six players have
-- images that also live in the TD Survivor pool — they're re-encoded under
-- the 'rec-' prefix here so swapping a backdrop in one contest doesn't
-- affect the other.

INSERT INTO league_backdrops (filename, label, formats, sort_order) VALUES
  ('rec-jerry.webp',   'Jerry',   '{"receptions_contest"}', 1),
  ('rec-larry.webp',   'Larry',   '{"receptions_contest"}', 2),
  ('rec-tony.webp',    'Tony',    '{"receptions_contest"}', 3),
  ('rec-jason.webp',   'Jason',   '{"receptions_contest"}', 4),
  ('rec-marvin.webp',  'Marvin',  '{"receptions_contest"}', 5),
  ('rec-cris.webp',    'Cris',    '{"receptions_contest"}', 6),
  ('rec-tim.webp',     'Tim',     '{"receptions_contest"}', 7),
  ('rec-travis.webp',  'Travis',  '{"receptions_contest"}', 8),
  ('rec-terrell.webp', 'Terrell', '{"receptions_contest"}', 9),
  ('rec-anquan.webp',  'Anquan',  '{"receptions_contest"}', 10)
ON CONFLICT (filename) DO UPDATE
  SET label = EXCLUDED.label,
      formats = EXCLUDED.formats,
      sort_order = EXCLUDED.sort_order;
