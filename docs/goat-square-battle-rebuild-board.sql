-- The GOAT Square Battle — rebuild the board the orphan pruner destroyed.
--
-- WHAT HAPPENED
-- League ac4f4c3c was created 2026-11-17 on Heat @ Knicks Nov 27, game row
-- 18069a44-fc03-4d86-8ac1-de328a46c6a3. Eight people joined and claimed
-- squares over the next three days. On 2026-11-20 13:10 UTC the Odds API
-- re-issued that game under a NEW event id with a start time 10 minutes
-- earlier, so the old row stopped appearing in the feed. syncOdds's orphan
-- pruner counted its dependencies, never looked at squares_boards, saw zero,
-- and deleted the game. games -> squares_boards -> squares_claims are both
-- ON DELETE CASCADE, so the board and every claim went with it.
--
-- The pruner is fixed (commit 22369fde). This repairs the one league it hit.
--
-- WHAT THIS CANNOT DO
-- The claims are NOT recoverable. They were hard-deleted by the cascade and
-- there is no soft-delete or audit copy. Everyone has to pick their squares
-- again. There are 8 members, so tell them before they notice.
--
-- The replacement game row is 25901668-930a-4cc5-9638-6a0acde4c29a, same
-- matchup, start 2026-11-28T00:00:00Z (was 00:10:00Z).

BEGIN;

-- 1. Point the league at the surviving game row, and move its countdown to
--    match the new start time. jsonb_set only rewrites game_id; the rest of
--    settings (team names, assignment_method, points_per_quarter) is left
--    exactly as the commissioner set it.
UPDATE leagues
SET settings   = jsonb_set(settings, '{game_id}', '"25901668-930a-4cc5-9638-6a0acde4c29a"'::jsonb),
    starts_at  = '2026-11-28T00:00:00+00:00',
    ends_at    = '2026-11-28T00:00:00+00:00'
WHERE id = 'ac4f4c3c-6b59-44ff-8d35-58d088f7b680'
  AND format = 'squares';

-- 2. Recreate the board. Row = away (Miami Heat), col = home (New York
--    Knicks), matching what the commissioner chose at creation. Digits stay
--    unlocked so self-select claiming reopens.
INSERT INTO squares_boards (league_id, game_id, row_team_name, col_team_name, digits_locked)
VALUES (
  'ac4f4c3c-6b59-44ff-8d35-58d088f7b680',
  '25901668-930a-4cc5-9638-6a0acde4c29a',
  'Miami Heat',
  'New York Knicks',
  false
)
ON CONFLICT (league_id) DO UPDATE
  SET game_id       = EXCLUDED.game_id,
      row_team_name = EXCLUDED.row_team_name,
      col_team_name = EXCLUDED.col_team_name;

-- 3. Verify before committing. Expect ONE row: board present, game present,
--    0 claims, digits unlocked, tips off 2026-11-28 00:00Z.
SELECT l.name,
       l.starts_at,
       l.settings->>'game_id'      AS league_game_id,
       b.id                        AS board_id,
       b.digits_locked,
       g.away_team || ' @ ' || g.home_team AS matchup,
       g.starts_at                 AS game_starts_at,
       (SELECT count(*) FROM squares_claims c WHERE c.board_id = b.id) AS claims
FROM leagues l
LEFT JOIN squares_boards b ON b.league_id = l.id
LEFT JOIN games g          ON g.id = b.game_id
WHERE l.id = 'ac4f4c3c-6b59-44ff-8d35-58d088f7b680';

COMMIT;
