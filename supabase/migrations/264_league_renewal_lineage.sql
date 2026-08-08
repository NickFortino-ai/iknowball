-- League renewal lineage.
--
-- When a fantasy league completes at season's end, the commissioner can
-- "Renew" it into a fresh league for the next season with the same
-- settings and (optionally) the same members. The new league keeps a
-- pointer back to the prior season's league_id so any "League History"
-- surface can walk the chain and show prior champions + standings.
--
-- parent_league_id is nullable so the vast majority of leagues (those
-- with no prior season) don't need to backfill anything. season_ordinal
-- defaults to 1 so an ordinary league reads as its own first season.
-- On renewal the new row gets parent's ordinal + 1 (see renewLeague
-- service).

ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS parent_league_id UUID
    REFERENCES leagues(id) ON DELETE SET NULL;

ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS season_ordinal INT NOT NULL DEFAULT 1;

-- Fast lookups for a lineage walk (given any league, find its ancestors
-- and descendants).
CREATE INDEX IF NOT EXISTS idx_leagues_parent_league_id
  ON leagues(parent_league_id);
