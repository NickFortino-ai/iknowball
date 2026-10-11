-- Rescale existing arcade scores to the new /10 scoring.
--
-- Three rows exist, all memory, all set under the old scale. Left alone they
-- would sit on top of the leaderboard forever — an old 825 against new rounds
-- scoring in the 70s and 80s.
--
-- Rounded the same way the server now rounds, so an old round and an
-- identical new one land on the same number:
--   mossyou  memory 825 -> 83
--   userpick memory 775 -> 78
--   userpick memory 700 -> 70

UPDATE arcade_scores
SET score = ROUND(score / 10.0)
WHERE score > 200;   -- only rows that can still be on the old scale

SELECT u.username, s.game_key, s.score
FROM arcade_scores s
JOIN users u ON u.id = s.user_id
ORDER BY s.score DESC;
