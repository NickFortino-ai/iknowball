-- 2026 MLB Postseason bracket template.
--
-- Structure only. TEAM NAMES ARE DELIBERATELY LEFT NULL — the field isn't set
-- until the regular season ends Sun Sep 27, and the Wild Card round starts
-- Sep 30. Fill them in the admin Bracket Template Builder, then flip
-- is_active to true.
--
-- IMPORTANT when you type them: use the EXACT strings from our games table
-- ("St. Louis Cardinals", "Athletics" — no city). Those same strings are what
-- scoreBracketMatchups matches on to auto-advance a series, and what the logo
-- resolver keys on. All 30 resolve today; a typo silently breaks both.
--
-- MLB DOES NOT RESEED, so this bracket is fixed from the start and the
-- feeds_into wiring below is static:
--
--   1 and 2 seeds     bye directly to the Division Series
--   3 vs 6            winner meets the 2 seed
--   4 vs 5            winner meets the 1 seed
--
-- The 1 seed getting the 4/5 winner is what keeps it from facing another
-- division winner in the DS. Wiring these backwards would not surface until
-- the Wild Card round resolved and teams advanced into the wrong slots.
--
-- Series lengths are PER ROUND (requires 7ac13d5c): bo3 Wild Card, bo5
-- Division Series, bo7 from the LCS. The picker offers 2-3, 3-5 and 4-7
-- respectively and the auto-advance clinches at 2, 3 and 4 wins.
--
-- No bye MATCHUPS are created. The 1 and 2 seeds simply occupy team_top of
-- their Division Series matchup — fewer rows, and nothing for an entrant to
-- click through that isn't a real pick.

begin;

insert into bracket_templates
  (id, name, sport, team_count, description, rounds, regions, is_active, series_format, picks_available_at)
values (
  '67768719-a660-4029-857f-ed3f9d8f7841',
  '2026 MLB Postseason',
  'baseball_mlb',
  12,
  'Wild Card through the World Series. Pick every series winner and how many games it goes.',
  '[
    {"round_number":1,"name":"Wild Card","best_of":3,"points_per_correct":10},
    {"round_number":2,"name":"Division Series","best_of":5,"points_per_correct":20},
    {"round_number":3,"name":"League Championship Series","best_of":7,"points_per_correct":40},
    {"round_number":4,"name":"World Series","best_of":7,"points_per_correct":80}
  ]'::jsonb,
  '["American League","National League"]'::jsonb,
  false,                      -- flip to true once team names are filled in
  'best_of_7',                -- fallback only; every round declares best_of
  -- Written as an ET wall-clock time rather than a UTC literal. The column
  -- is timestamptz either way, so this stores the same kind of value — but a
  -- UTC literal has to be converted in your head to be checked, and that is
  -- how the NBA template ended up opening at 1:00 AM ET (05:00Z). Postgres
  -- resolves the offset, so this is also correct across the DST change on
  -- Nov 1, which the World Series runs past.
  timestamp '2026-09-28 12:00:00' at time zone 'America/New_York'
);

insert into bracket_template_matchups
  (id, template_id, round_number, position, region, seed_top, seed_bottom, feeds_into_matchup_id, feeds_into_slot, is_bye)
values
  -- AL Wild Card: 3 vs 6 -> meets the 2 seed
  ('f7d818d7-64ca-4876-b0ab-516428a90142', '67768719-a660-4029-857f-ed3f9d8f7841', 1, 1, 'American League', 3, 6, '36cb0446-4d59-4d3f-8c46-b5bdec05ffb6', 'bottom', false),
  -- AL Wild Card: 4 vs 5 -> meets the 1 seed
  ('876da11b-6833-4c5f-8802-7e696b4d3f73', '67768719-a660-4029-857f-ed3f9d8f7841', 1, 2, 'American League', 4, 5, '0336fea2-27f9-455b-b178-5cf0bbf6ef96', 'bottom', false),
  -- NL Wild Card: 3 vs 6 -> meets the 2 seed
  ('7b87adc6-20aa-423b-9ea9-2784c3d0d0f0', '67768719-a660-4029-857f-ed3f9d8f7841', 1, 3, 'National League', 3, 6, '35ae891e-dabb-4435-a0ae-2af2042c948a', 'bottom', false),
  -- NL Wild Card: 4 vs 5 -> meets the 1 seed
  ('8160349e-55e5-4104-8b29-df77942bb7db', '67768719-a660-4029-857f-ed3f9d8f7841', 1, 4, 'National League', 4, 5, '61cb6650-ce71-428e-866e-6cf9ed0abb94', 'bottom', false),
  -- ALDS: 1 seed (bye) vs 4/5 winner
  ('0336fea2-27f9-455b-b178-5cf0bbf6ef96', '67768719-a660-4029-857f-ed3f9d8f7841', 2, 1, 'American League', 1, null, 'eed2c26e-c282-4296-8bbc-2e5b6399308c', 'top', false),
  -- ALDS: 2 seed (bye) vs 3/6 winner
  ('36cb0446-4d59-4d3f-8c46-b5bdec05ffb6', '67768719-a660-4029-857f-ed3f9d8f7841', 2, 2, 'American League', 2, null, 'eed2c26e-c282-4296-8bbc-2e5b6399308c', 'bottom', false),
  -- NLDS: 1 seed (bye) vs 4/5 winner
  ('61cb6650-ce71-428e-866e-6cf9ed0abb94', '67768719-a660-4029-857f-ed3f9d8f7841', 2, 3, 'National League', 1, null, '443eda8f-b8b2-48a6-ba3e-3111026e256d', 'top', false),
  -- NLDS: 2 seed (bye) vs 3/6 winner
  ('35ae891e-dabb-4435-a0ae-2af2042c948a', '67768719-a660-4029-857f-ed3f9d8f7841', 2, 4, 'National League', 2, null, '443eda8f-b8b2-48a6-ba3e-3111026e256d', 'bottom', false),
  -- ALCS
  ('eed2c26e-c282-4296-8bbc-2e5b6399308c', '67768719-a660-4029-857f-ed3f9d8f7841', 3, 1, 'American League', null, null, '9784c617-62dd-4842-9d1c-9f2284804b27', 'top', false),
  -- NLCS
  ('443eda8f-b8b2-48a6-ba3e-3111026e256d', '67768719-a660-4029-857f-ed3f9d8f7841', 3, 2, 'National League', null, null, '9784c617-62dd-4842-9d1c-9f2284804b27', 'bottom', false),
  -- World Series
  ('9784c617-62dd-4842-9d1c-9f2284804b27', '67768719-a660-4029-857f-ed3f9d8f7841', 4, 1, null, null, null, null, null, false);

commit;

-- VERIFY — expect 11 matchups: 4 Wild Card, 4 Division Series, 2 LCS, 1 WS
--
--   select round_number, count(*)
--   from   bracket_template_matchups
--   where  template_id = '67768719-a660-4029-857f-ed3f9d8f7841'
--   group  by round_number order by round_number;
--
-- And that every non-final matchup feeds somewhere (expect 10):
--
--   select count(*) from bracket_template_matchups
--   where  template_id = '67768719-a660-4029-857f-ed3f9d8f7841' and feeds_into_matchup_id is not null;
