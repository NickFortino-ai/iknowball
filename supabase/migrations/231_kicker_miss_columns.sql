-- Missed-FG columns so traditional fantasy leagues can apply per-range
-- miss penalties (e.g. Yahoo defaults: -3 under 40, -2 40-49, -1 50+).
-- Sleeper returns these as fgmiss_0_19 / 20_29 / 30_39 / 40_49 / 50p; we
-- collapse to the same three buckets as fgm_* so the editor stays tidy.

ALTER TABLE nfl_player_stats
  ADD COLUMN IF NOT EXISTS fgmiss_0_39 INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fgmiss_40_49 INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fgmiss_50_plus INTEGER DEFAULT 0;
