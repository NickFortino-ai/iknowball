-- 2026 WNBA Playoffs bracket template.
--
-- Structure only. TEAM NAMES LEFT NULL — seeding isn't final until the
-- regular season ends, and the playoffs begin Sunday Sep 27. Fill them in the
-- admin Bracket Template Builder, then flip is_active to true.
--
-- Use the EXACT strings from our games table. Those same strings are what
-- scoreBracketMatchups matches on to advance a series AND what the logo
-- resolver keys on, so a typo silently breaks both:
--
--   Atlanta Dream · Chicago Sky · Connecticut Sun · Dallas Wings
--   Golden State Valkyries · Indiana Fever · Las Vegas Aces
--   Los Angeles Sparks · Minnesota Lynx · New York Liberty
--   Phoenix Mercury · Portland Fire · Seattle Storm · Toronto Tempo
--   Washington Mystics
--
-- ("Nigeria" also appears in that table — an exhibition opponent, not a club.)
--
-- FORMAT. Eight teams seeded 1-8 LEAGUE-WIDE, not by conference, so no
-- regions and no byes. Three rounds of climbing length:
--
--   First Round   best-of-3   clinches at 2
--   Semifinals    best-of-5   clinches at 3
--   WNBA Finals   best-of-7   clinches at 4
--
-- Per-round series lengths need 7ac13d5c deployed. Without it the engine
-- falls back to the template-level flag and a best-of-3 would sit unresolved
-- waiting for a fourth win that never comes.
--
-- Bracket: 1v8 and 4v5 meet in Semifinal 1; 3v6 and 2v7 meet in Semifinal 2 —
-- so the 1 and 2 seeds can only meet in the Finals.

begin;

insert into bracket_templates
  (id, name, sport, team_count, description, rounds, regions, is_active, series_format, picks_available_at)
values (
  'b64e6cfe-d0cf-42f5-a72c-a4925c34c5ab',
  '2026 WNBA Playoffs',
  'basketball_wnba',
  8,
  'First Round through the Finals. Pick every series winner and how many games it goes.',
  '[
    {"round_number":1,"name":"First Round","best_of":3,"points_per_correct":10},
    {"round_number":2,"name":"Semifinals","best_of":5,"points_per_correct":20},
    {"round_number":3,"name":"WNBA Finals","best_of":7,"points_per_correct":40}
  ]'::jsonb,
  null,
  false,                      -- flip once team names are filled in
  'best_of_7',                -- fallback only; every round declares best_of
  timestamp '2026-09-25 12:00:00' at time zone 'America/New_York'
);

insert into bracket_template_matchups
  (id, template_id, round_number, position, region, seed_top, seed_bottom, feeds_into_matchup_id, feeds_into_slot, is_bye)
values
  -- 1 v 8  -> Semifinal 1
  ('0f040019-58f3-442b-8bee-5cdc8937d833', 'b64e6cfe-d0cf-42f5-a72c-a4925c34c5ab', 1, 0, null, 1, 8, '0c72b245-a02a-4e69-a801-4b48279c6fb6', 'top', false),
  -- 4 v 5  -> Semifinal 1
  ('1b9b7add-af5a-4979-95a9-7aed34d70c1f', 'b64e6cfe-d0cf-42f5-a72c-a4925c34c5ab', 1, 1, null, 4, 5, '0c72b245-a02a-4e69-a801-4b48279c6fb6', 'bottom', false),
  -- 3 v 6  -> Semifinal 2
  ('c00e3fc7-9e05-43bd-946c-ac02be26b577', 'b64e6cfe-d0cf-42f5-a72c-a4925c34c5ab', 1, 2, null, 3, 6, '71c04c46-b344-4cfc-bdef-17e63edaaadd', 'top', false),
  -- 2 v 7  -> Semifinal 2
  ('7ef67979-b319-4220-87a8-bf921ef21bf5', 'b64e6cfe-d0cf-42f5-a72c-a4925c34c5ab', 1, 3, null, 2, 7, '71c04c46-b344-4cfc-bdef-17e63edaaadd', 'bottom', false),
  -- Semifinal 1
  ('0c72b245-a02a-4e69-a801-4b48279c6fb6', 'b64e6cfe-d0cf-42f5-a72c-a4925c34c5ab', 2, 0, null, null, null, '592fede4-82da-4c0b-b597-9f1c06a1e849', 'top', false),
  -- Semifinal 2
  ('71c04c46-b344-4cfc-bdef-17e63edaaadd', 'b64e6cfe-d0cf-42f5-a72c-a4925c34c5ab', 2, 1, null, null, null, '592fede4-82da-4c0b-b597-9f1c06a1e849', 'bottom', false),
  -- WNBA Finals
  ('592fede4-82da-4c0b-b597-9f1c06a1e849', 'b64e6cfe-d0cf-42f5-a72c-a4925c34c5ab', 3, 0, null, null, null, null, null, false);

commit;

-- VERIFY — expect 7 matchups: 4 First Round, 2 Semifinals, 1 Finals
--
--   select round_number, count(*) from bracket_template_matchups
--   where  template_id = 'b64e6cfe-d0cf-42f5-a72c-a4925c34c5ab' group by round_number order by round_number;
