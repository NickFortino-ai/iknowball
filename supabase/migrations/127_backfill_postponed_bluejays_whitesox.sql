-- One-off backfill: the Blue Jays @ White Sox MLB game settled as 0-0 final
-- but was actually postponed. Mark the game postponed and unsettle the picks
-- so they go back to pending and don't show as losses.
--
-- Targets: any final 0-0 MLB game between Toronto Blue Jays and Chicago White Sox.
-- Should match exactly one row.

DO $$
DECLARE
  target_game_id UUID;
BEGIN
  SELECT g.id INTO target_game_id
  FROM games g
  JOIN sports s ON s.id = g.sport_id
  WHERE s.key = 'baseball_mlb'
    AND g.status = 'final'
    AND g.home_score = 0
    AND g.away_score = 0
    AND g.home_team = 'Chicago White Sox'
    AND g.away_team = 'Toronto Blue Jays'
  ORDER BY g.starts_at DESC
  LIMIT 1;

  IF target_game_id IS NULL THEN
    RAISE NOTICE 'No matching game found — nothing to backfill';
    RETURN;
  END IF;

  -- Refund any points that were awarded for picks on this game
  UPDATE users u
  SET total_points = total_points - COALESCE(p.points_earned, 0)
  FROM picks p
  WHERE p.game_id = target_game_id
    AND p.status = 'settled'
    AND p.user_id = u.id
    AND p.points_earned IS NOT NULL
    AND p.points_earned <> 0;

  -- Unsettle the picks (back to pending, clear correctness/points)
  UPDATE picks
  SET status = 'pending',
      is_correct = NULL,
      points_earned = NULL,
      updated_at = NOW()
  WHERE game_id = target_game_id;

  -- Mark the game postponed
  UPDATE games
  SET status = 'postponed',
      home_score = NULL,
      away_score = NULL,
      winner = NULL,
      updated_at = NOW()
  WHERE id = target_game_id;

  RAISE NOTICE 'Backfilled postponed game %', target_game_id;
END $$;
