-- Fixes migration 275, which added the team column but left uniqueness
-- unusable for upserts.
--
-- Two problems with 275:
--   1. Partial indexes (WHERE team IS NULL / IS NOT NULL) cannot serve as
--      an ON CONFLICT target unless the statement repeats the same WHERE,
--      which PostgREST doesn't emit. Upserts failed with "no unique or
--      exclusion constraint matching the ON CONFLICT specification".
--   2. The original UNIQUE (player_name, sport_key) is still in force, so
--      a Rams Byron Young and an Eagles Byron Young could never coexist —
--      the whole point of adding team.
--
-- NULLS NOT DISTINCT keeps NULL meaning "applies to every player with this
-- name" while still preventing two such rows. Requires PG15+, which
-- Supabase is on.

DROP INDEX IF EXISTS idx_ppo_name_sport_team;
DROP INDEX IF EXISTS idx_ppo_name_sport_noteam;

-- Drop whatever unique constraint covers exactly (player_name, sport_key),
-- by lookup rather than by guessed name.
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  WHERE c.conrelid = 'player_position_overrides'::regclass
    AND c.contype = 'u'
    AND (
      -- ::text cast is required — attname is type `name`, and
      -- name[] has no equality operator against text[].
      SELECT array_agg(a.attname::text ORDER BY a.attname::text)
      FROM unnest(c.conkey) k
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
    ) = ARRAY['player_name', 'sport_key']
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE player_position_overrides DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE player_position_overrides
  DROP CONSTRAINT IF EXISTS ppo_name_sport_team_key;

ALTER TABLE player_position_overrides
  ADD CONSTRAINT ppo_name_sport_team_key
  UNIQUE NULLS NOT DISTINCT (player_name, sport_key, team);
