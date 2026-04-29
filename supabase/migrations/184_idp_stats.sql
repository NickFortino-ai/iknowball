-- Individual Defensive Player (IDP) stat columns
-- Sleeper returns per-player defensive stats with idp_* keys for defenders
-- (DE, DT, LB, CB, S, etc). These are orthogonal to the existing def_*
-- columns, which carry team-defense totals on DEF rows. Sacks Contest +
-- Interceptions Contest (and any future tackles/QB-hit contests) read from
-- these.

ALTER TABLE nfl_player_stats
  ADD COLUMN IF NOT EXISTS idp_sack NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idp_int INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idp_tkl_solo NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idp_tkl_ast NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idp_tkl_loss NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idp_qb_hit NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idp_pass_def NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idp_ff INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idp_fum_rec INTEGER DEFAULT 0;
