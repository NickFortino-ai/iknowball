-- WNBA DFS backdrop catalog. Mirrors the per-contest pattern (HR Derby,
-- 3-Point, etc.) — uses a dedicated format key 'wnba_dfs_contest' so the
-- selection doesn't bleed into other WNBA league formats. Sort order:
-- most recent champions first, then earlier champions, then non-title
-- imagery last.

INSERT INTO league_backdrops (filename, label, formats, sort_order) VALUES
  ('wdfs-aces-2025.webp',     'Aces 2025',         '{"wnba_dfs_contest"}', 1),
  ('wdfs-liberty-2024.webp',  'Liberty 2024',      '{"wnba_dfs_contest"}', 2),
  ('wdfs-aces-2023.webp',     'Aces 2023',         '{"wnba_dfs_contest"}', 3),
  ('wdfs-aces-2022.webp',     'Aces 2022',         '{"wnba_dfs_contest"}', 4),
  ('wdfs-sky-2021.webp',      'Sky 2021',          '{"wnba_dfs_contest"}', 5),
  ('wdfs-storm-2020.webp',    'Storm 2020',        '{"wnba_dfs_contest"}', 6),
  ('wdfs-allstars-2025.webp', 'All-Stars 2025',    '{"wnba_dfs_contest"}', 7),
  ('wdfs-allstars-team.webp', 'All-Stars',         '{"wnba_dfs_contest"}', 8),
  ('wdfs-inaugural.webp',     'Inaugural Season',  '{"wnba_dfs_contest"}', 9),
  ('wdfs-wnba.webp',          'WNBA',              '{"wnba_dfs_contest"}', 10)
ON CONFLICT (filename) DO UPDATE
  SET label = EXCLUDED.label,
      formats = EXCLUDED.formats,
      sort_order = EXCLUDED.sort_order;
