-- Snap counts on weekly NFL stats.
--
-- Sleeper has been sending these on the exact response syncWeeklyStats
-- already fetches; we were discarding them. Verified against the live
-- endpoint (api.sleeper.com/stats/nfl/2026/5) on 2026-10-14 rather than
-- assumed, because invented Sleeper keys persist as zero and score zero in
-- silence — that has happened three times here already.
--
--   offensive positions return  off_snp, tm_off_snp, tm_st_snp, tm_def_snp
--   defensive positions return  def_snp, tm_def_snp, st_snp, tm_off_snp
--
-- Both halves are real: a WR row carries off_snp, a LB row carries def_snp.
-- Team totals come back on every row regardless of position, which is what
-- makes a share computable without a second lookup.
--
-- NULL, not 0, as the default. A player who did not appear and a player
-- whose snaps we never captured are different facts, and a 0 default would
-- make every pre-2026-week-6 row read as "played no snaps" rather than
-- "unknown". Share calculations must treat NULL as unknown and show nothing.

ALTER TABLE nfl_player_stats
  ADD COLUMN IF NOT EXISTS off_snp    numeric,
  ADD COLUMN IF NOT EXISTS def_snp    numeric,
  ADD COLUMN IF NOT EXISTS st_snp     numeric,
  ADD COLUMN IF NOT EXISTS tm_off_snp numeric,
  ADD COLUMN IF NOT EXISTS tm_def_snp numeric,
  ADD COLUMN IF NOT EXISTS tm_st_snp  numeric;

COMMENT ON COLUMN nfl_player_stats.off_snp IS
  'Offensive snaps played. Share = off_snp / tm_off_snp. NULL means not captured, not zero.';
COMMENT ON COLUMN nfl_player_stats.def_snp IS
  'Defensive snaps played. Share = def_snp / tm_def_snp. NULL means not captured, not zero.';

-- Confirm.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'nfl_player_stats' AND column_name LIKE '%snp%'
ORDER BY column_name;
