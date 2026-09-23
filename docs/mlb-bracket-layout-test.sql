-- THROWAWAY: MLB bracket LAYOUT TEST.
--
-- Exists only so the 12-team shape can be looked at before the real field is
-- known. Every existing template is a power of two (16, 32, 64/68); a bracket
-- where round 1 has four matchups and round 2 has four — half their slots
-- pre-filled by byes — is a shape this UI has never drawn. Better to find a
-- layout problem today than on Sep 30.
--
-- Teams are real clubs, NOT a prediction and not the actual field. Real names
-- are used deliberately so LOGOS resolve — placeholders like "AL #3 Seed"
-- would render blank and hide exactly the problem we are looking for.
--
-- is_active = true so it appears in Create League. DELETE IT when you're done:
--
--   delete from bracket_template_matchups where template_id = 'd62ca2ac-afc2-4a6c-acc1-b8d0a715fc7b';
--   delete from bracket_templates          where id          = 'd62ca2ac-afc2-4a6c-acc1-b8d0a715fc7b';
--
-- (Delete any test league you made from it first, or the FK will stop you —
--  migration 078 made these non-cascading on purpose.)

begin;

insert into bracket_templates
  (id, name, sport, team_count, description, rounds, regions, is_active, series_format, picks_available_at)
values (
  'd62ca2ac-afc2-4a6c-acc1-b8d0a715fc7b',
  'TEST — MLB Bracket Layout (delete me)',
  'baseball_mlb',
  12,
  'Layout check only. Teams are placeholders, not a prediction.',
  '[
    {"round_number":1,"name":"Wild Card","best_of":3,"points_per_correct":10},
    {"round_number":2,"name":"Division Series","best_of":5,"points_per_correct":20},
    {"round_number":3,"name":"League Championship Series","best_of":7,"points_per_correct":40},
    {"round_number":4,"name":"World Series","best_of":7,"points_per_correct":80}
  ]'::jsonb,
  '["American League","National League"]'::jsonb,
  true,
  'best_of_7',
  timestamp '2026-09-23 00:00:00' at time zone 'America/New_York'
);

insert into bracket_template_matchups
  (id, template_id, round_number, position, region, seed_top, seed_bottom, team_top, team_bottom, feeds_into_matchup_id, feeds_into_slot, is_bye)
values
  -- AL WC 3v6
  ('bbbf77fd-ed24-49a1-8d4a-64490d8d22fc', 'd62ca2ac-afc2-4a6c-acc1-b8d0a715fc7b', 1, 1, 'American League', 3, 6, 'Detroit Tigers', 'Boston Red Sox', '820f6e17-a891-4deb-86ef-ab80e0899771', 'bottom', false),
  -- AL WC 4v5
  ('15f034f4-3efb-4c39-9c25-9653cd2c87df', 'd62ca2ac-afc2-4a6c-acc1-b8d0a715fc7b', 1, 2, 'American League', 4, 5, 'Houston Astros', 'Seattle Mariners', '1f486ad8-dc25-4c56-b875-8226ca9dac97', 'bottom', false),
  -- NL WC 3v6
  ('1e37d6f7-0c4a-4514-aafb-ffaa5838151d', 'd62ca2ac-afc2-4a6c-acc1-b8d0a715fc7b', 1, 3, 'National League', 3, 6, 'Chicago Cubs', 'San Diego Padres', '7fff6d34-d18f-433e-be77-61ff36e703f2', 'bottom', false),
  -- NL WC 4v5
  ('0cfdeeb3-d05b-431a-ac51-2b990ac83af4', 'd62ca2ac-afc2-4a6c-acc1-b8d0a715fc7b', 1, 4, 'National League', 4, 5, 'New York Mets', 'Atlanta Braves', 'e9ca62f8-ce12-4ee6-8442-2223f09750dc', 'bottom', false),
  -- ALDS 1 seed
  ('1f486ad8-dc25-4c56-b875-8226ca9dac97', 'd62ca2ac-afc2-4a6c-acc1-b8d0a715fc7b', 2, 1, 'American League', 1, null, 'New York Yankees', null, 'deae1a3f-03c8-4238-937e-c8a3084cc062', 'top', false),
  -- ALDS 2 seed
  ('820f6e17-a891-4deb-86ef-ab80e0899771', 'd62ca2ac-afc2-4a6c-acc1-b8d0a715fc7b', 2, 2, 'American League', 2, null, 'Toronto Blue Jays', null, 'deae1a3f-03c8-4238-937e-c8a3084cc062', 'bottom', false),
  -- NLDS 1 seed
  ('e9ca62f8-ce12-4ee6-8442-2223f09750dc', 'd62ca2ac-afc2-4a6c-acc1-b8d0a715fc7b', 2, 3, 'National League', 1, null, 'Los Angeles Dodgers', null, '1bcaba19-899c-4ce7-9164-c063da237af6', 'top', false),
  -- NLDS 2 seed
  ('7fff6d34-d18f-433e-be77-61ff36e703f2', 'd62ca2ac-afc2-4a6c-acc1-b8d0a715fc7b', 2, 4, 'National League', 2, null, 'Philadelphia Phillies', null, '1bcaba19-899c-4ce7-9164-c063da237af6', 'bottom', false),
  -- ALCS
  ('deae1a3f-03c8-4238-937e-c8a3084cc062', 'd62ca2ac-afc2-4a6c-acc1-b8d0a715fc7b', 3, 1, 'American League', null, null, null, null, 'e9de3057-80d6-4559-a7a4-b0252dd0fb5d', 'top', false),
  -- NLCS
  ('1bcaba19-899c-4ce7-9164-c063da237af6', 'd62ca2ac-afc2-4a6c-acc1-b8d0a715fc7b', 3, 2, 'National League', null, null, null, null, 'e9de3057-80d6-4559-a7a4-b0252dd0fb5d', 'bottom', false),
  -- World Series
  ('e9de3057-80d6-4559-a7a4-b0252dd0fb5d', 'd62ca2ac-afc2-4a6c-acc1-b8d0a715fc7b', 4, 1, null, null, null, null, null, null, null, false);

commit;
