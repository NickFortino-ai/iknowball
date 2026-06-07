-- Football brackets (UFL, NCAAF, NFL playoffs) need three "top performer"
-- rows per team — top passer, top rusher, top receiver — because a football
-- box score has no single PTS column comparable to NBA/NHL. Extend
-- game_top_scorers with a `category` column and replace the
-- (game_id, team) unique constraint so multiple rows can coexist per team.

ALTER TABLE game_top_scorers
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'overall';

-- stat_line is the human-readable display string (e.g. "242 yds, 2 TD").
-- NBA/NHL rows leave it NULL and the modal falls back to "{points} pts".
ALTER TABLE game_top_scorers
  ADD COLUMN IF NOT EXISTS stat_line TEXT;

-- Swap the unique constraint.
ALTER TABLE game_top_scorers
  DROP CONSTRAINT IF EXISTS game_top_scorers_game_id_team_key;

ALTER TABLE game_top_scorers
  ADD CONSTRAINT game_top_scorers_game_team_category_key
  UNIQUE (game_id, team, category);
