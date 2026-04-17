-- Undo premature pick'em league completion caused by incorrect ends_at storage.
-- The saveDate() client function sent a full ISO timestamp instead of a date-only
-- string, bypassing the server's end-of-sports-day logic. This caused leagues with
-- ends_at on 2026-04-17 to complete at noon UTC instead of 10 AM UTC on 2026-04-18.

-- Find pick'em leagues that were completed today with ends_at on 2026-04-17
-- and reverse all points/notifications.

DO $$
DECLARE
  league_rec RECORD;
  bp_rec RECORD;
  sport_id_val UUID;
BEGIN
  -- Find pick'em leagues completed today that have the bad ends_at timestamp
  -- (noon UTC on Apr 17 instead of 10 AM UTC on Apr 18)
  FOR league_rec IN
    SELECT id, sport, name
    FROM leagues
    WHERE format = 'pickem'
      AND status = 'completed'
      AND ends_at >= '2026-04-17T00:00:00Z'
      AND ends_at <= '2026-04-17T23:59:59Z'
      AND updated_at >= '2026-04-17T00:00:00Z'
  LOOP
    RAISE NOTICE 'Reverting premature completion of league: % (%)', league_rec.name, league_rec.id;

    -- Look up sport_id for sport points reversal
    sport_id_val := NULL;
    IF league_rec.sport IS NOT NULL AND league_rec.sport != 'all' THEN
      SELECT id INTO sport_id_val FROM sports WHERE key = league_rec.sport;
    END IF;

    -- Reverse each bonus_points entry
    FOR bp_rec IN
      SELECT user_id, points, type
      FROM bonus_points
      WHERE league_id = league_rec.id
    LOOP
      -- Reverse global points
      PERFORM increment_user_points(bp_rec.user_id, -bp_rec.points);

      -- Reverse sport points
      IF sport_id_val IS NOT NULL THEN
        PERFORM add_sport_points_only(bp_rec.user_id, sport_id_val, -bp_rec.points);
      END IF;
    END LOOP;

    -- Delete bonus_points entries
    DELETE FROM bonus_points WHERE league_id = league_rec.id;

    -- Delete league_win notifications for this league
    DELETE FROM notifications
    WHERE type = 'league_win'
      AND metadata->>'leagueId' = league_rec.id::text;

    -- Delete league_deleted notifications for this league (if any)
    DELETE FROM notifications
    WHERE type = 'league_deleted'
      AND metadata->>'leagueId' = league_rec.id::text;

    -- Set league back to active with correct ends_at (Apr 18 at 10 AM UTC)
    UPDATE leagues
    SET status = 'active',
        ends_at = '2026-04-18T10:00:00Z',
        updated_at = now()
    WHERE id = league_rec.id;

    RAISE NOTICE 'League % reverted to active, ends_at corrected to 2026-04-18T10:00:00Z', league_rec.id;
  END LOOP;
END $$;
