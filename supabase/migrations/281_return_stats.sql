-- Kick and punt return stats, so return yardage can score in fantasy.
--
-- Until now nfl_player_stats carried return_td and nothing else from special
-- teams -- and return_td was not scored either, so a punt returned for a
-- touchdown was worth zero fantasy points. Return YARDAGE was not stored at
-- all, despite Sleeper sending it every week.
--
-- Sleeper's stats feed provides kr, kr_yd, kr_lng, pr, pr_yd, pr_lng. Only the
-- attempt and yardage columns are added here; the "longest" figures are
-- cosmetic and nothing scores off them.
--
-- Kept as separate kick and punt columns rather than one combined return_yd
-- so the stored data stays faithful to the source. Scoring sums them, which
-- is a rules decision and belongs in the scoring layer, not the schema.

ALTER TABLE nfl_player_stats ADD COLUMN IF NOT EXISTS kr INTEGER DEFAULT 0;
ALTER TABLE nfl_player_stats ADD COLUMN IF NOT EXISTS kr_yd INTEGER DEFAULT 0;
ALTER TABLE nfl_player_stats ADD COLUMN IF NOT EXISTS pr INTEGER DEFAULT 0;
ALTER TABLE nfl_player_stats ADD COLUMN IF NOT EXISTS pr_yd INTEGER DEFAULT 0;

-- Projections are ASYMMETRIC and that is upstream, not a mistake here:
-- Sleeper's projections feed carries pr, pr_td and pr_yd but NO kick-return
-- equivalent. So punt-return yardage can be projected and kick-return yardage
-- cannot. A pure kick returner will therefore out-score his projection most
-- weeks. Adding only what actually exists rather than columns that would sit
-- permanently null.
ALTER TABLE nfl_player_projections ADD COLUMN IF NOT EXISTS pr NUMERIC DEFAULT 0;
ALTER TABLE nfl_player_projections ADD COLUMN IF NOT EXISTS pr_yd NUMERIC DEFAULT 0;
ALTER TABLE nfl_player_projections ADD COLUMN IF NOT EXISTS pr_td NUMERIC DEFAULT 0;
