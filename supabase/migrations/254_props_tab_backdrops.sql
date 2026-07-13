-- Register the Props tab tile backdrops in league_backdrops so users can
-- also pick them as profile backdrops via the SettingsPage backdrop picker.
-- Files live at client/public/backdrops/props/*.
--
-- Formats tag = the underlying sport key so each backdrop shows up in the
-- profile picker when a user filters by that sport.
INSERT INTO league_backdrops (filename, label, formats) VALUES
  ('props/nba.webp',   'NBA Prop Backdrop',   '{basketball_nba}'),
  ('props/wnba.jpg',   'WNBA Prop Backdrop',  '{basketball_wnba}'),
  ('props/mlb.jpg',    'MLB Prop Backdrop',   '{baseball_mlb}'),
  ('props/nfl.jpg',    'NFL Prop Backdrop',   '{americanfootball_nfl}'),
  ('props/ncaaf.jpg',  'NCAAF Prop Backdrop', '{americanfootball_ncaaf}'),
  ('props/ncaab.webp', 'NCAAB Prop Backdrop', '{basketball_ncaab}')
ON CONFLICT (filename) DO NOTHING;
